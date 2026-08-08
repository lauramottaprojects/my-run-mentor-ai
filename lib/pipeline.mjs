import { GEMINI_API_BASE, GEMINI_MODEL } from "./config.mjs";
import { AGENTS, COMPANY_CONTEXT, PIPELINE_ORDER } from "./prompts.mjs";
import { digestLiveData } from "./sheets.mjs";

export { PIPELINE_ORDER };

const SAFETY_PATTERNS = [
  /chest pain/i,
  /fainting/i,
  /fainted/i,
  /severe breathless/i,
  /can'?t breathe/i,
  /can not breathe/i,
  /medical emergen/i,
  /profuse bleeding/i,
  /call 9?11/i,
];

export function detectSafetyIssue(text) {
  return SAFETY_PATTERNS.some((re) => re.test(String(text || "")));
}

export function safetyReply() {
  return (
    "⚠️ **Please stop and get checked.** You've described symptoms that should not be pushed through " +
    "(chest pain, fainting, or severe breathlessness are medical red flags). Do not run until a healthcare " +
    "professional gives you the all-clear.\n\n" +
    "When you feel ready to come back, I'll rebuild your plan slowly — effort over pace, tiny steps, " +
    "consistent. That part never changes. 🏃"
  );
}

// ---------------------------------------------------------------- Gemini call
export async function callGemini({
  system,
  prompt,
  apiKey,
  maxTokens = 500,
  temperature = 0.7,
  fetchImpl = globalThis.fetch,
}) {
  const url =
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=` +
    encodeURIComponent(apiKey);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

// ---------------------------------------------------------------- five-agent chain
function baseContext(liveData, runner) {
  return (
    COMPANY_CONTEXT +
    "\n\n" +
    "LIVE COHORT DATABASE\n" +
    digestLiveData(liveData) +
    "\n\n" +
    "THIS RUNNER (from onboarding + conversation)\n" +
    JSON.stringify(runner || {}, null, 2)
  );
}

export async function runFiveAgentPipeline({ message, history, runner, liveData, apiKey, fetchImpl }) {
  const context = baseContext(liveData, runner);
  const handoffs = [];
  const steps = [];
  let lastSuccess = null;
  let input = String(message || "");

  for (const agent of AGENTS) {
    const system = [
      `You are ${agent.name}, the agent who ${agent.role}, in the My Run Mentor AI five-agent organisation.`,
      `Personality: ${agent.personality}`,
      `Domain expertise: ${agent.expertise}`,
      "Your task this turn: " + agent.task,
      "You build ONLY on the work of the previous agent. Never jump ahead. Keep your output practical and concise.",
    ].join("\n");

    const prompt = [
      `ORGANISATION CONTEXT (read once, apply throughout)\n${context}`,
      handoffs.length
        ? `HANDOFF FROM EARLIER AGENTS (your input — build on it)\n${handoffs.join("\n\n---\n\n")}`
        : `USER'S ORIGINAL REQUEST\n${input}`,
      history && history.length
        ? `\nRECENT CONVERSATION\n${JSON.stringify(history.slice(-6))}`
        : "",
      `\nNow produce your output as ${agent.name}.`,
    ].join("\n\n");

    try {
      const out = await callGemini({
        system,
        prompt,
        apiKey,
        maxTokens: agent.maxTokens,
        temperature: agent.name === "Manager" ? 0.4 : 0.7,
        fetchImpl,
      });
      steps.push({ agent: agent.name, status: "done" });
      handoffs.push(`${agent.name} (${agent.role}) output:\n${out}`);
      lastSuccess = out;
    } catch (err) {
      steps.push({ agent: agent.name, status: "error" });
      handoffs.push(`${agent.name} (${agent.role}) skipped due to error: ${err.message}`);
    }
    input = `Continue from the handoff above. Do not repeat earlier work.`;
  }

  // Manager's approved text is the final reply; fall back to the last successful
  // agent's output so the chain never ends empty.
  const reply =
    steps[steps.length - 1].status === "done"
      ? lastSuccess
      : handoffs.filter((h) => !/skipped due to error/.test(h)).pop()?.replace(/^.*output:\n/, "") ||
        "I couldn't finish that just now. Could you repeat it?";
  const decision = steps.every((s) => s.status === "done") ? "APPROVED" : "PARTIAL";

  return { reply, steps, decision, handoffs };
}
