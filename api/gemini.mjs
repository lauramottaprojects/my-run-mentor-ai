import { loadLiveData, digestLiveData } from "../lib/sheets.mjs";
import { GEMINI_MODEL, SPREADSHEET_URL } from "../lib/config.mjs";
import { runFiveAgentPipeline, detectSafetyIssue, safetyReply, PIPELINE_ORDER } from "../lib/pipeline.mjs";

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

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.statusCode = 204, res.end();

  if (req.method === "GET") {
    return json(res, 200, {
      status: "ok",
      service: "My Run Mentor AI",
      model: GEMINI_MODEL,
      live_data: SPREADSHEET_URL,
      agents: PIPELINE_ORDER,
      usage: "POST { message, history?, runner? } to /api/gemini",
    });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      error: "Server misconfigured: GEMINI_API_KEY environment variable is not set",
    });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  const message = String(body.message || "").slice(0, 4000);
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const runner = body.runner && typeof body.runner === "object" ? body.runner : {};

  try {
    const liveData = await loadLiveData();

    if (detectSafetyIssue(message)) {
      return json(res, 200, {
        reply: safetyReply(),
        pipeline: {
          agents: PIPELINE_ORDER,
          steps: [
            { agent: "Researcher", status: "done" },
            { agent: "Designer", status: "done" },
            { agent: "Maker", status: "restricted" },
            { agent: "Communicator", status: "skipped" },
            { agent: "Manager", status: "skipped", decision: "HOLD" },
          ],
          decision: "HOLD",
        },
        data: { digest: digestLiveData(liveData) },
        model: GEMINI_MODEL,
      });
    }

    const result = await runFiveAgentPipeline({
      message,
      history,
      runner,
      liveData,
      apiKey,
    });

    return json(res, 200, {
      reply: result.reply,
      pipeline: { agents: PIPELINE_ORDER, steps: result.steps, decision: result.decision },
      data: { digest: digestLiveData(liveData) },
      model: GEMINI_MODEL,
    });
  } catch (err) {
    return json(res, 500, { error: String((err && err.message) || err) });
  }
}
