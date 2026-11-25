/**
 * enterpriseIntakeDemo - a finished interview starts the client's Command Center and demo (L13.7).
 *
 * The one door is `startClientDemo` / `clientDemoStatus` (sbp/clientDemo). This module decides WHEN
 * to knock, remembers the answer on the intake, and says it in plain words for the admin view and
 * Ali's brief. Nothing here is ever shown or sent to the client.
 *
 * START: `demoSoon` right after the first finished interview, typed or spoken; `syncClientDemos`
 * (5-minute sweep) for one a deploy interrupted or one that was refused for a passing reason.
 *
 * ONCE: an atomic claim on the row (stale after CLAIM_STALE_MS) counts the attempt before anything is
 * called, so a doubled final turn, a repeated webhook and the sweep cannot start two. `startClientDemo`
 * is idempotent on the understanding underneath that.
 *
 * RETRY: `daily_cap`, `off`, `not_configured` and `failed` only, spaced by RETRY_AFTER_MS (the sweep
 * runs every 5 minutes; unspaced, a day at the cap would use every attempt in the first hour), at most
 * MAX_DEMO_ATTEMPTS in all and MAX_DEMO_FAILURES of them real failures, and never for an interview older
 * than DEMO_LOOKBACK_MS, so switching the feature on does not build for every old intake.
 * EXHAUSTED: logged as a dead letter; the admin view says it was not started and why.
 *
 * NOT HANDLED: a build that started and then failed on the way. The understanding already has its
 * project, so starting again only returns it; see directives/enable-platform-build.md.
 *
 * LINKS expire after 12 hours: they are read fresh for the admin view and never stored or emailed.
 */
import { Op } from 'sequelize';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import { startClientDemo, clientDemoStatus, type ClientDemoStart } from '../sbp/clientDemo';

export const MAX_DEMO_ATTEMPTS = 14;
export const MAX_DEMO_FAILURES = 3;
export const DEMO_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CLAIM_STALE_MS = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const SITE = 'https://enterprise.colaberry.ai';

type Refusal = Extract<ClientDemoStart, { ok: false }>['reason'];

/** How long to wait before trying again. A reason that is not here is never retried. */
export const RETRY_AFTER_MS: Partial<Record<Refusal, number>> = {
  failed: HOUR,
  daily_cap: 6 * HOUR,
  off: 12 * HOUR,
  not_configured: 12 * HOUR,
};

const log = (event: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>, error_class?: string) =>
  (outcome === 'failure' ? console.error : console.log)(JSON.stringify({
    timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'enterprise-intake-demo',
    event, outcome, ...(error_class ? { error_class } : {}), context,
  }));

const messageOf = (err: unknown) => String((err as Error)?.message || err).slice(0, 300);

type Row = Pick<EnterpriseIntake,
  'understanding_id' | 'interviewed_at' | 'demo_started_at' | 'demo_attempts' | 'demo_failures' | 'demo_reason' | 'demo_attempted_at' | 'signed_at' | 'lost_at'>;

const attemptsOf = (i: Row) => i.demo_attempts || 0;
const failuresOf = (i: Row) => i.demo_failures || 0;

/** May this intake ever be tried again (now or after its wait)? */
export function demoCanStillStart(i: Row, now: Date): boolean {
  return Boolean(i.understanding_id && i.interviewed_at)
    && !i.demo_started_at && !i.signed_at && !i.lost_at
    && now.getTime() - new Date(i.interviewed_at!).getTime() <= DEMO_LOOKBACK_MS
    && attemptsOf(i) < MAX_DEMO_ATTEMPTS && failuresOf(i) < MAX_DEMO_FAILURES
    && (!i.demo_reason || RETRY_AFTER_MS[i.demo_reason as Refusal] !== undefined);
}

/** May it be tried right now? */
export function demoDue(i: Row, now: Date): boolean {
  if (!demoCanStillStart(i, now)) return false;
  if (!i.demo_reason || !i.demo_attempted_at) return true;
  return now.getTime() - new Date(i.demo_attempted_at).getTime() >= RETRY_AFTER_MS[i.demo_reason as Refusal]!;
}

export type DemoStartResult = 'started' | 'already' | 'refused' | 'failed' | 'not_due' | 'claimed_elsewhere' | 'missing';

/** Start this client's demo if it is due. Never throws for a refused or failed start. */
export async function startDemoOnce(intakeId: string, now = new Date()): Promise<DemoStartResult> {
  const i = await EnterpriseIntake.findByPk(intakeId);
  if (!i) return 'missing';
  if (!demoDue(i, now)) return 'not_due';

  const attempt = attemptsOf(i) + 1;
  const [n] = await EnterpriseIntake.update(
    { demo_claimed_at: now, demo_attempted_at: now, demo_attempts: attempt } as Partial<EnterpriseIntake>,
    { where: {
      id: i.id,
      demo_started_at: null,
      // A row that existed before this column has null, which `= 0` would never match.
      demo_attempts: i.demo_attempts ?? null,
      [Op.or]: [{ demo_claimed_at: null }, { demo_claimed_at: { [Op.lt]: new Date(now.getTime() - CLAIM_STALE_MS) } }],
    } as Record<string, unknown> },
  );
  if (n !== 1) return 'claimed_elsewhere';

  const r = await startClientDemo({ understandingId: i.understanding_id! })
    .catch((err): ClientDemoStart => ({ ok: false, reason: 'failed', error: messageOf(err) }));

  if (r.ok) {
    await EnterpriseIntake.update(
      { demo_started_at: now, demo_claimed_at: null, demo_reason: null, demo_error: null } as Partial<EnterpriseIntake>,
      { where: { id: i.id } },
    );
    log('enterprise_demo_started', 'success', { intake_id: i.id, project_id: r.projectId, reused: r.reused, attempt });
    return r.reused ? 'already' : 'started';
  }

  const failures = failuresOf(i) + (r.reason === 'failed' ? 1 : 0);
  await EnterpriseIntake.update(
    { demo_claimed_at: null, demo_reason: r.reason, demo_error: r.error.slice(0, 500), demo_failures: failures } as Partial<EnterpriseIntake>,
    { where: { id: i.id } },
  );
  const context = { intake_id: i.id, step: 'client_demo', reason: r.reason, attempt, failures, message: r.error.slice(0, 200) };
  if (r.reason === 'failed') {
    const dead = failures >= MAX_DEMO_FAILURES || attempt >= MAX_DEMO_ATTEMPTS;
    log(dead ? 'enterprise_intake_dead_letter' : 'enterprise_demo_failed', 'failure', context, 'UpstreamUnavailable');
    return 'failed';
  }
  if (attempt >= MAX_DEMO_ATTEMPTS) log('enterprise_intake_dead_letter', 'failure', context, 'QuotaError');
  else log('enterprise_demo_refused', 'partial', context);
  return 'refused';
}

