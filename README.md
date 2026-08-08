# My Run Mentor AI

An AI running coach for **returning runners** — built as a five-agent organisation with a live data source.

## What this is

- **Frontend** — `index.html` + `style.css` + `app.js`, hosted on GitHub Pages. No build step, no API keys in the browser.
- **Backend** — a Vercel serverless function (`api/gemini.mjs`) that proxies Gemini (`gemini-3.1-flash-lite`). The API key lives only in a Vercel environment variable, never client-side.
- **Terminal chat** — `chat.mjs`, a Node CLI that talks to Gemini directly and runs the same five-agent pipeline.

Both the web and terminal clients load their context from the **live runner database** in Google Sheets
(`Runners`, `Runs`, `Summary` sheets) via the public `gviz/tq?tqx=out:csv` feeds — no API keys required.

## The five agents (unbroken chain)

Every reply passes through all five agents in order; each agent's output is the next one's input:

**Researcher → Designer → Maker → Communicator → Manager**

| Agent | Role | Domain |
|-------|------|--------|
| Researcher | Analyses the situation + live cohort data | market research, behavioural analytics |
| Designer | Designs the coaching experience | UX, coaching science |
| Maker | Builds the concrete training plan | session design, effort rules |
| Communicator | Writes the user-facing message | persuasion, copywriting |
| Manager | Reviews the chain, approves, decides | strategy, safety review |

The pipeline is grounded in the live database, which documents the core problem the coach solves:
80% of returning runners fall into a "too much too soon" loop and quit within 8 weeks.

## Run locally

```bash
# 1. Terminal chat (needs the Gemini key)
$env:GEMINI_API_KEY = "..."        # or drop it in ./gemini-api-key.txt
npm run chat

# 2. Check the live database
npm run check:data
```

Terminal chat commands: `/quit`, `/data` (print live database digest), `/new` (restart onboarding).

## Deploy

### Backend (Vercel)

```bash
vercel link --yes --project my-run-mentor-ai
echo $env:GEMINI_API_KEY | vercel env add GEMINI_API_KEY production
vercel deploy --prod --yes
```

### Frontend (GitHub Pages)

```bash
$env:GH_TOKEN = "ghp_..."
powershell -File scripts/deploy-github.ps1
```

The script creates the repo, pushes all source files via the GitHub API, and enables Pages.

## Architecture notes

- `lib/config.mjs` — spreadsheet ID, sheets, model name (`gemini-3.1-flash-lite`).
- `lib/sheets.mjs` — CSV parser + live Google Sheets fetcher + live summary enrichment.
- `lib/prompts.mjs` — company context and the five agent definitions (from `company-context.md` / `five-agents.md`).
- `lib/pipeline.mjs` — Gemini caller + the sequential five-agent handoff chain.
- `api/gemini.mjs` — Vercel handler: loads live data, detects safety issues, runs the pipeline.
- `chat.mjs` — terminal chat reusing the same `lib/` modules.

> Educational prototype — not medical advice.
