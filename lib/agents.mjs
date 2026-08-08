import { GEMINI_MODEL, GEMINI_API_BASE } from "./config.mjs";
import { serializeKnowledge } from "./knowledge.mjs";
import { ONBOARDING_QUESTIONS } from "./questions.mjs";

export const AGENTS = ["Atlas", "Nova", "Forge", "Spark", "Meridian"];

export const ATLAS_PROMPT = `You are Atlas, the Training Insights Analyst for My Run Mentor AI. You are Agent 1, the Researcher, in this pipeline: Researcher -> Designer -> Maker -> Communicator -> Manager.

MISSION: Analyse only the runner information and activity records supplied by the application. Produce a factual Research Brief for Nova, the Designer.

DATA RULES: Separate user-stated facts, live retrieved records, interpretations, and unknowns. Never invent dates, distances, pace, heart rate, fatigue, injuries, or event information. If data is missing, write "not provided". Always identify the data source and retrieval time. Never claim that Garmin was accessed when the source is a demonstration profile.

ANALYSIS: Summarise the runner's situation from the onboarding answers (duration & frequency, distance & type of runs, motivation, level & goals, events participated in, challenges, environment, equipment & preferences, feelings & experience), plus goal, event date, availability, recent activity, fatigue, constraints, and data quality. The application derives the runner's level (Beginner, Intermediate, or Advanced) from the answers; do not ask for, guess, or invent an experience level. Compare current information with the goal without guaranteeing success. If pain, chest symptoms, fainting, severe breathlessness, or another serious warning is reported, set SAFETY_REVIEW_REQUIRED.

LIMITS: You are not a medical assessor. Do not diagnose, predict injury, or recommend training through pain.

CONCISENESS: Keep the Research Brief compact and factual. Do not repeat the full supplied text. Use short sentences.

OUTPUT a JSON object exactly matching the requested schema with: A. data_source and retrieval status; B. runner_profile; C. observed_patterns; D. goal_and_opportunity; E. constraints_and_missing; F. safety_flags; G. handoff. Do not create the final plan.`;

export const NOVA_PROMPT = `You are Nova, the Runner Experience Designer for My Run Mentor AI. You are Agent 2, the Designer, in this pipeline: Researcher -> Designer -> Maker -> Communicator -> Manager.

MISSION: Convert Atlas's Research Brief into a realistic and explainable training-experience specification. You design the solution; Forge will build it.

KNOWLEDGE-BASE GROUNDING: Use the training knowledge-base records supplied by the application: training_principles, plan_templates, session_library, progression_rules, intensity_guidance, and safety_rules. Do not create a training approach from general model knowledge when a relevant record exists. Select records using experience level, goal, preparation time, recent activity, available days, fatigue, and safety flags. Do not assign a pace target automatically to a beginner with limited performance data; prefer time, effort, and gradual progression.

TRACEABILITY: Include every selected template, session, progression rule, intensity rule, and safety rule by ID, for example T001, S001, PR001, I002, or SAFE001. If a suitable record is missing or conflicts with the Research Brief, state NEEDS_REVIEW and request Manager review instead of inventing a rule.

DESIGN PRINCIPLES: Respect constraints; include rest and recovery; make every session explainable; provide a missed-session alternative; use plain language; never design training through pain or serious symptoms.

CONCISENESS: Keep the Design Specification compact. List records by ID only; describe the week briefly; do not repeat knowledge-base text.

OUTPUT a JSON object exactly matching the requested schema with: A. design_objective; B. runner_needs; C. selected_knowledge_base_records; D. week_specification; E. adaptation_rules; F. explanation_and_trust_requirements; G. safety_boundaries; H. gaps_and_assumptions; I. acceptance_criteria. Do not write polished marketing copy.`;

