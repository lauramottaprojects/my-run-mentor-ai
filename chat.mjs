#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync } from "node:fs";
import { loadKnowledgeBase, buildKnowledgeContext, guessLevelGoal, deriveRunnerFlags, buildRunnerFromAnswers } from "./lib/knowledge.mjs";
import { runFiveAgentPipeline, composeFinalReply, safetyShortCircuit, AGENTS } from "./lib/agents.mjs";
import { DEMO_RUNNERS, GEMINI_MODEL, SPREADSHEET_URL, ONBOARDING_QUESTIONS } from "./lib/config.mjs";

const ART = `
 _ __ ___  _ __ ___   __ _ _ __   _ __ ___   __ _ _ __ ___  _   _ 
| '_ \` _ \\| '_ \` _ \\ / _\` | '_ \\ | '_ \` _ \\ / _\` | '__/ _ \\| | | |
| | | | | | | | | | | (_| | | | | | | | | | | (_| | | | (_) | |_| |
|_| |_| |_|_| |_| |_|\\__,_|_| |_| |_| |_| |_|\\__,_|_|  \\___/ \\__, |
                                                             |___/ `;

const HELP = `
My Run Mentor AI - terminal chat
================================
Answer the 9 onboarding questions to build your runner profile. Your running
level is DERIVED from your answers - you never state it yourself.

Commands:
  /demo [1|2|3]   Use a Garmin-style demonstration runner profile
                  (1 = Beginner 5K, 2 = Recreational 10K, 3 = Advanced half marathon)
  /new            Reset the conversation (answer the questions again)
  /help           Show this help
  /quit           Exit

The plan is produced by the five-agent pipeline:
  Atlas (Researcher) -> Nova (Designer) -> Forge (Maker)
  -> Spark (Communicator) -> Meridian (Manager)
`;

function parseArgs(argv) {
  const args = { key: process.env.GEMINI_API_KEY || "", kbJson: "", demo: null, firstMessage: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--key" || a === "-k") args.key = argv[++i] || "";
    else if (a === "--key-file" || a === "-kf") {
      const f = argv[++i];
      if (f) args.key = readFileSync(f, "utf8").trim();
    } else if (a === "--kb" || a === "--kb-json") args.kbJson = argv[++i] || "";
    else if (a === "--demo") {
      const v = argv[i + 1];
      args.demo = /^[1-3]$/.test(v || "") ? Number(v) : 1;
    } else if (!a.startsWith("--") && !args.firstMessage) args.firstMessage = a;
  }
  return args;
}

