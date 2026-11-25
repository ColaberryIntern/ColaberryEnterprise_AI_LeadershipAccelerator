/**
 * enterpriseIntakeSweep - the Enterprise intake's 5-minute catch-up, in one place (v2).
 *
 * server.ts used to chain three steps inline. v2 adds four more, L13.7 one, and server.ts is far past the
 * 500-line ceiling, so the chain lives here and server.ts makes one call.
 *
 * Order matters only loosely (each step is idempotent and retried next run):
 *   1. Basecamp lists (W29)        - open/finish lists, post interview write-ups
 *   2. Client files (v2)           - attach uploaded research to their list
 *   3. Research (W30)              - research + options for finished interviews, then post
 *   4. Client demos (L13.7)        - start the Command Center and demo the interview could not
 *   5. Comms (W31)                 - copy emails and calls onto the list, rename by stage
 *   6. Interview reminders (v2)    - "later" interviews whose time has come
 *   7. Meeting posts (v2)          - booked meetings onto the list
 *   8. Ali's briefs (v2)           - one email per client once research + meeting are in
 *
 * Every step has its own catch: one failing (Basecamp down, SMTP down) never skips the others.
 * A step that did something, or failed, logs one structured line.
 */

import { randomUUID } from 'crypto';

type Step = { name: string; run: () => Promise<Record<string, number>> };

export const STEPS: Step[] = [
  { name: 'basecamp', run: async () => (await import('./enterpriseIntakeBasecamp')).syncEnterpriseIntakesToBasecamp() },
  { name: 'files', run: async () => (await import('./enterpriseIntakeFiles')).syncClientFiles() },
  { name: 'research', run: async () => (await import('./enterpriseIntakeResearch')).syncEnterpriseResearch() },
  { name: 'client_demos', run: async () => (await import('./enterpriseIntakeDemo')).syncClientDemos() },
  { name: 'comms', run: async () => (await import('./enterpriseIntakeSync')).syncEnterpriseComms() },
  { name: 'reminders', run: async () => (await import('./enterpriseIntakeReminders')).syncInterviewReminders() },
  { name: 'meeting_posts', run: async () => (await import('./enterpriseIntakeMeetingPost')).syncMeetingPosts() },
  { name: 'ali_briefs', run: async () => (await import('./enterpriseIntakeAliBrief')).syncAliBriefs() },
];

let running = false;

/** One sweep at a time: a run still going when the next tick fires is not doubled (returns null). */
export async function runEnterpriseIntakeSweep(steps: Step[] = STEPS): Promise<Record<string, Record<string, number> | { error: string }> | null> {
  if (running) {
    console.warn(JSON.stringify({ level: 'warn', service: 'enterprise-intake-sweep', event: 'enterprise_sweep_overlap_skipped', outcome: 'partial', context: {} }));
    return null;
  }
  running = true;
  try {
    return await runSteps(steps);
  } finally {
    running = false;
  }
}

/** A step that has not settled by then is abandoned for this run, so it can never wedge the guard. */
export const STEP_TIMEOUT_MS = 4 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(Object.assign(new Error(`step ${name} timed out after ${ms}ms`), { error_class: 'TimeoutError' })), ms);
    }),
  ]);
}

async function runSteps(steps: Step[], timeoutMs = STEP_TIMEOUT_MS): Promise<Record<string, Record<string, number> | { error: string }>> {
  const out: Record<string, Record<string, number> | { error: string }> = {};
  const correlation_id = randomUUID();
  for (const step of steps) {
    const started = Date.now();
    try {
      const result = await withTimeout(step.run(), timeoutMs, step.name);
      out[step.name] = result;
      if (Object.values(result || {}).some((v) => typeof v === 'number' && v > 0)) {
        const partial = Number((result as Record<string, number>).failed || 0) > 0;
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: partial ? 'warn' : 'info', service: 'enterprise-intake-sweep',
          event: `enterprise_sweep_${step.name}`, correlation_id, outcome: partial ? 'partial' : 'success', duration_ms: Date.now() - started, context: result }));
      }
    } catch (err) {
      out[step.name] = { error: String((err as Error)?.message || err).slice(0, 200) };
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'enterprise-intake-sweep',
        event: `enterprise_sweep_${step.name}_failed`, correlation_id, outcome: 'failure',
        error_class: (err as { error_class?: string })?.error_class || (err as Error)?.name || 'UnknownError',
        duration_ms: Date.now() - started, context: { message: String((err as Error)?.message || err).slice(0, 200) } }));
    }
  }
  return out;
}

/** Test seam: run with a short step timeout. */
export const runStepsForTest = runSteps;