export const FORGE_PROMPT = `You are Forge, the Adaptive Plan Builder for My Run Mentor AI. You are Agent 3, the Maker, in this pipeline: Researcher -> Designer -> Maker -> Communicator -> Manager.

MISSION: Turn Nova's Design Specification into a working, structured, validated recommendation.

KNOWLEDGE-BASE IMPLEMENTATION: Build from the plan template, session definitions, progression rules, intensity guidance, and safety rules supplied by the application. Do not generate a plan from a blank prompt when relevant records are available. Preserve all knowledge-base IDs. If a required record is missing, return status NEEDS_REVIEW and identify it. Do not silently replace missing rules with unsupported model knowledge.

IMPLEMENTATION RULES: Use live retrieved activity data for demonstration mode and manual values only for manual mode. Preserve source label and retrieval time. Validate dates, session count, available days, event timeframe, and conflicts. Do not stack missed sessions. Use time and effort instead of pace when pace data is unreliable.

WEEK STRUCTURE: The selected plan template specifies a number of sessions per week (sessions_per_week). The "sessions" array MUST contain EXACTLY one session object for EVERY training day of the upcoming week, matching that session count (for example, 3 session objects for a 3-day template: e.g. Monday, Wednesday, Saturday). A one-week plan typically has 2-3 session objects. Never output a single example session and never describe multiple sessions inside one object. Output the complete week.

CONCISENESS: Keep the JSON compact. One or two short lines per session. Do not repeat knowledge-base text.

SAFETY: Do not diagnose, predict injury, guarantee performance, or instruct training through pain. For SAFETY_REVIEW_REQUIRED, do not generate progressive training; return a restricted support message with status RESTRICTED.

OUTPUT a JSON object exactly matching the requested schema with: status; data_source; retrieval_time; runner_summary; plan_objective; knowledge_base_records_used; sessions (each with day, type, duration, distance, intensity, purpose, modification); adaptation_options; assumptions; safety_notes; validation_checks; rule_validation_status; missing_or_conflicting_rules.`;

export const SPARK_PROMPT = `You are Spark, the Motivation Coach for My Run Mentor AI. You are Agent 4, the Communicator, in this pipeline: Researcher -> Designer -> Maker -> Communicator -> Manager.

MISSION: Explain Forge's validated plan without changing its dates, distances, duration, intensity, or safety conditions.

RULES: State the goal and period; explain each session and its purpose; describe effort in accessible language; treat rest as part of training; include modifications; preserve the data-source disclosure, knowledge-base limitations, and safety notes; invite feedback for the next cycle. Adapt tone to the user's preference.

TRUTHFULNESS: Never claim to have accessed Garmin unless the input confirms a genuine connection. For demonstration mode, say "My Run Mentor AI demonstration training profile". Never invent completed sessions, biometric values, or progress. Do not make performance guarantees.

SAFETY: Do not diagnose or provide medical treatment. Present serious warnings clearly and recommend appropriate professional support. Do not tell the runner to train through pain.

OUTPUT a JSON object exactly matching the requested schema with: A. opening; B. weekly_plan; C. why_it_fits; D. if_something_changes; E. data_source_disclosure; F. safety_note; G. feedback_invitation. Flag inconsistencies for Meridian rather than silently changing the plan.

CONCISENESS: Keep the customer message warm but focused. Use short paragraphs and bullet-friendly lines in weekly_plan.`;

export const MERIDIAN_PROMPT = `You are Meridian, the Head Running Coach for My Run Mentor AI. You are Agent 5, the Manager and final quality gate, in this pipeline: Researcher -> Designer -> Maker -> Communicator -> Manager.

MISSION: Review Atlas, Nova, Forge, and Spark. Ensure that the final response is grounded in retrieved data and knowledge-base rules, aligned with the runner's goal, understandable, and safe for general fitness guidance.

CHECK: Confirm the five agents ran in order; source and retrieval time are truthful; Atlas used supplied data only; Nova selected appropriate knowledge-base records; Forge followed the selected template, sessions, progression, intensity, and safety rules; Spark did not change the structured plan; explanations and limitations are present; no diagnosis, injury prediction, guarantee, or training-through-pain instruction appears.

TRACEABILITY: Verify knowledge_base_records_used and rule_validation_status. If a selected ID is missing, contradictory, or unsuitable, return REVISE or HOLD and name the responsible agent. Do not invent replacement rules.

SCOPE: The structured plan under review is a one-week plan for the upcoming week, built from the selected template's weekly structure (session count and mix) and the selected session, progression, intensity, and safety rules. Forge is not expected to output the full multi-week progression schedule; a complete one-week plan with every session of the week is acceptable.

DECISION: APPROVE only when coherent, data-grounded, traceable, and safe. REVISE for correctable issues. HOLD for serious symptoms, insufficient information, fabricated data, broken handoff, or misleading source claims.

OUTPUT a JSON object exactly matching the requested schema with: A. pipeline_status; B. data_and_knowledge_traceability; C. coherence_review; D. safety_and_trust_review; E. customer_value_review; F. decision (APPROVE, REVISE or HOLD); G. required_changes_or_rationale. Do not silently rewrite another agent's work.

CONCISENESS: Keep reviews short (1-3 sentences per field). The final response is Spark's, not yours.`;

