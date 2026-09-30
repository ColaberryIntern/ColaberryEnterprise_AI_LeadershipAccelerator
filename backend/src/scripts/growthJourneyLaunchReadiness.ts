import { buildReadiness, type Readiness, type ReadinessItem } from '../services/growthJourney/readiness/buildReadiness';

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
 * `growthJourneyExecutionStatus.ts` states it: the imports must stay clear of any
 * module that loads a model FILE, because constructing Sequelize at import time is
 * what a probe must never do. So this file imports exactly one thing - the reader -
 * and the reader reaches models through the barrel (`../../../models`) and nothing
 * through `models/<Name>`. That was checked rather than assumed: `campaignKeys`,
 * `resolveExecutionMode`, `scopeKey` and `proposalFiler` are all clear, and
 * `launchSafety` is NOT - it imports `models/SystemSetting` directly, which is why
 * the kill-switch key is declared in the reader instead of imported from there.
 *
 * ─── NO `@`, EVER - AND THE CLI DOES ITS OWN SCRUBBING ──────────────────────
 *
 * Every line is authored text, an item key, a count or a code-registry string; no
 * row value is interpolated into a reason, and the reader's own suite asserts that.
 * But this file does NOT rely on it: `reason` and `next_move` go through
 * `scrubField` on the way out, in both human and `--json` mode, so the printed
 * surface is safe even if a future reason ever did carry an address. The probe sets
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

/** A reason or next_move is authored text; nothing authored here comes close to this. */
export const FIELD_CAP = 200;

/**
 * One field, scrubbed to the bar this phase actually sets.
 *
 * `redactForLogs` is the WRONG tool here and the first version of this file used it:
 * its email pattern captures the `@` as part of the domain group, so
 * `someone@example.com` becomes `s***@example.com` - the local part is masked and the
 * `@` survives. The Phase 6 contract's bar is literally "`@` anywhere in a JSON
 * response of a new route fails the phase", so masking is not enough. This follows
 * `safeField`'s rule instead - an `@` replaces the whole value - and adds a generous
 * cap, because the `@` rule would not catch a 5,000-character row value with no
 * address in it.
 */
export function scrubField(t: string): string {
  if (t.includes('@')) return 'redacted - the value carried an address';
  return t.length > FIELD_CAP ? `${t.slice(0, FIELD_CAP)}...` : t;
}

/** The two free-text fields, scrubbed. Applied per field, never to a serialised document. */
export function scrubItem(i: ReadinessItem): ReadinessItem {
  return { ...i, reason: scrubField(i.reason), next_move: scrubField(i.next_move) };
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
    const scrubbed = { ...readiness, items: (readiness.items as ReadinessItem[]).map(scrubItem) };
    console.log(JSON.stringify(scrubbed, null, 2));
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
