export const SPREADSHEET_ID = "121xsbzRPnzlAhvDK4Yo1nPchVhIAHaeRBKvg5tHWZ8s";
export const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit?usp=sharing";

// Sheets are referenced by NAME so re-imports / edits never break the app.
export const SHEETS = {
  runners: "Runners",
  runs: "Runs",
  summary: "Summary",
};

export function sheetCsvUrl(sheetName) {
  return (
    "https://docs.google.com/spreadsheets/d/" +
    SPREADSHEET_ID +
    "/gviz/tq?tqx=out:csv&sheet=" +
    encodeURIComponent(sheetName)
  );
}

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
