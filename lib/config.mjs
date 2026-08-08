import { DEMO_RUNNERS, ONBOARDING_QUESTIONS } from "./questions.mjs";

export { DEMO_RUNNERS, ONBOARDING_QUESTIONS };

export const SPREADSHEET_ID = "1vmGblhFK7m1d2HOrqWXaTzK_JS4eYg9sQ4TZ1FDEn2c";
export const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit";

// Sheets are referenced by NAME so that re-importing the knowledge base
// (which reassigns Google Sheet ids/gids) never breaks the app.
export const SHEETS = {
  README: { sheet: "README" },
  onboarding: { sheet: "onboarding" },
  training_principles: { sheet: "training_principles" },
  session_library: { sheet: "session_library" },
  progression_rules: { sheet: "progression_rules" },
  plan_templates: { sheet: "plan_templates" },
  safety_rules: { sheet: "safety_rules" },
  intensity_guidance: { sheet: "intensity_guidance" },
  sources: { sheet: "sources" },
  change_log: { sheet: "change_log" },
};

export const GEMINI_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
