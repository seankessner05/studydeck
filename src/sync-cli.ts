import { checkClaude, runClaude } from "./claude.js";
import { formatSyncResult, runSync } from "./sync.js";

const c = checkClaude();
if (!c.ok) {
  console.error(`\n✖ ${c.error}\n`);
  process.exit(1);
}
runSync({ runner: runClaude, onProgress: (m) => console.log(m) })
  .then((r) => console.log("\n" + formatSyncResult(r)))
  .catch((e) => {
    console.error(`\n✖ Sync failed: ${e.message}`);
    console.error("Is the Granola connector set up? Run: claude mcp list\nIf not: claude mcp add --transport http granola https://mcp.granola.ai/mcp  then run /mcp inside Claude Code to log in.");
    process.exit(1);
  });
