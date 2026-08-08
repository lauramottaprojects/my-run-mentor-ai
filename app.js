"use strict";

// ---------------------------------------------------------------- config
// VERCEL_API_URL is replaced with the real deployment URL before pushing to GitHub Pages.
const VERCEL_API_URL = "https://my-run-mentor-ai.vercel.app/api/gemini";
const SPREADSHEET_ID = "121xsbzRPnzlAhvDK4Yo1nPchVhIAHaeRBKvg5tHWZ8s";
const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit?usp=sharing";
const SHEET_NAMES = ["Runners", "Runs", "Summary"];
const AGENT_NAMES = ["Researcher", "Designer", "Maker", "Communicator", "Manager"];
const AGENT_BLURBS = [
  ["1", "Researcher · analyses the opportunity & your situation"],
  ["2", "Designer · designs the coaching experience"],
  ["3", "Maker · builds the concrete plan"],
  ["4", "Communicator · writes to you with warmth"],
  ["5", "Manager · reviews, approves, and decides"],
];

// ---------------------------------------------------------------- state
const state = { runner: null, history: [], busy: false, pipelineEl: null };

// ---------------------------------------------------------------- dom helpers
const $ = (id) => document.getElementById(id);
const messagesEl = $("messages");
const inputEl = $("input");
const sendBtn = $("send");

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 4200);
}

function addMessage(role, html, meta) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = html;
  wrap.appendChild(bubble);
  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.appendChild(meta);
    wrap.appendChild(m);
  }
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

function addBotTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";
  wrap.innerHTML = '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

// ---------------------------------------------------------------- markdown (minimal)
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(text) {
  const lines = esc(text).split(/\r?\n/);
  let html = "";
  let listType = null;
  const closeList = () => { if (listType) { html += listType === "ul" ? "</ul>" : "</ol>"; listType = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); html += "</p><p>"; continue; }
    if (/^#{1,3}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      html += `<h${level}>${line.replace(/^#+\s*/, "")}</h${level}>`;
      continue;
    }
    if (/^-{3,}$/.test(line)) { closeList(); html += "<hr>"; continue; }
    if (/^&gt;\s?/.test(line)) {
      closeList();
      html += "<blockquote>" + line.replace(/^&gt;\s?/, "") + "</blockquote>";
      continue;
    }
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    const olMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (ulMatch || olMatch) {
      const type = ulMatch ? "ul" : "ol";
      if (listType !== type) { closeList(); html += type === "ul" ? "<ul>" : "<ol>"; listType = type; }
      html += "<li>" + (ulMatch ? ulMatch[1] : olMatch[1]) + "</li>";
      continue;
    }
    closeList();
    html += line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>") + "<br>";
  }
  closeList();
  if (html.endsWith("</p><p>")) html = html.slice(0, -"<p>".length);
  return html.replace(/<br><br>+$/, "");
}

// ---------------------------------------------------------------- pipeline indicator
function pipelineTraceMeta() {
  const el = document.createElement("span");
  el.className = "pipeline";
  el.innerHTML = AGENT_NAMES.map((a) => `<span class="step" data-agent="${a}">${a}</span>`).join(" → ");
  state.pipelineEl = el;
  return el;
}

function setPipelineStep(agent, status) {
  if (!state.pipelineEl) return;
  const step = state.pipelineEl.querySelector(`[data-agent="${agent}"]`);
  if (step) {
    step.classList.add("on");
    if (status !== "done" && status !== "running") step.style.color = "var(--danger)";
  }
}

function setPipelineDecision(decision) {
  if (!state.pipelineEl) return;
  const el = document.createElement("span");
  el.className = "dec";
  el.textContent = " · " + (decision || "?");
  state.pipelineEl.appendChild(el);
}

function resetPipeline() { state.pipelineEl = null; }

// ---------------------------------------------------------------- live data
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; rows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { if (h) o[h] = r[i] !== undefined ? String(r[i]).trim() : ""; });
    return o;
  });
}

async function fetchSheetRows(sheetName) {
  const url = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(sheetName);
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return rowsToObjects(parseCsv(await res.text()));
}

async function loadLiveKb() {
  const dot = $("liveDot"), text = $("liveText"), info = $("kbInfo"), time = $("kbTime");
  try {
    const [runners, runs, summary] = await Promise.all(SHEET_NAMES.map(fetchSheetRows));
    const lines = summary
      .filter((r) => r && r.Metric)
      .map((r) => `<b>${esc(r.Value)}</b><small>${esc(r.Metric)}</small>`)
      .join("");
    info.innerHTML = lines || "<b>0</b><small>summary empty</small>";
    const when = new Date().toLocaleTimeString();
    time.innerHTML = `<small>${runners.length} runners · ${runs.length} sessions · live from <a href="${SPREADSHEET_URL}" target="_blank" rel="noopener" style="color:var(--accent2)">Google Sheets</a> at ${when}</small>`;
    dot.classList.add("live");
    text.textContent = "Live data: " + runs.length + " sessions";
  } catch (err) {
    dot.classList.add("err");
    text.textContent = "Live data unavailable";
    info.innerHTML = "<b>!</b><small>Could not reach Google Sheets</small>";
  }
}

