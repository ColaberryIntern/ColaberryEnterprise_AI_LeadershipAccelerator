import cron from 'node-cron';
import { execFile } from 'child_process';
import * as path from 'path';
import { instrumentCronJob } from '../cronInstrumentation';

/**
 * Daily visitor geo-IP enrichment, so the landing-page snack bar keeps having something
 * honest to say.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────────────
 * GEO-1 shipped the enrichment and the backfill was run by hand. On 2026-11-11 that made
 * the bar render for the first time: the feed returned six events (Phoenix, Newark,
 * Chicago x2, Los Angeles) where it had always returned an empty list.
 *
 * That state decays. The feed only considers leads from the last 72 hours, so without a
 * recurring run those six age out and the bar goes dark again within about three days,
 * and every visitor arriving after the manual backfill keeps a NULL city for ever. A
 * feature that works once and then quietly stops is worse than one that never shipped,
 * because by then nobody is looking at it.
 *
 * ── WHY A CHILD PROCESS AND NOT AN IMPORT ───────────────────────────────────────────
 * The GeoLite2 City database is ~50MB and the maxmind reader holds it open. The
 * production host's kernel journal counts hundreds of OOM kills and it runs five Postgres
 * instances, so the long-running backend must not carry that resident. `enrichVisitorGeo`
 * says so in its own header and is written as a short-lived script for exactly this
 * reason. Importing it here to save a process would defeat the design it documents, so
 * this spawns it and lets the kernel reclaim the 50MB when it exits.
 *
 * This also keeps ONE implementation: the backfill, a manual re-run and this nightly pass
 * are the same code path on different days. Nothing to drift.
 *
 * ── FAILURE PATH (Failure-First Design) ─────────────────────────────────────────────
 * 1. WHAT IF IT FAILS? The run throws, instrumentCronJob records a failed run against the
 *    VisitorGeoEnrichment agent row, and cronHealthAlertService's missed-run detector can
 *    see it. No city is written; none is corrupted. The next night repairs it, because the
 *    script selects on `city IS NULL` and is idempotent.
 * 2. RETRIES? None here, deliberately. A retry loop against a local mmdb file buys
 *    nothing: a failure means the database or the process is wrong, and both persist for
 *    longer than a backoff. The schedule IS the retry, once a day, comfortably inside the
 *    72-hour window the feed cares about.
 * 3. RECOVERY IF IT KEEPS FAILING: the enrichment is runnable by hand
 *    (`node dist/scripts/enrichVisitorGeo.js`), and the bar degrades to empty rather than
 *    to wrong - "no feed, no bar" is its designed behaviour, so a sustained failure shows
 *    up as an absent bar, never as a fabricated city.
 * 4. HANDLED vs NOT HANDLED. Handled: a missing database file (the script exits non-zero
 *    naming the path), a non-zero exit, a hang (bounded below), and an overlapping run.
 *    NOT handled: a GeoLite2 file that is present but corrupt - maxmind throws and this
 *    reports a failed run, which is the right outcome but not a repair.
 */

/**
 * 09:35 UTC - about 3:35 AM Central. A quiet minute no other job in schedulerService
 * holds, and long before anyone reads a dashboard.
 *
 * Daily rather than hourly on purpose. The feed's window is 72 hours, so a visitor is
 * named within a day and still has two days of window left; an hourly pass would pay the
 * 50MB spike 24 times over on an OOM-prone host to buy a few hours of freshness nobody
 * is watching for.
 */
export const VISITOR_GEO_SCHEDULE = '35 9 * * *';

/**
 * Bounded so a wedged child cannot hold the slot for ever. A full ~6.4k-row pass measured
 * 170ms in production, so five minutes is three orders of magnitude of headroom and still
 * a hard ceiling rather than an open-ended wait.
 */
export const VISITOR_GEO_TIMEOUT_MS = 5 * 60 * 1000;

/** Compiled sibling of this file: dist/services/scheduling -> dist/scripts. */
export function enrichmentScriptPath(): string {
  return path.resolve(__dirname, '..', '..', 'scripts', 'enrichVisitorGeo.js');
}

export interface GeoRunResult {
  /**
   * The script's own final counters, when it emitted them. Null when it produced no
   * parseable `end` event - which is logged as such rather than smoothed into a success.
   */
  counters: Record<string, unknown> | null;
  stderr: string;
}

/** Injectable so tests never spawn a real node process or touch a 50MB database. */
export interface GeoRunDeps {
  run: (
    file: string,
    args: string[],
    opts: { timeout: number },
  ) => Promise<{ stdout: string; stderr: string }>;
}

const defaultDeps: GeoRunDeps = {
  run: (file, args, opts) => new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: opts.timeout, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // Carry the child's own output onto the error. Without it the operator gets
          // "Command failed" and has to reproduce the run to learn anything at all.
          const e = err as Error & { stdout?: string; stderr?: string };
          e.stdout = String(stdout);
          e.stderr = String(stderr);
          reject(e);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  }),
};

/** The script logs one JSON object per line; the last `end` event carries the counters. */
export function parseEndEvent(stdout: string): Record<string, unknown> | null {
  const lines = String(stdout).split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]) as Record<string, unknown>;
      if (parsed && parsed.event === 'end') return parsed;
    } catch {
      // Not JSON. The script writes only JSON lines, so this is runtime noise (a node
      // warning, say) and skipping it is correct.
    }
  }
  return null;
}

/**
 * Guards an overlapping run. A second pass while the first is live would do no damage -
 * the script is idempotent - but it would double the resident 50MB on a host that
 * OOM-kills, which is the one cost worth avoiding.
 */
let inFlight = false;

export function __resetInFlightForTests(): void {
  inFlight = false;
}

export async function runVisitorGeoEnrichment(
  deps: GeoRunDeps = defaultDeps,
): Promise<GeoRunResult> {
  if (inFlight) {
    throw new Error('VisitorGeoEnrichment already in flight; skipping this tick');
  }
  inFlight = true;
  try {
    const { stdout, stderr } = await deps.run(
      process.execPath,
      [enrichmentScriptPath()],
      { timeout: VISITOR_GEO_TIMEOUT_MS },
    );
    return { counters: parseEndEvent(stdout), stderr: String(stderr) };
  } finally {
    // Released on the failure path too, or one error would wedge the job for ever.
    inFlight = false;
  }
}

/**
 * Tracked under the ai_agents row VisitorGeoEnrichment (agentRegistrySeed.ts).
 *
 * Unlike MetaAdSpendSync this ships ENABLED: it needs no token and no configuration, the
 * database is baked into the image by the Build images workflow, and the behaviour was
 * verified against production before this was written. There is nothing for an operator
 * to turn on, so shipping it disabled would only mean the bar goes dark while a row waits
 * for someone to notice it.
 */
export function registerVisitorGeoCrons(): void {
  cron.schedule(VISITOR_GEO_SCHEDULE, () => {
    // A literal, not a constant: the cron registry guard reads names from source, and a
    // constant resolves to no name it can match against the seed row.
    instrumentCronJob('VisitorGeoEnrichment', async () => {
      const result = await runVisitorGeoEnrichment();
      process.stdout.write(`${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'visitor-geo-enrichment-cron',
        event: 'run_complete',
        outcome: 'success',
        // The script's own counters, forwarded rather than recomputed, so the cron can
        // never disagree with the job about what happened.
        context: result.counters ?? { note: 'script emitted no parseable end event' },
      })}\n`);
    }).catch((err) => {
      console.error('[Scheduler] VisitorGeoEnrichment failed:', err);
    });
  });
}
