/**
 * Reese Product Phase 1, R2. Regenerates
 * `docs/reese-agentic-employee/BEHAVIOUR_INVENTORY.md` from
 * `backend/src/scripts/lib/reeseBehaviourInventory.ts`. Pure, no DB
 * connection, no side effect beyond the one file write.
 *
 * Run: npx ts-node src/scripts/generateReeseBehaviourInventory.ts
 */
import fs from 'fs';
import path from 'path';
import { renderReeseBehaviourInventoryMarkdown } from './lib/renderReeseBehaviourInventory';

function main(): void {
  const outPath = path.resolve(__dirname, '../../../docs/reese-agentic-employee/BEHAVIOUR_INVENTORY.md');
  fs.writeFileSync(outPath, renderReeseBehaviourInventoryMarkdown(), 'utf8');
  console.log(`Wrote ${outPath}`);
}

main();