const SCHEMAS = {
  Atlas: {
    type: "object",
    properties: {
      data_source: { type: "string" },
      retrieval_time: { type: "string" },
      runner_profile: {
        type: "object",
        properties: {
          derived_level: { type: "string" },
          answers_summary: { type: "string" },
          goal: { type: "string" },
          event_date: { type: "string" },
          available_days: { type: "string" },
          recent_distance_km: { type: "string" },
          recent_duration_min: { type: "string" },
          fatigue_level: { type: "string" },
          pain_flag: { type: "string" },
          constraints: { type: "string" },
        },
      },
      observed_patterns: { type: "array", items: { type: "string" } },
      goal_and_opportunity: { type: "string" },
      constraints_and_missing: { type: "array", items: { type: "string" } },
      safety_flags: { type: "array", items: { type: "string" } },
      handoff: { type: "string" },
    },
    required: ["data_source", "runner_profile", "goal_and_opportunity", "safety_flags"],
  },
  Nova: {
    type: "object",
    properties: {
      design_objective: { type: "string" },
      runner_needs: { type: "array", items: { type: "string" } },
      selected_knowledge_base_records: { type: "array", items: { type: "string" } },
      week_specification: { type: "string" },
      adaptation_rules: { type: "array", items: { type: "string" } },
      explanation_and_trust_requirements: { type: "array", items: { type: "string" } },
      safety_boundaries: { type: "array", items: { type: "string" } },
      gaps_and_assumptions: { type: "array", items: { type: "string" } },
      acceptance_criteria: { type: "array", items: { type: "string" } },
    },
    required: ["design_objective", "week_specification", "selected_knowledge_base_records", "safety_boundaries"],
  },
  Forge: {
    type: "object",
    properties: {
      status: { type: "string" },
      data_source: { type: "string" },
      retrieval_time: { type: "string" },
      runner_summary: { type: "string" },
      plan_objective: { type: "string" },
      knowledge_base_records_used: { type: "array", items: { type: "string" } },
      sessions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            day: { type: "string" },
            type: { type: "string" },
            duration: { type: "string" },
            distance: { type: "string" },
            intensity: { type: "string" },
            purpose: { type: "string" },
            modification: { type: "string" },
          },
          required: ["day", "type", "duration", "intensity", "purpose", "modification"],
        },
      },
      adaptation_options: { type: "array", items: { type: "string" } },
      assumptions: { type: "array", items: { type: "string" } },
      safety_notes: { type: "array", items: { type: "string" } },
      validation_checks: { type: "array", items: { type: "string" } },
      rule_validation_status: { type: "string" },
      missing_or_conflicting_rules: { type: "array", items: { type: "string" } },
    },
    required: ["status", "plan_objective", "sessions", "safety_notes", "rule_validation_status"],
  },
  Spark: {
    type: "object",
    properties: {
      opening: { type: "string" },
      weekly_plan: { type: "string" },
      why_it_fits: { type: "string" },
      if_something_changes: { type: "string" },
      data_source_disclosure: { type: "string" },
      safety_note: { type: "string" },
      feedback_invitation: { type: "string" },
    },
    required: ["opening", "weekly_plan", "data_source_disclosure", "safety_note"],
  },
  Meridian: {
    type: "object",
    properties: {
      pipeline_status: { type: "string" },
      data_and_knowledge_traceability: { type: "string" },
      coherence_review: { type: "string" },
      safety_and_trust_review: { type: "string" },
      customer_value_review: { type: "string" },
      decision: { type: "string", enum: ["APPROVE", "REVISE", "HOLD"] },
      required_changes_or_rationale: { type: "string" },
    },
    required: ["pipeline_status", "decision", "required_changes_or_rationale"],
  },
};

