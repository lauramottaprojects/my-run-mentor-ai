import { readFileSync } from "node:fs";
import { loadKnowledgeBase, buildKnowledgeContext, guessLevelGoal, deriveRunnerFlags } from "../lib/knowledge.mjs";
import { runFiveAgentPipeline, composeFinalReply } from "../lib/agents.mjs";
import { DEMO_RUNNERS } from "../lib/config.mjs";

const args = process.argv.slice(2);
const keyFile = args[args.indexOf("--key-file") + 1];
const demoIdx = Number(args[args.indexOf("--demo") + 1]) || 0;
const key = keyFile ? readFileSync(keyFile, "utf8").trim() : process.env.GEMINI_API_KEY;
if (!key) {
  console.error("Provide the Gemini key: GEMINI_API_KEY env var or --key-file <path>");
  process.exit(1);
}

const runner = DEMO_RUNNERS[demoIdx] ?? DEMO_RUNNERS[0];

const kb = await loadKnowledgeBase();
const { level, goalType } = guessLevelGoal(runner, "");
const flags = deriveRunnerFlags(runner, "");
const knowledge = buildKnowledgeContext(kb, level, goalType, flags);
console.log("KB loaded:", kb.meta.source, kb.meta.retrieval_time);
console.log("KB record counts:", {
  templates: knowledge.plan_templates.length,
  sessions: knowledge.session_library.length,
  progression: knowledge.progression_rules.length,
  intensity: knowledge.intensity_guidance.length,
  safety: knowledge.safety_rules.length,
  principles: knowledge.training_principles.length,
});

const t0 = Date.now();
const result = await runFiveAgentPipeline({
  input: { message: "I want a weekly plan to complete my first 5K.", history: [], runner },
  knowledge,
  apiKey: key,
  onStep: (agent, status) => console.log(`  step ${agent}: ${status}`),
});
console.log("Pipeline took", ((Date.now() - t0) / 1000).toFixed(1), "s");
console.log("Meridian decision:", result.review.decision);
console.log("Forge status:", result.forgePlan.status);
console.log("Sessions:", result.forgePlan.sessions?.length);
console.log("KB records used:", result.forgePlan.knowledge_base_records_used);
console.log("=".repeat(70));
console.log(composeFinalReply(result, knowledge));
