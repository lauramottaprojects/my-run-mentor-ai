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
    "/gviz/tq?tqx=out:json&headers=1&sheet=" +
    encodeURIComponent(def.sheet);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Sheet "${def.sheet}" failed with HTTP ${res.status}`);
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

// ---------------------------------------------------------------- answer-driven derivation
// The runner level is DERIVED from the onboarding answers. The app never asks
// the runner to self-declare an experience level.

export function answersText(answers = {}, message = "") {
  return (
    Object.values(answers || {})
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
      .join(" ") +
    " " +
    String(message || "")
  ).toLowerCase();
}

function firstNumber(text, pattern) {
  const m = text.match(pattern);
  return m ? parseFloat(m[1]) : null;
}

function rangeHigh(text, pattern) {
  const m = text.match(pattern);
  return m ? parseFloat(m[2] ?? m[1]) : null;
}

export function deriveLevelFromAnswers(answers = {}, message = "") {
  const text = answersText(answers, message);
  const score = { Beginner: 0, Intermediate: 0, Advanced: 0 };

  if (/\bbeginner\b|new to running|just started|never (?:run|raced)|couch/.test(text)) score.Beginner += 5;
  if (/\bintermediate\b|improve (?:my|the|your) 10k|consistent (?:runner|training|base)/.test(text))
    score.Intermediate += 3;
  if (/\badvanced\b|experienced|race pace|threshold|structured|marathon pace/.test(text)) score.Advanced += 3;

  const years = firstNumber(text, /(\d+)(?:\s*[-–]\s*\d+)?\s*years?/i);
  if (years !== null) {
    if (years < 1) score.Beginner += 4;
    else if (years <= 2) {
      score.Intermediate += 2;
      score.Beginner += 1;
    } else if (years <= 4) {
      score.Intermediate += 2;
      score.Advanced += 1;
    } else {
      score.Advanced += 4;
      score.Intermediate += 1;
    }
  }
  const months = firstNumber(text, /(\d+)\s*months?/i);
  if (months !== null && months < 12) score.Beginner += 3;

  const freqHigh = rangeHigh(text, /(\d+)\s*[-–]\s*(\d+)\s*times?\s*(?:a|per)\s*week/);
  const freq = freqHigh ?? firstNumber(text, /(\d+)\s*times?\s*(?:a|per)\s*week/);
  if (freq !== null) {
    if (freq <= 2) score.Beginner += 3;
    else if (freq <= 4) score.Intermediate += 3;
    else score.Advanced += 4;
  }

  const distHigh = rangeHigh(text, /(\d+)\s*[-–]\s*(\d+)\s*kms?/);
  const dist = distHigh ?? firstNumber(text, /(\d+)\s*kms?/);
  if (dist !== null) {
    if (dist < 5) score.Beginner += 2;
    else if (dist <= 15) score.Intermediate += 2;
    else score.Advanced += 3;
  }

  if (/long (?:run|runs|er run)/.test(text)) score.Intermediate += 1;
  if (/\bintervals?\b|tempo|fartlek|threshold|speed work|track session|structured sessions?/.test(text))
    score.Intermediate += 2;
  if (/(?:half[- ]?marathon|marathon)\b.*(?:pace|goal|time)|sub-?\s*\d/.test(text)) score.Advanced += 2;

  if (/\bmarathon\b|13\.1|21\.1/.test(text)) score.Advanced += 3;
  if (/\b10k\b/.test(text) && /(?:races?|events?|completed|finished)/.test(text)) score.Intermediate += 2;
  if (/\b5k\b/.test(text) && /(?:races?|events?|completed|finished)/.test(text)) score.Intermediate += 1;
  if (/no races|never raced|haven'?t raced|first race|(?:not|never).*races?/.test(text)) score.Beginner += 2;

  const LEVEL_ORDER = ["Beginner", "Intermediate", "Advanced"];
  const ranked = [...LEVEL_ORDER].sort(
    (a, b) => score[b] - score[a] || LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b)
  );
  const top = score[ranked[0]];
  const second = score[ranked[1]];
  if (top >= 2 && top >= second + 2) return ranked[0];
  return "Beginner";
}

export function deriveGoalTypeFromAnswers(answers = {}, message = "") {
  const text = answersText(answers, message);
  const goalsText = answersText(
    { level_goals: answers.level_goals, motivation: answers.motivation },
    message
  );
  const hit = (t) => {
    if (/half[- ]?marathon|13\.1\s*m|21\.1\s*k/.test(t)) return "Half marathon";
    if (/\bmarathon\b|42\.2\s*k/.test(t)) return "Marathon";
    if (/\b10k\b|\b10\s*km\b/.test(t)) return "10K completion";
    if (/\b5k\b|\b5\s*km\b/.test(t)) return "5K completion";
    return null;
  };
  return hit(goalsText) || hit(text) || "General fitness";
}

export function buildRunnerFromAnswers(answers = {}, extra = {}) {
  const text = answersText(answers);
  const level = deriveLevelFromAnswers(answers);
  const goalType = deriveGoalTypeFromAnswers(answers);

  const freqHigh = rangeHigh(text, /(\d+)\s*[-–]\s*(\d+)\s*times?\s*(?:a|per)\s*week/);
  const freq = freqHigh ?? firstNumber(text, /(\d+)\s*times?\s*(?:a|per)\s*week/);
  const availableDays = freq !== null ? Math.max(1, Math.min(7, Math.round(freq))) : null;

  const distHigh = rangeHigh(text, /(\d+)\s*[-–]\s*(\d+)\s*kms?/);
  const dist = distHigh ?? firstNumber(text, /(\d+)\s*kms?/);
  const recentDistanceKm = dist !== null ? Math.round(dist) : null;

  const painFlag = /\bpain\b|injur|hurt|ache|sore|knee|shin|hip/.test(text) ? "Yes" : "No";
  const fatigueLevel = /high fatigue|always tired|exhausted|struggl(?:e|ing) with energy/.test(text)
    ? "High"
    : /fatigue|tired|low energy/.test(text)
      ? "Moderate"
      : "Low";

  return {
    ...extra,
    answers,
    derived_level: level,
    goal_type: goalType,
    available_days: availableDays,
    recent_distance_km: recentDistanceKm,
    pain_flag: painFlag,
    fatigue_level: fatigueLevel,
  };
}

export function guessLevelGoal(runner = {}, message = "") {
  if (runner && runner.answers) {
    return {
      level: deriveLevelFromAnswers(runner.answers, message),
      goalType: deriveGoalTypeFromAnswers(runner.answers, message),
    };
  }
  const text = [runner.experience_level, runner.goal_type, message].join(" ").toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));

  let goalType = "General fitness";
  if (has("half marathon", "half-marathon", "13.1")) goalType = "Half marathon";
  else if (has("marathon", "42.2")) goalType = "Marathon";
  else if (has("10k", "10 km", "10km")) goalType = "10K completion";
  else if (has("5k", "5 km", "5km")) goalType = "5K completion";

  let level = "Beginner";
  if (has("advanced", "experienced", "race pace", "threshold", "structured")) level = "Advanced";
  else if (has("recreational", "intermediate", "consistent", "some experience")) level = "Intermediate";

  return { level, goalType };
}

export function deriveRunnerFlags(runner = {}, message = "") {
  const answers = (runner && runner.answers) || {};
  const text = answersText(answers, message);
  const structured = [runner.pain_flag, runner.fatigue_level, message].join(" ").toLowerCase();
  const flags = [];
  if (
    hasText(text, "chest", "fainting", "severe breathlessness", "breathlessness") ||
    hasText(structured, "chest", "fainting", "severe breathlessness")
  )
    flags.push("serious symptoms");
  if (hasText(text, "pain", "injury", "injured", "hurt", "ache") || hasText(structured, "pain", "injury"))
    flags.push("pain or injury");
  if (hasText(text, "treat", "diagnose", "medication", "medical", "doctor", "physio")) flags.push("medical request");
  if (String(runner.data_source || "").toLowerCase().includes("demonstration")) flags.push("wearable disclosure");
  const answered = Object.values(answers).some((v) => v && String(v).trim() !== "");
  if (!answered && !message.trim()) flags.push("missing data");
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