const TEMPERATURES = { Atlas: 0.2, Nova: 0.3, Forge: 0.3, Spark: 0.6, Meridian: 0.2 };

export async function callAgent(agentName, systemPrompt, userPrompt, { apiKey, model = GEMINI_MODEL, base = GEMINI_API_BASE, fetchImpl = globalThis.fetch }) {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: TEMPERATURES[agentName] ?? 0.3,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: SCHEMAS[agentName],
    },
  };
  const url = `${base}/models/${model}:generateContent`;
  const post = async () => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err?.error?.message || JSON.stringify(err);
      } catch {
        detail = await res.text();
      }
      throw new Error(`${agentName} failed (HTTP ${res.status}): ${detail}`);
    }
    return res.json();
  };

  const extract = (data) =>
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

  let data = await post();
  let text = extract(data);
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || "empty response";
    throw new Error(`${agentName} returned no text (finishReason: ${reason})`);
  }

  const parse = (t) => JSON.parse(t);
  const tryParse = (t) => {
    try {
      return parse(cleanJson(t));
    } catch {
      try {
        return parse(repairJson(cleanJson(t)));
      } catch {
        return null;
      }
    }
  };

  let parsed = tryParse(text);
  if (!parsed) {
    data = await post();
    text = extract(data);
    parsed = tryParse(text);
  }
  if (!parsed) {
    const repaired = await repairViaModel(agentName, text, SCHEMAS[agentName], { apiKey, model, base, fetchImpl });
    parsed = tryParse(repaired);
  }
  if (!parsed) {
    throw new Error(
      `${agentName} returned unparseable JSON (length ${text.length}). First 300 chars: ${text.slice(0, 300)}`
    );
  }
  return parsed;
}

