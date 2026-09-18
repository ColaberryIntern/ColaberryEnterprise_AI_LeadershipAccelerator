/**
 * Reese Product Phase 1, R3. Regenerates
 * `docs/reese-agentic-employee/TOOL_INVENTORY.md` from
 * `backend/src/scripts/lib/reeseToolInventory.ts`. Pure, no DB connection, no
 * side effect beyond the one file write.
 *
 * Run: npx ts-node src/scripts/generateReeseToolInventory.ts
 */
import fs from 'fs';
import path from 'path';
import { renderReeseToolInventoryMarkdown } from './lib/renderReeseToolInventory';

function main(): void {
  const outPath = path.resolve(__dirname, '../../../docs/reese-agentic-employee/TOOL_INVENTORY.md');
  fs.writeFileSync(outPath, renderReeseToolInventoryMarkdown(), 'utf8');
  console.log(`Wrote ${outPath}`);
}

main();
