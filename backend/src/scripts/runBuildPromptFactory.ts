/**
 * OH1i (T3): the build-prompt factory, by hand. Nothing here sends anything to anyone; the most
 * it writes is openclaw_signals rows (status 'skipped', never replied to) and DRAFT
 * maya_brain_items rows (never served until a person test-builds and approves them).
 *
 *   node dist/scripts/runBuildPromptFactory.js                    # read-only: the week's top build ideas by virality
 *   node dist/scripts/runBuildPromptFactory.js --collect          # fetch GitHub + Show HN, print, write nothing
 *   node dist/scripts/runBuildPromptFactory.js --collect --apply  # ... and store the new ones in openclaw_signals
 *   node dist/scripts/runBuildPromptFactory.js --draft            # AI writes + structural check, stores nothing
 *   node dist/scripts/runBuildPromptFactory.js --draft --apply    # ... and stores passing prompts as DRAFTS
 *   --limit N  (default 3) prompts per --draft run
 */
import { sequelize } from '../config/database';
import { collectGithubBuildSignals, collectShowHnSignals, saveBuildSignals, viralityScore } from '../services/mayaBrain/viralSignals';
import { readTopBuildSignals, runBuildPromptFactory } from '../services/mayaBrain/buildPromptFactory';

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const limit = Math.max(1, Math.min(10, Number(argValue('--limit') || 3)));

  if (process.argv.includes('--collect')) {
    const [gh, hn] = await Promise.all([collectGithubBuildSignals(), collectShowHnSignals()]);
    const rows = [...gh.rows, ...hn.rows].sort((a, b) => viralityScore(b.platform, b.details) - viralityScore(a.platform, a.details));
    for (const r of rows.slice(0, 25)) console.log(`${viralityScore(r.platform, r.details).toFixed(3)}  ${r.platform.padEnd(10)} ${r.title.slice(0, 90)}  ${r.source_url}`);
    console.log(`collected ${rows.length} (github ${gh.rows.length}, show hn ${hn.rows.length}); errors: ${[...gh.errors, ...hn.errors].join(' | ') || 'none'}`);
    if (apply) console.log('stored:', await saveBuildSignals(rows));
    else console.log('DRY RUN: nothing stored. Add --apply to store new rows (status skipped).');
  } else if (process.argv.includes('--draft')) {
    const outcomes = await runBuildPromptFactory({ dryRun: !apply, limit });
    for (const o of outcomes) {
      console.log(`${o.result.padEnd(11)} ${o.virality.toFixed(3)} ${o.title || ''}  ${o.source_url}${o.problems.length ? `\n            problems: ${o.problems.join('; ')}` : ''}`);
    }
    if (!apply) console.log('DRY RUN: nothing stored. Add --apply to store passing prompts as drafts.');
  } else {
    const top = await readTopBuildSignals({ limit: 10 });
    for (const s of top) console.log(`${s.virality.toFixed(3)}  ${s.platform.padEnd(10)} ${String(s.title).slice(0, 90)}  ${s.source_url}`);
    console.log(`${top.length} build ideas (read-only). Use --collect or --draft.`);
  }
  await sequelize.close();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('runBuildPromptFactory failed:', err?.message || err);
    try { await sequelize.close(); } catch { /* closed */ }
    process.exit(1);
  });
}
