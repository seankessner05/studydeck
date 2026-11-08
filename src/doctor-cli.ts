import { runClaude } from "./claude.js";
import { formatChecks, runDoctor, summarizeChecks } from "./doctor.js";
import { NOTES_DIR } from "./notes.js";
import { DATA_DIR } from "./paths.js";
import { loadRegistry } from "./registry.js";

const deep = process.argv.includes("--deep");
console.log(`StudyDeck Doctor${deep ? " (deep check: asks Claude one tiny question)" : ""}\n`);
const checks = await runDoctor({ dataDir: DATA_DIR, notesDir: NOTES_DIR, courses: loadRegistry(DATA_DIR), runner: runClaude }, { deep });
console.log(formatChecks(checks));
process.exit(summarizeChecks(checks).fail ? 1 : 0);
