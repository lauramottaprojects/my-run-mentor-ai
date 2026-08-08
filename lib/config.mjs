export const SPREADSHEET_ID = "1HhnrnR9NisMCzzOF493O4nap1PJ2kXDM";
export const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit";

export const SHEETS = {
  README: { name: "README", gid: "1311265438" },
  training_principles: { name: "training_principles", gid: "453493224" },
  session_library: { name: "session_library", gid: "1846455735" },
  progression_rules: { name: "progression_rules", gid: "262611858" },
  plan_templates: { name: "plan_templates", gid: "570286622" },
  safety_rules: { name: "safety_rules", gid: "808667200" },
  intensity_guidance: { name: "intensity_guidance", gid: "545396412" },
  sources: { name: "sources", gid: "89176902" },
  change_log: { name: "change_log", gid: "1029612045" },
};

export const GEMINI_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const DEMO_RUNNERS = [
  {
    id: "demo-001",
    label: "Garmin-style demonstration profile",
    experience_level: "Beginner",
    goal_type: "5K completion",
    target_distance_km: 5,
    event_date: "2026-09-20",
    available_days: 3,
    recent_distance_km: 8,
    recent_duration_min: 60,
    fatigue_level: "Low",
    pain_flag: "No",
    data_source: "My Run Mentor AI demonstration training profile",
  },
  {
    id: "demo-002",
    label: "Recreational demonstration profile",
    experience_level: "Recreational",
    goal_type: "10K completion",
    target_distance_km: 10,
    event_date: "2026-10-04",
    available_days: 3,
    recent_distance_km: 18,
    recent_duration_min: 105,
    fatigue_level: "Moderate",
    pain_flag: "No",
    data_source: "My Run Mentor AI demonstration training profile",
  },
  {
    id: "demo-003",
    label: "General fitness demonstration profile",
    experience_level: "Beginner",
    goal_type: "General fitness",
    target_distance_km: 0,
    event_date: "",
    available_days: 2,
    recent_distance_km: 5,
    recent_duration_min: 40,
    fatigue_level: "Moderate",
    pain_flag: "No",
    data_source: "My Run Mentor AI demonstration training profile",
  },
];