function readKbSnapshot(path) {
  const raw = readFileSync(path, "utf8").trim();
  if (path.endsWith(".json") || raw.startsWith("{")) return JSON.parse(raw);
  return { __text: raw };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function now() {
  return new Date().toISOString();
}

async function loadKb(args) {
  if (args.kbJson) {
    const kb = readKbSnapshot(args.kbJson);
    if (!kb.meta) kb.meta = { source: "local snapshot", retrieval_time: now() };
    console.log(`\x1b[90mKnowledge base loaded from local snapshot.\x1b[0m`);
    return kb;
  }
  const t0 = Date.now();
  console.log(`\x1b[90mLoading live training knowledge base from Google Sheets...\x1b[0m`);
  const kb = await loadKnowledgeBase();
  console.log(
    `\x1b[90mLive knowledge base loaded in ${Date.now() - t0}ms from:\x1b[0m ${SPREADSHEET_URL}\n`
  );
  return kb;
}

async function runTurn({ kb, apiKey, runner, history }) {
  const userLine = runner
    ? `[Using ${runner.label}]\n${runnerContextForPrompt(runner)}`
    : "";
  const input = { message: history.length ? history.at(-1).content : "", history, runner };

  const { level, goalType } = guessLevelGoal(runner, history.length ? history.at(-1).content : "");
  const flags = deriveRunnerFlags(runner, history.length ? history.at(-1).content : "");
  const knowledge = buildKnowledgeContext(kb, level, goalType, flags);

  console.log(`\x1b[90mSelected knowledge context: level=${level}, goal=${goalType}, flags=[${flags.join(", ")}]\x1b[0m`);
  if (runner) console.log(`\x1b[90mData source: ${runner.data_source} (not a real Garmin account)\x1b[0m`);

  const shortCircuit = safetyShortCircuit(knowledge);
  if (shortCircuit) {
    console.log(`\x1b[35m\nPipeline: Atlas -> Nova -> Forge -> Meridian: HOLD (safety)\x1b[0m`);
    console.log(shortCircuit);
    console.log("\n" + "-".repeat(64));
    return;
  }

  const steps = [];
  let result;
  try {
    result = await runFiveAgentPipeline({
      input,
      knowledge,
      apiKey,
      onStep: (agent, status, payload) => {
        if (status === "running") process.stdout.write(`\x1b[36m  -> ${agent} is working...\x1b[0m\r`);
        else if (status === "done") {
          process.stdout.write(`\x1b[36m  -> ${agent} complete.\x1b[0m\n`);
          steps.push(agent);
        } else {
          process.stdout.write(`\x1b[31m  -> ${agent} failed.\x1b[0m\n`);
        }
      },
    });
  } catch (err) {
    console.log(`\x1b[31m\nPipeline error: ${err.message}\x1b[0m`);
    return;
  }

  const decision = result.review?.decision || "unknown";
  console.log(`\x1b[35m\nPipeline: ${steps.join(" -> ")} -> Meridian: ${decision}\x1b[0m`);
  console.log(`\x1b[35mDecision rationale: ${result.review?.required_changes_or_rationale || "(none)"}\x1b[0m\n`);

  console.log(composeFinalReply(result, knowledge));
  console.log("\n" + "-".repeat(64));
}

async function runIntake(rl) {
  console.log("\nBuild your runner profile. Answer each question in your own words.\n");
  const answers = {};
  for (const q of ONBOARDING_QUESTIONS) {
    const ans = await rl.question(`\x1b[36m${q.category}\x1b[0m\n${q.question}\n> `);
    if (ans && ans.trim()) answers[q.id] = ans.trim();
  }
  const runner = buildRunnerFromAnswers(answers, { data_source: "manual entry", label: "Your profile" });
  console.log(
    `\n\x1b[36mDerived level:\x1b[0m ${runner.derived_level} | \x1b[36mGoal:\x1b[0m ${runner.goal_type}\n`
  );
  return runner;
}

function runnerContextForPrompt(runner) {
  const { label, data_source: _, ...rest } = runner;
  const lines = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `  ${k}: ${v}`);
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.key) {
    console.error(
      "Missing Gemini API key.\nSet GEMINI_API_KEY or pass --key <key> or --key-file <path>."
    );
    process.exit(1);
  }

  console.log(`\x1b[38;5;214m${ART}\x1b[0m`);
  console.log(`\x1b[1mMy Run Mentor AI\x1b[0m - terminal chat (model: ${GEMINI_MODEL})`);
  console.log(`Data: live Google Sheets training knowledge base`);
  console.log(HELP);

  const kb = await loadKb(args);

  const rl = readline.createInterface({ input, output });
  let runner = args.demo ? DEMO_RUNNERS[args.demo - 1] : null;
  let history = [];
  let queue = Promise.resolve();

  if (!runner && !args.firstMessage) {
    runner = await runIntake(rl);
  }

  const enqueue = (fn) => {
    queue = queue
      .then(fn)
      .catch((err) => console.error(`\x1b[31m${err && err.message ? err.message : err}\x1b[0m`));
  };

  const promptFor = () => (runner ? `\x1b[36m[${runner.label}]\x1b[0m you> ` : "you> ");

  if (args.demo) {
    console.log(`\x1b[36mUsing demonstration profile:\x1b[0m ${DEMO_RUNNERS[args.demo - 1].label}`);
  }

  rl.on("line", (raw) => {
    enqueue(async () => {
      const line = raw.trim();
      const cmd = line.toLowerCase();

      if (cmd === "/quit" || cmd === "exit" || cmd === "/exit") {
        rl.close();
        return;
      }
      if (cmd === "/help" || cmd === "help") {
        console.log(HELP);
        return;
      }
      if (cmd === "/new") {
        runner = null;
        history = [];
        console.log("Conversation reset. Answering the onboarding questions again...");
        runner = await runIntake(rl);
        return;
      }
      if (cmd.startsWith("/demo")) {
        const m = cmd.match(/\/demo\s*([123])?/);
        const idx = m && m[1] ? Number(m[1]) : 1;
        runner = DEMO_RUNNERS[idx - 1] || DEMO_RUNNERS[0];
        history = [];
        console.log(
          `\x1b[36mDemonstration profile selected:\x1b[0m ${runner.label}\n` +
            `\x1b[90mData source: ${runner.data_source} (this prototype does not access a real Garmin account)\x1b[0m`
        );
        return;
      }
      if (!line) return;

      history.push({ role: "user", content: line });
      await runTurn({ kb, apiKey: args.key, runner, history });
      history.push({ role: "assistant", content: "(plan generated)" });
    });
  });

  if (args.firstMessage) {
    enqueue(async () => {
      history.push({ role: "user", content: args.firstMessage });
      await runTurn({ kb, apiKey: args.key, runner, history });
      history.push({ role: "assistant", content: "(plan generated)" });
    });
  }

  await new Promise((resolve) => rl.on("close", resolve));
  await queue;
  console.log("Thanks for running with My Run Mentor AI. Good luck with your training!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
