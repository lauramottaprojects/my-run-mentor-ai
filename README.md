# My Run Mentor AI

An adaptive, explainable running coach built as an **agentic AI chatbot**.

The service turns a runner's background, goal and constraints into a realistic weekly
training plan. Plans are built by a **five-agent pipeline** and are grounded in a
**live training knowledge base** stored in Google Sheets. The chatbot does **not**
diagnose injuries, provide medical treatment, or guarantee race performance.

> Educational prototype — not a medically or clinically validated coaching system.

## The five agents

```
Atlas (Researcher) → Nova (Designer) → Forge (Maker) → Spark (Communicator) → Meridian (Manager)
```

| Agent | Role | Produces |
| --- | --- | --- |
| **Atlas** | Training Insights Analyst (Researcher) | Factual Research Brief |
| **Nova** | Runner Experience Designer (Designer) | Design Specification with knowledge-base IDs |
| **Forge** | Adaptive Plan Builder (Maker) | Structured weekly plan (validated) |
| **Spark** | Motivation Coach (Communicator) | Customer-facing conversation |
| **Meridian** | Head Running Coach (Manager) | Review + APPROVE / REVISE / HOLD decision |

Every session in a plan is selected from the live knowledge base by ID
(e.g. `T001`, `S001`, `PR001`, `I002`, `SAFE001`).

## Live data

The training knowledge base is stored in a **live Google Sheet** and queried at
runtime by all three components:

- Sheets: `README`, `training_principles`, `session_library`, `progression_rules`,
  `plan_templates`, `safety_rules`, `intensity_guidance`, `sources`, `change_log`
- Runtime knowledge-base contract: `get_plan_template`, `get_session_library`,
  `get_progression_rules`, `get_intensity_guidance`, `get_safety_rules`
  (implemented in [`lib/knowledge.mjs`](lib/knowledge.mjs))
- Check live data: `npm run check:kb`

## Components

| Component | Where | Model |
| --- | --- | --- |
| **Terminal chat** | [`chat.mjs`](chat.mjs) | Gemini `gemini-3.1-flash-lite` (direct, server-side) |
| **Web frontend** | [`index.html`](index.html) on GitHub Pages | Calls the Vercel API |
| **Backend proxy** | [`api/chat.mjs`](api/chat.mjs) on Vercel | Gemini `gemini-3.1-flash-lite` (key from env) |

The Gemini API key lives **only** in the Vercel environment variable
(`GEMINI_API_KEY`); it is never shipped to the browser.

## Running the terminal chat

```bash
export GEMINI_API_KEY=...            # PowerShell: $env:GEMINI_API_KEY = "..."
node chat.mjs                        # interactive
node chat.mjs --demo 1               # use a Garmin-style demonstration profile
node chat.mjs "I want to run my first 5K in September."
```

Commands: `/demo [1|2|3]`, `/new`, `/help`, `/quit`.

## Running the API locally

```bash
export GEMINI_API_KEY=...
node api/dev-server.mjs              # http://localhost:8787
```

## Deploying

### Backend (Vercel)

```bash
vercel link --yes --project my-run-mentor-ai
echo "<API_KEY>" | vercel env add GEMINI_API_KEY production
vercel deploy --prod --yes
```

### Frontend (GitHub Pages)

```powershell
$env:GH_TOKEN = "<github-token>"
powershell -File scripts/deploy-github.ps1
```

Then open `https://<owner>.github.io/my-run-mentor-ai/`.

## Data-source disclosure

Demonstration profiles use the **"My Run Mentor AI demonstration training profile"**
and do **not** access a real Garmin account (safety rule `SAFE005`). Serious symptoms
trigger a `HOLD`/restricted response (`SAFE002`).
