#!/usr/bin/env node
// My Run Mentor AI — terminal chat.
// Uses Gemini (gemini-3.1-flash-lite) directly and the LIVE runner database
// hosted in Google Sheets. API key is read from GEMINI_API_KEY env var, or from
// a key file (default: ./gemini-api-key.txt, override with --key-file).
//
// Usage:  node chat.mjs [--key-file PATH] [--model MODEL]
//         /quit   exit      /data   print live database digest
//         /new    restart onboarding
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { loadLiveData, digestLiveData } from "./lib/sheets.mjs";
import { runFiveAgentPipeline, PIPELINE_ORDER } from "./lib/pipeline.mjs";
import { GEMINI_MODEL } from "./lib/config.mjs";

const args = process.argv.slice(2);
const keyFile = args[args.indexOf("--key-file") + 1] || "./gemini-api-key.txt";
const modelIdx = args.indexOf("--model");
const model = modelIdx !== -1 ? args[modelIdx + 1] : GEMINI_MODEL;

let apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  const candidates = [keyFile, "../gemini-api-key.txt", "./gemini-api-key.txt"];
  for (const p of candidates) {
    try {
      apiKey = (await readFile(p, "utf8")).trim();
      if (apiKey) break;
    } catch {
      /* try next */
    }
  }
}
if (!apiKey) {
  console.error(
    `No Gemini API key found. Set GEMINI_API_KEY or provide a file at "${keyFile}".`
  );
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
let eof = false;
const ask = (q) =>
  new Promise((res) => {
    if (rl.closed || eof) return res(null);
    try {
      rl.question(q, res);
    } catch {
      eof = true;
      res(null);
    }
  });
const askLine = async (q) => {
  const v = await ask(q);
  if (v === null) {
    eof = true;
    return "";
  }
  return v;
};

function line(s = "") {
  console.log(s);
}
function divider() {
  line("─".repeat(70));
}

async function onboard() {
  line();
  divider();
  line("🧭  MY RUN MENTOR AI — quick onboarding");
  divider();
  const runner = { data_source: "terminal chat onboarding" };
  const lastRun = await askLine("1. Roughly how long since you last ran consistently (weeks/months)? ");
  const days = await askLine("2. How many days per week can you realistically run? ");
  const feel = await askLine(
    "3. How did your most recent run feel? (e.g. 'good but I pushed hard', 'easy', 'sore shins') "
  );
  const goal = await askLine("4. What are you training towards? (e.g. 'back to 3x/week', 'first 5K') ");
  runner.last_run_gap = lastRun.trim();
  runner.days_per_week = days.trim();
  runner.last_run_feel = feel.trim();
  runner.goal = goal.trim();
  line();
  line("✅  Got it. Five agents (Researcher → Designer → Maker → Communicator → Manager) will work on every reply.");
  return runner;
}

async function loadData() {
  line("⏳ Loading live data from Google Sheets…");
  const data = await loadLiveData({ ttlMs: 30_000 });
  line("✅  Live data loaded.");
  return data;
}

let data = await loadData();
let runner = await onboard();
let history = [];

divider();
line(`🏃  My Run Mentor AI · model ${model}`);
line("Live source: Google Sheets runner database. Type a message, /data, /new or /quit.");
divider();

async function runTurn(text) {
  const before = Date.now();
  line(`\n  ${PIPELINE_ORDER.join(" → ")}`);
  const result = await runFiveAgentPipeline({
    message: text,
    history,
    runner,
    liveData: data,
    apiKey,
  });
  const secs = ((Date.now() - before) / 1000).toFixed(1);
  line(`  [${result.decision} in ${secs}s]\n`);
  line(result.reply);
  line();
  history.push({ role: "user", content: text });
  history.push({ role: "assistant", content: result.reply });
}

for (;;) {
  const input = await ask("You > ");
  if (input === null) break;
  const text = input.trim();
  if (!text) continue;
  if (text.toLowerCase() === "/quit") {
    line("👋  Keep it easy out there. Every run counts.");
    break;
  }
  if (eof) break;
  if (text.toLowerCase() === "/data") {
    line(digestLiveData(data));
    continue;
  }
  if (text.toLowerCase() === "/new") {
    runner = await onboard();
    history = [];
    continue;
  }
  try {
    await runTurn(text);
  } catch (err) {
    line(`⚠️  ${err.message}`);
  }
}

if (!eof) rl.close();
process.exitCode = 0;
