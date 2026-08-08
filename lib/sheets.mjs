import { SPREADSHEET_ID, sheetCsvUrl, SHEETS } from "./config.mjs";

// ------------------------------------------------------------------ CSV parser
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}

export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = r[i] !== undefined ? String(r[i]).trim() : "";
    });
    return obj;
  });
}

// ------------------------------------------------------------------ live fetch
export async function fetchSheetCsv(sheetName, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(sheetCsvUrl(sheetName));
  if (!res.ok) throw new Error(`Sheet "${sheetName}" failed with HTTP ${res.status}`);
  const text = await res.text();
  return rowsToObjects(parseCsv(text));
}

let liveCache = null;
let liveCacheAt = 0;

// Some imported Sheets drop "X of Y" cell values. Recompute any missing
// Summary metrics live from the Runs/Runners sheets so the digest is always full.
export function enrichSummary(summary, runners, runs) {
  const isOver = (r) => String(r.overreach || "").trim().toLowerCase() === "true";
  const isDone = (r) => String(r.completed || "").trim().toLowerCase() === "true";
  const overRunners = (runners || []).filter(isOver);
  const churned = overRunners.filter((r) => Number(r.churn_week) <= 8);
  const overRunIds = new Set(overRunners.map((r) => r.runner_id));
  const overRuns = (runs || []).filter((r) => overRunIds.has(r.runner_id));
  const balRuns = (runs || []).filter((r) => !overRunIds.has(r.runner_id));
  const missOver = overRuns.filter((r) => !isDone(r));
  const missBal = balRuns.filter((r) => !isDone(r));

  const summaryMap = {};
  (summary || []).forEach((r) => {
    if (r && r.Metric) summaryMap[String(r.Metric).trim().toLowerCase()] = r;
  });

  const setIfEmpty = (metric, value) => {
    const row = summaryMap[metric.toLowerCase()];
    if (row && !String(row.Value || "").trim()) row.Value = value;
  };

  setIfEmpty("Runners showing overreach signature", `${overRunners.length} of ${runners.length}`);
  setIfEmpty("Overreachers who stopped (churned)", `${churned.length} of ${overRunners.length}`);
  setIfEmpty("Missed sessions overreachers", `${missOver.length} of ${overRuns.length}`);
  setIfEmpty("Missed sessions balanced", `${missBal.length} of ${balRuns.length}`);
  return summary;
}

export async function loadLiveData({ fetchImpl, force = false, ttlMs = 60_000 } = {}) {
  if (!force && liveCache && Date.now() - liveCacheAt < ttlMs) return liveCache;
  const [runners, runs, summary] = await Promise.all([
    fetchSheetCsv(SHEETS.runners, { fetchImpl }),
    fetchSheetCsv(SHEETS.runs, { fetchImpl }),
    fetchSheetCsv(SHEETS.summary, { fetchImpl }),
  ]);
  enrichSummary(summary, runners, runs);
  const data = {
    runners,
    runs,
    summary,
    meta: {
      source: "Google Sheets (live)",
      spreadsheet_id: SPREADSHEET_ID,
      retrieval_time: new Date().toISOString(),
    },
  };
  liveCache = data;
  liveCacheAt = Date.now();
  return data;
}

export function digestLiveData(data) {
  const s = data.summary || [];
  const lines = s.map((r) => `- ${r.Metric}: ${r.Value} — ${r.Insight}`).join("\n");
  const runs = data.runs || [];
  const runners = data.runners || [];
  return (
    `Live runner database (Google Sheets, retrieved ${(data.meta && data.meta.retrieval_time) || "now"}):\n` +
    `${lines || "(summary sheet empty)"}\n` +
    `Raw volume: ${runs.length} training sessions across ${runners.length} runners (Runs + Runners sheets).`
  );
}