/** Right after the interview. Off the client's response: it can neither delay nor fail it. */
export function demoSoon(intakeId: string): void {
  startDemoOnce(intakeId).catch((err) => log('enterprise_demo_failed', 'failure', { intake_id: intakeId, message: messageOf(err) }, 'UpstreamUnavailable'));
}

/**
 * Sweep: finished interviews with no demo. At most ONE new build a run: the daily cap counts builds
 * that were queued, and a new one is queued only after its plan is written (about a minute).
 */
export async function syncClientDemos(limit = 50, now = new Date()): Promise<{ started: number; refused: number; failed: number }> {
  const rows = await EnterpriseIntake.findAll({
    where: {
      understanding_id: { [Op.ne]: null },
      interviewed_at: { [Op.gte]: new Date(now.getTime() - DEMO_LOOKBACK_MS) },
      demo_started_at: null,
      demo_attempts: { [Op.or]: [null, { [Op.lt]: MAX_DEMO_ATTEMPTS }] },
      demo_reason: { [Op.or]: [null, { [Op.in]: Object.keys(RETRY_AFTER_MS) }] },
      signed_at: null,
      lost_at: null,
    } as Record<string, unknown>,
    order: [['interviewed_at', 'ASC']],
    limit,
  });
  const out = { started: 0, refused: 0, failed: 0 };
  for (const r of rows.filter((x) => demoDue(x, now))) {
    try {
      const s = await startDemoOnce(r.id, now);
      if (s === 'refused') out.refused++;
      else if (s === 'failed') out.failed++;
      else if (s === 'started') { out.started++; break; }
    } catch (err) {
      out.failed++;
      log('enterprise_demo_failed', 'failure', { intake_id: r.id, message: messageOf(err) }, 'UpstreamUnavailable');
    }
  }
  return out;
}

export interface ClientDemoView {
  state: 'no_interview' | 'waiting' | 'refused' | 'planning' | 'building' | 'ready' | 'failed' | 'unknown';
  /** One plain sentence or two, for a person. */
  message: string;
  commandCenterUrl: string | null;
  demoUrl: string | null;
  linkExpiresAt: string | null;
}

const REASON_WORDS: Record<Refusal, string> = {
  off: 'Client demo builds are switched off.',
  not_configured: 'No internal enrollment is set to hold client projects.',
  daily_cap: 'The daily limit on demo builds was reached.',
  too_thin: 'The interview did not give us enough to build from.',
  not_found: 'The interview write-up could not be found.',
  not_extracted: 'The interview write-up is not finished.',
  not_confirmed: 'The interview write-up has not been confirmed.',
  failed: 'The build could not be started.',
};

/** What to show a person about this client's demo. Reads fresh links every time. Never throws. */
export async function clientDemoView(i: EnterpriseIntake, now = new Date()): Promise<ClientDemoView> {
  const view = (state: ClientDemoView['state'], message: string): ClientDemoView =>
    ({ state, message, commandCenterUrl: null, demoUrl: null, linkExpiresAt: null });
  if (!i.understanding_id || !i.interviewed_at) return view('no_interview', 'It starts when the AI interview is finished.');
  try {
    const s = await clientDemoStatus(i.understanding_id);
    switch (s.state) {
      case 'planning': return view('planning', 'The project plan is being written.');
      case 'building': return view('building', 'The Command Center and demo are being built.');
      case 'failed': return view('failed', 'The build started but did not finish. It is not tried again automatically.');
      case 'ready': return {
        state: 'ready',
        message: s.demo_url ? 'The Command Center and demo are ready to show.' : 'The Command Center is ready. The demo page did not build.',
        commandCenterUrl: s.command_center_url ? `${SITE}${s.command_center_url}` : null,
        demoUrl: s.demo_url ? `${SITE}${s.demo_url}` : null,
        linkExpiresAt: s.link_expires_at,
      };
      default:
    }
    const again = demoCanStillStart(i, now);
    if (i.demo_reason) {
      const why = REASON_WORDS[i.demo_reason as Refusal] || 'The build could not be started.';
      return view('refused', `${why} ${again ? 'It will be tried again automatically.' : 'It will not be tried again automatically.'}`);
    }
    if (i.demo_started_at) return view('failed', 'It was started, but its project can no longer be found.');
    return again ? view('waiting', 'It has not started yet. It should start within a few minutes.') : view('refused', 'No demo was started for this client, and none will be started automatically.');
  } catch (err) {
    log('enterprise_demo_status_failed', 'failure', { intake_id: i.id, message: messageOf(err) }, 'UpstreamUnavailable');
    return view('unknown', 'The demo status could not be read. Reload the page to try again.');
  }
}
