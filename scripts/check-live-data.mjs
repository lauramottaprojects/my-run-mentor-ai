import { loadLiveData, digestLiveData } from "../lib/sheets.mjs";

// Verifies the live Google Sheets database is reachable and prints the digest.
const data = await loadLiveData({ force: true });
console.log(digestLiveData(data));
console.log(`\nrunners: ${data.runners.length}  runs: ${data.runs.length}  summary rows: ${data.summary.length}`);