async function repairViaModel(agentName, malformed, schema, { apiKey, model = GEMINI_MODEL, base = GEMINI_API_BASE, fetchImpl = globalThis.fetch }) {
  const body = {
    systemInstruction: {
      parts: [
        {
          text: `You repair malformed JSON produced by the ${agentName} agent. Fix syntax errors such as raw newlines, stray quotes, truncated strings, and trailing commas. Return ONLY valid JSON matching the schema. Do not change the meaning of the content.`,
        },
      ],
    },
    contents: [{ role: "user", parts: [{ text: `Malformed JSON:\n${malformed.slice(0, 24000)}` }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };
  const res = await fetchImpl(`${base}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
}

export function cleanJson(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) t = t.slice(start, end + 1);
  return t;
}

export function repairJson(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === "\\") {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === "\n") {
        out += "\\n";
      } else if (ch === "\r") {
        out += "\\r";
      } else if (ch === "\t") {
        out += "\\t";
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

function safeJsonStringify(obj, fallback) {
  if (!obj) return fallback || "";
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return fallback || "";
  }
}

function runnerContext(runner = {}) {
  if (runner && runner.answers) {
    const lines = [];
    for (const q of ONBOARDING_QUESTIONS) {
      const v = runner.answers[q.id];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        lines.push(`- ${q.category}: ${v}`);
      }
    }
    const extra = [
      ["derived_level", "Derived level (from answers)"],
      ["goal_type", "Goal type"],
      ["target_distance_km", "Target distance (km)"],
      ["event_date", "Event date"],
      ["available_days", "Available days per week"],
      ["recent_distance_km", "Recent weekly distance (km)"],
      ["recent_duration_min", "Recent weekly duration (min)"],
      ["pain_flag", "Pain flag"],
      ["fatigue_level", "Fatigue level"],
      ["data_source", "Data source"],
    ];
    for (const [k, label] of extra) {
      if (runner[k] !== undefined && runner[k] !== null && String(runner[k]).trim() !== "") {
        lines.push(`- ${label}: ${runner[k]}`);
      }
    }
    return lines.length ? lines.join("\n") : "No structured runner record supplied.";
  }
  const keys = [
    ["experience_level", "Experience level"],
    ["goal_type", "Goal type"],
    ["target_distance_km", "Target distance (km)"],
    ["event_date", "Event date"],
    ["available_days", "Available days per week"],
    ["recent_distance_km", "Recent weekly distance (km)"],
    ["recent_duration_min", "Recent weekly duration (min)"],
    ["fatigue_level", "Fatigue level"],
    ["pain_flag", "Pain flag"],
    ["data_source", "Data source"],
  ];
  const lines = keys
    .filter(([k]) => runner[k] !== undefined && runner[k] !== null && String(runner[k]).trim() !== "")
    .map(([k, label]) => `- ${label}: ${runner[k]}`);
  return lines.length ? lines.join("\n") : "No structured runner record supplied.";
}

function buildAtlasUser({ message, history = [], runner = {} }) {
  const recent = history.slice(-8).map((h) => `${h.role}: ${h.content}`).join("\n");
  return `USER INPUT (free text): ${message || "(none provided yet)"}

STRUCTURED RUNNER RECORD:
${runnerContext(runner)}

RECENT CONVERSATION (for context only):
${recent || "(no prior conversation)"}

Analyse the runner information and any supplied activity records factually. Distinguish user-stated facts, live retrieved records, interpretations, and unknowns. Report data source and retrieval time accurately. Do not claim a Garmin connection unless the input confirms one.`;
}

function buildNovaUser(atlasBrief, knowledge) {
  return `ATLAS RESEARCH BRIEF (Agent 1 output):
${safeJsonStringify(atlasBrief)}

LIVE TRAINING KNOWLEDGE BASE RETRIEVED AT RUNTIME (from the live Google Sheet):
${serializeKnowledge(knowledge)}

Design a personalised, explainable training experience. Select records from the supplied knowledge base by ID (e.g. T001, S001, PR001, I002, SAFE001). Respect constraints, include rest and recovery, provide missed-session alternatives, and never design training through pain. Do not assign pace targets automatically to a beginner with limited performance data.`;
}

function buildForgeUser(novaSpec, knowledge, runner = {}) {
  const template = knowledge.plan_templates?.[0];
  const countHint = template && template.sessions_per_week
    ? `The selected template ${template.template_id} (${template.template_name}) specifies ${template.sessions_per_week} sessions per week. Produce exactly ${template.sessions_per_week} session objects in the "sessions" array (one per training day of the upcoming week).`
    : "";
  return `NOVA DESIGN SPECIFICATION (Agent 2 output):
${safeJsonStringify(novaSpec)}

LIVE TRAINING KNOWLEDGE BASE RETRIEVED AT RUNTIME (from the live Google Sheet):
${serializeKnowledge(knowledge)}

STRUCTURED RUNNER RECORD:
${runnerContext(runner)}

${countHint}

Build the structured weekly plan from the supplied knowledge-base records. Preserve all knowledge-base IDs. Use time and effort instead of pace when pace data is unreliable. Validate dates, session count, available days, and event timeframe. Do not stack missed sessions. If SAFETY_REVIEW_REQUIRED is flagged, return a restricted support message (status RESTRICTED) instead of progressive training.`;
}

function buildSparkUser(forgePlan, knowledge) {
  return `FORGE STRUCTURED PLAN (Agent 3 output):
${safeJsonStringify(forgePlan)}

LIVE TRAINING KNOWLEDGE BASE CONTEXT:
${serializeKnowledge(knowledge)}

Explain Forge's validated plan without changing its dates, distances, duration, intensity, or safety conditions. Preserve the data-source disclosure and knowledge-base limitations. Use accessible, warm, honest language. Invite feedback for the next cycle.`;
}

function buildMeridianUser(pieces) {
  const { atlasBrief, novaSpec, forgePlan, sparkMsg } = pieces;
  return `ATLAS (Agent 1) RESEARCH BRIEF:
${safeJsonStringify(atlasBrief)}

NOVA (Agent 2) DESIGN SPECIFICATION:
${safeJsonStringify(novaSpec)}

FORGE (Agent 3) STRUCTURED PLAN:
${safeJsonStringify(forgePlan)}

SPARK (Agent 4) CUSTOMER RESPONSE:
${safeJsonStringify(sparkMsg)}

Review the cumulative output. Confirm the agents ran in order, the source and retrieval time are truthful, the plan follows the selected knowledge-base records, and Spark did not change the structured plan. Decide APPROVE, REVISE or HOLD and give required changes or your approval rationale.`;
}

export async function runFiveAgentPipeline({ input, knowledge, apiKey, model = GEMINI_MODEL, base = GEMINI_API_BASE, fetchImpl = globalThis.fetch, onStep = null }) {
  const opts = { apiKey, model, base, fetchImpl };
  const step = async (agent, prompt, user) => {
    if (onStep) await onStep(agent, "running");
    try {
      const out = await callAgent(agent, prompt, user, opts);
      if (onStep) await onStep(agent, "done", out);
      return out;
    } catch (err) {
      if (onStep) await onStep(agent, "failed", err);
      throw err;
    }
  };

  const atlasBrief = await step("Atlas", ATLAS_PROMPT, buildAtlasUser(input));
  const novaSpec = await step("Nova", NOVA_PROMPT, buildNovaUser(atlasBrief, knowledge));
  const forgePlan = await step("Forge", FORGE_PROMPT, buildForgeUser(novaSpec, knowledge, input.runner));
  const sparkMsg = await step("Spark", SPARK_PROMPT, buildSparkUser(forgePlan, knowledge));
  const review = await step("Meridian", MERIDIAN_PROMPT, buildMeridianUser({ atlasBrief, novaSpec, forgePlan, sparkMsg }));

  return { atlasBrief, novaSpec, forgePlan, sparkMsg, review };
}

export function composeSparkMessage(sparkMsg) {
  if (!sparkMsg || typeof sparkMsg !== "object") return String(sparkMsg || "");
  const sections = [];
  if (sparkMsg.opening) sections.push(sparkMsg.opening);
  if (sparkMsg.weekly_plan) sections.push("**This week's plan**\n\n" + sparkMsg.weekly_plan);
  if (sparkMsg.why_it_fits) sections.push("**Why it fits you**\n\n" + sparkMsg.why_it_fits);
  if (sparkMsg.if_something_changes) sections.push("**If something changes**\n\n" + sparkMsg.if_something_changes);
  if (sparkMsg.data_source_disclosure) sections.push("**Data source**\n\n" + sparkMsg.data_source_disclosure);
  if (sparkMsg.safety_note) sections.push("**Safety note**\n\n" + sparkMsg.safety_note);
  if (sparkMsg.feedback_invitation) sections.push(sparkMsg.feedback_invitation);
  return sections.join("\n\n");
}

export function restrictedReply(knowledge) {
  const safes = (knowledge && knowledge.safety_rules) || [];
  const msg = (id) => {
    const s = safes.find((r) => r.safety_rule_id === id);
    return s && s.user_message ? s.user_message : "";
  };
  const serious = msg("SAFE002");
  const pain = msg("SAFE001");
  const medical = msg("SAFE004");
  const lines = [];
  if (serious) lines.push(serious);
  if (pain) lines.push(pain);
  if (medical) lines.push(medical);
  lines.push(
    "I am not able to create a personalised training plan for you right now. This prototype is an educational demonstration, not a medical or clinically validated coaching system."
  );
  lines.push(
    "Please stop exercising if you have concerning symptoms and speak with a qualified healthcare or sports professional before continuing any training. You can restart our conversation with new details at any time."
  );
  return lines.join("\n\n");
}

export function composeFinalReply({ sparkMsg, review, forgePlan } = {}, knowledge) {
  const forgeStatus = String((forgePlan && forgePlan.status) || "").toUpperCase();
  const decision = String((review && review.decision) || "").toUpperCase();
  if (forgeStatus === "RESTRICTED" || decision === "HOLD") return restrictedReply(knowledge);
  const message = composeSparkMessage(sparkMsg);
  if (decision === "REVISE") {
    return (
      message +
      "\n\n---\n\n_Meridian's review: your response was reviewed by the Head Coach and flagged for a minor revision (" +
      (review?.required_changes_or_rationale || "see review") +
      "). Please share any updated details so I can improve the plan._"
    );
  }
  return message;
}

export function safetyShortCircuit(knowledge) {
  const flags = (knowledge && knowledge.flags) || [];
  const serious = flags.some((f) => f === "serious symptoms");
  const medical = flags.some((f) => f === "medical request");
  if (serious || medical) return restrictedReply(knowledge);
  return null;
}
