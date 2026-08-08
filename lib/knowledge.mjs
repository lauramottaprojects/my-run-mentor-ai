import { SPREADSHEET_ID, SHEETS } from "./config.mjs";

export function isActive(row) {
  return String((row && row.active) || "").trim().toLowerCase() === "yes";
}

export function cleanRows(rows) {
  return (rows || []).filter((r) => r && Object.keys(r).some((k) => String(r[k]) !== ""));
}

export function parseGvizJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf(");");
  if (start === -1 || end === -1) throw new Error("Unexpected Google Sheets response");
  return JSON.parse(text.slice(start, end));
}

function cellValue(cell) {
  if (!cell || typeof cell !== "object" || cell.v === null || cell.v === undefined) return "";
  return String(cell.v);
}

export function gvizRowsToObjects(data) {
  const headers = (data.table.cols || []).map((c) => (c && c.label) || (c && c.id) || "");
  return (data.table.rows || []).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = cellValue(row.c && row.c[i]);
    });
    return obj;
  });
}

export async function fetchSheet(sheetKey, { fetchImpl = globalThis.fetch } = {}) {
  const def = SHEETS[sheetKey];
  if (!def) throw new Error(`Unknown sheet: ${sheetKey}`);
  const url =
    "https://docs.google.com/spreadsheets/d/" +
    SPREADSHEET_ID +
    "/gviz/tq?tqx=out:json&headers=1&gid=" +
    encodeURIComponent(def.gid);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Sheet "${def.name}" failed with HTTP ${res.status}`);
  const text = await res.text();
  return gvizRowsToObjects(parseGvizJson(text));
}

export async function loadKnowledgeBase({ fetchImpl } = {}) {
  const keys = [
    "training_principles",
    "session_library",
    "progression_rules",
    "plan_templates",
    "safety_rules",
    "intensity_guidance",
    "sources",
  ];
  const entries = await Promise.all(
    keys.map(async (key) => [key, cleanRows(await fetchSheet(key, { fetchImpl }))])
  );
  const kb = Object.fromEntries(entries);
  kb.meta = {
    source: "Google Sheets (live)",
    spreadsheet_id: SPREADSHEET_ID,
    retrieval_time: new Date().toISOString(),
  };
  return kb;
}

export function normLevelGoal(rows, level, goalType) {
  const l = String(level || "").trim().toLowerCase();
  const g = String(goalType || "").trim().toLowerCase();
  return cleanRows(rows).filter((r) => {
    if (!isActive(r)) return false;
    const rl = String(r.level || "").trim().toLowerCase();
    const rg = String(r.goal_type || "").trim().toLowerCase();
    const levelOk = rl === "all" || (l && rl === l);
    const goalOk = rg === "all" || (g && rg === g);
    return levelOk && goalOk;
  });
}

export function scorePlanTemplate(row, level, goalType) {
  const rl = String(row.level || "").trim().toLowerCase();
  const rg = String(row.goal_type || "").trim().toLowerCase();
  const l = String(level || "").trim().toLowerCase();
  const g = String(goalType || "").trim().toLowerCase();
  let score = 0;
  if (rl === l) score += 4;
  else if (rl === "all") score += 2;
  if (rg === g) score += 4;
  else if (rg === "all") score += 2;
  if (rl === "all" && rg === "all") score = 1;
  return score;
}

export function getPlanTemplates(kb, level, goalType) {
  return cleanRows(kb.plan_templates)
    .filter(isActive)
    .map((r) => ({ row: r, score: scorePlanTemplate(r, level, goalType) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row);
}

export function getSessions(kb, level, goalType) {
  return normLevelGoal(kb.session_library, level, goalType);
}

export function getProgressionRules(kb, level, goalType) {
  const byLevelGoal = normLevelGoal(kb.progression_rules, level, goalType);
  if (byLevelGoal.length) return byLevelGoal;
  const l = String(level || "").trim().toLowerCase();
  return cleanRows(kb.progression_rules).filter((r) => {
    if (!isActive(r)) return false;
    const rl = String(r.level || "").trim().toLowerCase();
    return rl === "all" || (l && rl === l);
  });
}

export function getIntensityGuidance(kb, level) {
  const l = String(level || "").trim().toLowerCase();
  return cleanRows(kb.intensity_guidance).filter((r) => {
    if (!isActive(r)) return false;
    const rl = String(r.level || "").trim().toLowerCase();
    return rl === "all" || (l && rl === l);
  });
}

export function getSafetyRules(kb, flags = []) {
  const tags = flags.map((f) => String(f || "").trim().toLowerCase());
  const triggerOf = (r) => String(r.trigger_type || "").trim().toLowerCase();
  return cleanRows(kb.safety_rules).filter((r) => {
    if (!isActive(r)) return false;
    if (!tags.length) return triggerOf(r) === "wearable disclosure" || triggerOf(r) === "missing data";
    return tags.some((t) => triggerOf(r).includes(t));
  });
}

export function guessLevelGoal(runner = {}, message = "") {
  const text = [runner.experience_level, runner.goal_type, message].join(" ").toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));

  let goalType = "General fitness";
  if (has("5k", "5 km", "5km")) goalType = "5K completion";
  else if (has("10k", "10 km", "10km")) goalType = "10K completion";

  let level = "Beginner";
  if (has("recreational", "intermediate", "regular runner", "consistent", "some experience", "experienced"))
    level = "Recreational";

  if (runner.goal_type && /10k/i.test(runner.goal_type)) goalType = "10K completion";
  if (runner.goal_type && /5k/i.test(runner.goal_type)) goalType = "5K completion";
  if (runner.experience_level && /recreational|intermediate/i.test(runner.experience_level)) level = "Recreational";

  return { level, goalType };
}

export function deriveRunnerFlags(runner = {}, message = "") {
  const text = [runner.pain_flag, runner.fatigue_level, message].join(" ").toLowerCase();
  const flags = [];
  if (hasText(text, "chest", "fainting", "severe breathlessness", "breathlessness")) flags.push("serious symptoms");
  if (hasText(text, "pain", "injury", "injured", "hurt")) flags.push("pain or injury");
  if (hasText(text, "treat", "diagnose", "medication", "medical")) flags.push("medical request");
  if (String(runner.data_source || "").toLowerCase().includes("demonstration")) flags.push("wearable disclosure");
  if (!runner.experience_level && !runner.goal_type && !message.trim()) flags.push("missing data");
  return flags;
}

function hasText(text, ...words) {
  return words.some((w) => text.includes(w));
}

export function buildKnowledgeContext(kb, level, goalType, flags = []) {
  return {
    meta: kb.meta,
    training_principles: cleanRows(kb.training_principles).filter(isActive),
    plan_templates: getPlanTemplates(kb, level, goalType),
    session_library: getSessions(kb, level, goalType),
    progression_rules: getProgressionRules(kb, level, goalType),
    intensity_guidance: getIntensityGuidance(kb, level),
    safety_rules: getSafetyRules(kb, flags),
    sources: cleanRows(kb.sources),
    flags,
    level,
    goalType,
  };
}

export function serializeKnowledge(ctx, { max = null } = {}) {
  const json = {
    source: ctx.meta.source,
    spreadsheet_id: ctx.meta.spreadsheet_id,
    retrieval_time: ctx.meta.retrieval_time,
    level_context: ctx.level,
    goal_context: ctx.goalType,
    safety_flags: ctx.flags,
    records: {
      training_principles: ctx.training_principles,
      plan_templates: ctx.plan_templates,
      session_library: ctx.session_library,
      progression_rules: ctx.progression_rules,
      intensity_guidance: ctx.intensity_guidance,
      safety_rules: ctx.safety_rules,
      sources: ctx.sources,
    },
  };
  let out = JSON.stringify(json, null, 2);
  if (max && out.length > max) out = out.slice(0, max) + "\n... (truncated)";
  return out;
}
