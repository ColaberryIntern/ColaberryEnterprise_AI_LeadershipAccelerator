#!/usr/bin/env node
// CLI to actually execute an intern exit. The @CB exit_intern tool ONLY
// previews; this script does the writes (CCPP UPDATE + Basecamp un-assign).
//
// Usage:
//   node backend/src/scripts/confirmInternExit.js --intern-id 470 --reason placed --confirmed-by ali
//
// Reasons: quit | nochow | placed | fired | never
//
// SAFETY:
//   - Requires --confirmed-by flag with a non-empty value (for audit log).
//   - Prints the preview first, then asks Ali to type EXIT-CONFIRM-<InternID>
//     within 30s. Without that token, exits without writing.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const readline = require('readline');
const { previewExit, executeExit } = require(path.resolve(__dirname, './lib/internExit'));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1];
}

(async () => {
  const internId = parseInt(arg('intern-id', '0'), 10);
  const reasonKey = arg('reason');
  const confirmedBy = arg('confirmed-by') || arg('by');
  const skipPrompt = process.argv.includes('--yes');
  if (!internId || !reasonKey || !confirmedBy) {
    console.error('Usage: node confirmInternExit.js --intern-id <N> --reason <quit|nochow|placed|fired|never> --confirmed-by <name> [--yes]');
    process.exit(1);
  }

  // Preview
  console.log(`\n=== Preview exit for InternID ${internId}, reason=${reasonKey}, by=${confirmedBy} ===`);
  const preview = await previewExit({ query: String(internId), reason: reasonKey });
  if (preview.candidates.length === 0) {
    console.error('No CCPP candidate row found. Aborting.');
    process.exit(1);
  }
  const top = preview.candidates.find((c) => c.InternID === internId) || preview.candidates[0];
  if (top.InternID !== internId) {
    console.error(`Top candidate is InternID ${top.InternID} not the requested ${internId}. Aborting.`);
    process.exit(1);
  }
  console.log(`Intern: ${top.name}  (${top.email || 'no email on file'})`);
  console.log(`Active: ${top.isActive}, manager: ${top.manager}, start: ${top.startDate}`);
  console.log(`Reason: ${preview.reasonResolved?.label} (id ${preview.reasonResolved?.id})`);
  console.log(`Basecamp todos to un-assign: ${preview.basecampTodos.length}`);
  for (const t of preview.basecampTodos) console.log(`  - ${t.title}  (${t.todolistName})`);

  if (!skipPrompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const token = `EXIT-CONFIRM-${internId}`;
    const answer = await new Promise((res) => { rl.question(`\nType "${token}" to execute, anything else to abort: `, (a) => { rl.close(); res(a); }); });
    if ((answer || '').trim() !== token) {
      console.log('Aborted.');
      process.exit(0);
    }
  } else {
    console.log('\n--yes specified; skipping interactive prompt.');
  }

  console.log('\nExecuting...');
  const result = await executeExit({ internId, reasonKey, confirmedBy });
  console.log('Done. Audit:');
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
