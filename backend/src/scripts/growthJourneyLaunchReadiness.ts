import {
  buildReadiness,
  scrubItem,
  scrubReadiness,
  type Readiness,
  type ReadinessItem,
} from '../services/growthJourney/readiness/buildReadiness';

/**
 * Growth Journey OS — the launch readiness checklist (Phase 6, T610). READ-ONLY.
 *
 * Prints the ordered list of conditions between here and a live journey, each with
 * what was found and what would clear it, then the score and the next move:
 *
 *   node dist/scripts/growthJourneyLaunchReadiness.js            # a checklist
 *   node dist/scripts/growthJourneyLaunchReadiness.js --json     # one JSON document
 *
 * ─── IT FOLLOWS THE PROBE'S IMPORT RULE, WHICH IS LOAD-BEARING ──────────────
 *
 * `growthJourneyExecutionStatus.ts` states the rule, and it is narrower than it sounds:
 * no module in the closure may VALUE-import a `models/<Name>` file, because the barrel
 * is what orders model initialisation. It is a SPELLING rule, not a "never construct
 * Sequelize at load" rule - `config/database` constructs Sequelize in its module body,
 * the barrel depends on it, and the probe itself loads both. Saying otherwise, as the
 * first version of this header did, claims more than the code does.
 *
 * So this file imports exactly one thing - the reader - and the reader value-imports only
 * the barrel. Its two `import type` lines DO name model files, and that is fine: a type
 * import is erased at compile time and loads nothing.
 *
 * Checked, with one correction to an earlier claim: `campaignKeys` and `scopeKey` are
 * clear. `resolveExecutionMode` is NOT - it imports `launchSafety`, which value-imports
 * `models/SystemSetting` - so this reader does not touch it, and the per-scope modes stay
 * with the probe that already prints them. `launchSafety` is likewise untouched, which is
 * why the kill-switch key is declared in the reader rather than imported from there.
 *
 * ─── NO `@`, EVER - AND THE CLI DOES ITS OWN SCRUBBING ──────────────────────
 *
 * Every line is authored text, an item key, a count or a code-registry string; no
 * row value is interpolated into a reason, and the reader's own suite asserts that.
 * But this file does NOT rely on it: `reason` and `next_move` go through the reader's own
 * `scrubField` on the way out, in both human and `--json` mode, so the printed surface is
 * safe even if a future reason ever did carry an address. The scrubber lives in the reader
 * because the ROUTE serves the same report and the contract's bar names a route's response;
 * one definition, both surfaces. The probe sets
 * the precedent - it passes its reason strings through `safeField` for the same
 * reason - and the first version of this file claimed the guarantee while relying
 * entirely on the reader, which its own test then caught.
 *
 * The scrubbing is applied PER FIELD, never to the serialised document: running a
 * redactor over a whole JSON envelope is what mangles roughly one UUID in fifty.
 *
 * The separators are words and dashes rather than punctuation that could look like
 * an address, so the guard on the output is a plain `not.toContain('@')` over the
 * raw lines - exactly as the probe does it.
 *
 * It writes nothing. No create, update or destroy is reachable from here.
 */

export interface ReadinessArgs {
  json: boolean;
}

export function parseArgs(argv: string[]): ReadinessArgs {
  const out: ReadinessArgs = { json: false };
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else throw new Error(`unknown argument: ${a} (usage: growthJourneyLaunchReadiness [--json])`);
  }
  return out;
}

/** `[x]` ready, `[ ]` blocked, `[?]` not knowable from here. */
export function mark(ready: boolean | null): string {
  if (ready === null) return '[?]';
  return ready ? '[x]' : '[ ]';
}

export function formatReadiness(r: Readiness): string[] {
  const lines: string[] = [];
  lines.push('Growth Journey OS - launch readiness');
  lines.push(`as of ${r.as_of}`);
  lines.push('');
  for (const raw of r.items as ReadinessItem[]) {
    const i = scrubItem(raw);
    lines.push(`${mark(i.ready)} ${i.key}`);
    lines.push(`      found - ${i.reason}`);
    // The next move is printed for READY items too: the list doubles as the runbook,
    // and knowing what made an item pass is what lets someone re-do it elsewhere.
    lines.push(`      to clear - ${i.next_move}`);
  }
  lines.push('');
  const pct = r.score.pct === null ? 'not computable - nothing could be checked' : `${r.score.pct}%`;
  lines.push(`score     ${r.score.ready} of ${r.score.known} knowable conditions met (${pct})`);
  lines.push(`unknown   ${r.score.unknown}`);
  lines.push(`next move ${r.next_move ?? 'nothing is blocked'}`);
  return lines;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const readiness = await buildReadiness({ now: new Date() });
  if (args.json) {
    // The items are scrubbed field by field and the rest of the document is passed
    // through untouched - so `as_of` and the score keep their exact values, and the
    // redactor never sees an envelope it could rewrite.
    console.log(JSON.stringify(scrubReadiness(readiness), null, 2));
    return;
  }
  for (const line of formatReadiness(readiness)) console.log(line);
}

/* istanbul ignore next - the CLI entry point, exercised by running the script */
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(`growthJourneyLaunchReadiness failed: ${err instanceof Error ? err.name : 'Error'}`);
      process.exit(1);
    });
}
