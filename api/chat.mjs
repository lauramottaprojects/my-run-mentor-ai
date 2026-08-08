import { loadKnowledgeBase, buildKnowledgeContext, guessLevelGoal, deriveRunnerFlags, buildRunnerFromAnswers } from "../lib/knowledge.mjs";
import { runFiveAgentPipeline, composeFinalReply, safetyShortCircuit, AGENTS } from "../lib/agents.mjs";
import { GEMINI_MODEL } from "../lib/config.mjs";

export const config = {
  maxDuration: 60,
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function pipelineTrace(result) {
  return {
    agents: AGENTS,
    steps: [
      { agent: "Atlas", status: "done" },
      { agent: "Nova", status: "done" },
      { agent: "Forge", status: "done" },
      { agent: "Spark", status: "done" },
      { agent: "Meridian", status: "done", decision: result.review?.decision || "unknown" },
    ],
    decision: result.review?.decision || "unknown",
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method === "GET") {
    return json(res, 200, {
      status: "ok",
      service: "My Run Mentor AI",
      model: GEMINI_MODEL,
      live_data: "Google Sheets training knowledge base",
      usage: "POST a JSON body { message, history?, runner? } to /api/chat",
    });
  }
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "Server misconfigured: GEMINI_API_KEY environment variable is not set" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  const message = String(body.message || "").slice(0, 4000);
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const runnerRaw = body.runner && typeof body.runner === "object" ? body.runner : {};
  // Runner profile is built from the onboarding answers; level is derived, never self-declared.
  const runner = runnerRaw.answers ? buildRunnerFromAnswers(runnerRaw.answers, runnerRaw) : runnerRaw;

  if (!message.trim() && !Object.keys(runner).length) {
    return json(res, 400, { error: "No message or runner data provided" });
  }

  try {
    const kb = await loadKnowledgeBase();
    const { level, goalType } = guessLevelGoal(runner, message);
    const flags = deriveRunnerFlags(runner, message);
    const knowledge = buildKnowledgeContext(kb, level, goalType, flags);

    const shortCircuit = safetyShortCircuit(knowledge);
    if (shortCircuit) {
      return json(res, 200, {
        reply: shortCircuit,
        pipeline: {
          agents: AGENTS,
          steps: [
            { agent: "Atlas", status: "done" },
            { agent: "Nova", status: "done" },
            { agent: "Forge", status: "restricted" },
            { agent: "Spark", status: "skipped" },
            { agent: "Meridian", status: "skipped", decision: "HOLD" },
          ],
          decision: "HOLD",
        },
        knowledge: knowledgeSummary(knowledge),
        forge_status: "RESTRICTED",
        model: GEMINI_MODEL,
      });
    }

    const result = await runFiveAgentPipeline({
      input: { message, history, runner },
      knowledge,
      apiKey,
    });

    const reply = composeFinalReply(result, knowledge);

    return json(res, 200, {
      reply,
      pipeline: pipelineTrace(result),
      knowledge: knowledgeSummary(knowledge),
      forge_status: result.forgePlan?.status || "unknown",
      model: GEMINI_MODEL,
    });
  } catch (err) {
    return json(res, 500, {
      error: String((err && err.message) || err),
    });
  }
}

function knowledgeSummary(knowledge) {
  return {
    source: knowledge.meta.source,
    spreadsheet_id: knowledge.meta.spreadsheet_id,
    retrieval_time: knowledge.meta.retrieval_time,
    records: {
      plan_templates: knowledge.plan_templates.length,
      session_library: knowledge.session_library.length,
      progression_rules: knowledge.progression_rules.length,
      intensity_guidance: knowledge.intensity_guidance.length,
      safety_rules: knowledge.safety_rules.length,
      training_principles: knowledge.training_principles.length,
    },
    level_context: knowledge.level,
    goal_context: knowledge.goalType,
    safety_flags: knowledge.flags,
  };
}