// ---------------------------------------------------------------- onboarding
function readRunner() {
  const runner = {
    data_source: "manual entry",
    last_run_gap: $("fGap").value.trim(),
    days_per_week: $("fDays").value.trim(),
    last_run_feel: $("fFeel").value.trim(),
    goal: $("fGoal").value.trim(),
    event_date: $("fEvent").value || "",
  };
  return runner;
}

// ---------------------------------------------------------------- chat
function setBusy(b) {
  state.busy = b;
  sendBtn.disabled = b;
  inputEl.disabled = b;
}

async function ask(userText) {
  const body = { message: userText, history: state.history, runner: state.runner || {} };
  const typingEl = addBotTyping();
  const meta = pipelineTraceMeta();
  setBusy(true);
  try {
    if (!VERCEL_API_URL || VERCEL_API_URL.includes("__VERCEL")) {
      throw new Error("Backend not configured. Set VERCEL_API_URL in app.js.");
    }
    const res = await fetch(VERCEL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));

    const wrap = addMessage("bot", renderMarkdown(data.reply || "(no reply)"), meta);
    if (data.pipeline && data.pipeline.steps) {
      data.pipeline.steps.forEach((s) => setPipelineStep(s.agent, s.status));
      setPipelineDecision(data.pipeline.decision);
    }
    if (data.pipeline && data.pipeline.decision === "HOLD") {
      wrap.querySelector(".bubble").classList.add("restricted");
    }
    state.history.push({ role: "user", content: userText });
    state.history.push({ role: "assistant", content: data.reply });
  } catch (err) {
    const meta2 = pipelineTraceMeta();
    addMessage("bot", '<span class="error">⚠ ' + esc(err.message) + "</span>", meta2);
    state.history.push({ role: "user", content: userText });
  } finally {
    typingEl.remove();
    setBusy(false);
    resetPipeline();
  }
}

function submitInput() {
  const value = inputEl.value.trim();
  if (!value || state.busy) return;
  inputEl.value = "";
  addMessage("user", renderMarkdown(value));
  ask(value);
}

// ---------------------------------------------------------------- events
$("startBtn").addEventListener("click", () => {
  const runner = readRunner();
  if (!Object.values(runner).some((v) => v && String(v).trim() !== "")) {
    toast("Please fill in at least one field before starting.");
    return;
  }
  state.runner = runner;
  state.history = [];
  const parts = ["Please build my plan. Here's my situation:"];
  if (runner.last_run_gap) parts.push("Last ran consistently: " + runner.last_run_gap + " ago.");
  if (runner.days_per_week) parts.push("Can run " + runner.days_per_week + " days a week.");
  if (runner.last_run_feel) parts.push("My last run felt: " + runner.last_run_feel + ".");
  if (runner.goal) parts.push("Goal: " + runner.goal + ".");
  if (runner.event_date) parts.push("Event on " + runner.event_date + ".");
  submitText(parts.join(" "));
});

function submitText(text) {
  addMessage("user", renderMarkdown(text));
  ask(text);
}

sendBtn.addEventListener("click", submitInput);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitInput(); }
});
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
});

// ---------------------------------------------------------------- init
function welcome() {
  const msg =
    "👋 Welcome to **My Run Mentor AI** — the coach for *returning runners*.\n\n" +
    "Every reply is produced by five agents in a chain: **Researcher → Designer → Maker → Communicator → Manager**, and it's grounded in a **live cohort database** (Google Sheets) that shows the #1 problem: 80% of returning runners start too fast and quit within 8 weeks. My job is to stop that loop.\n\n" +
    "Fill in the **onboarding** panel, or just type something like:\n\n" +
    "> *\"I took two years off, can run three days a week, and my last run felt way too hard.\"*\n\n" +
    "> ⚠ Educational prototype — not medical advice.";
  addMessage("bot", renderMarkdown(msg));
}

function renderAgents() {
  const el = $("agentInfo");
  el.innerHTML = AGENT_BLURBS
    .map(([n, label]) => `<b>${n}</b><small><b style="color:var(--text)">${label}</b></small>`)
    .join("");
}

welcome();
renderAgents();
loadLiveKb();
