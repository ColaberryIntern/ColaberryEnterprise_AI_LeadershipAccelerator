/**
 * clientDemo - the door for a client (not a student): conversation in, hosted Command Center and
 * demo out. L13.7.
 *
 * The caller has a finished interview (a `project_understandings` record). This starts the ONE build
 * pipeline with `setupMode: 'platform'`, so the platform builds and hosts STORY-000 and STORY-900
 * itself. That costs about $2 per project. Everything else in this codebase that starts a build leaves
 * the mode at 'student', where those two are tasks the student builds at their own cost.
 *
 * REFUSES BEFORE SPENDING when the master switch is off, no holding enrollment is configured, the
 * understanding already failed to qualify, or the daily cap is reached. Never throws for those: a demo
 * that could not be started must not cost the client their interview.
 *
 * WHO HOLDS THE PROJECT. `build_intake` and `projects` belong to an enrollment. A client is not a
 * student, so nothing is created for them: every client project lives under the one enrollment named by
 * PLATFORM_BUILD_CLIENT_ENROLLMENT, and the client reaches the pages through signed links only.
 *
 * RETRY: idempotent on the understanding (a second call returns the first call's project). A failed
 * build is retried by publishing again; see directives/enable-platform-build.md.
 * NOT HANDLED: two DIFFERENT clients starting in the same instant can pass the cap together, by one.
 * The in-flight guard is per process; production runs one backend.
 */
import { env } from '../../config/env';
import { platformBuildOn, runsInLastDay } from './platformBuild/queue';
import { platformBuildForPortal } from './platformBuild/portalView';

export type ClientDemoStart =
  | { ok: true; projectId: string; reused: boolean }
  | { ok: false; reason: 'off' | 'not_configured' | 'daily_cap' | 'not_found' | 'not_extracted' | 'not_confirmed' | 'too_thin' | 'failed'; error: string };

export interface ClientDemoStatus {
  /** none: no demo was started. planning: the plan is being written. building: the pages are being made. */
  state: 'none' | 'planning' | 'building' | 'ready' | 'failed';
  project_id: string | null;
  /** Relative paths under /api/platform-view/. Signed; mint fresh ones on every read, never store them. */
  command_center_url: string | null;
  demo_url: string | null;
  link_expires_at: string | null;
}

/** How many more client demos may start now. 0 when the switch is off. */
export async function clientDemosLeft(): Promise<number> {
  if (!platformBuildOn()) return 0;
  return Math.max(0, env.platformBuildDailyMax - (await runsInLastDay()));
}

/** One start per understanding at a time, so a doubled final turn cannot pay twice. */
const starting = new Map<string, Promise<ClientDemoStart>>();

export function startClientDemo(input: { understandingId: string }): Promise<ClientDemoStart> {
  const running = starting.get(input.understandingId);
  if (running) return running;
  const p = start(input).finally(() => starting.delete(input.understandingId));
  starting.set(input.understandingId, p);
  return p;
}

async function start(input: { understandingId: string }): Promise<ClientDemoStart> {
  if (!platformBuildOn()) return { ok: false, reason: 'off', error: 'SBP_PLATFORM_BUILD is not on' };
  if (!env.platformBuildClientEnrollment) {
    return { ok: false, reason: 'not_configured', error: 'PLATFORM_BUILD_CLIENT_ENROLLMENT is not set' };
  }
  // An already-started demo is answered, not refused: the cap is about new spend.
  const existing = await projectOf(input.understandingId);
  if (existing) return { ok: true, projectId: existing, reused: true };
  if ((await clientDemosLeft()) <= 0) {
    return { ok: false, reason: 'daily_cap', error: `the limit of ${env.platformBuildDailyMax} platform builds a day is reached` };
  }
  const { startBuildFromUnderstanding } = await import('../delivery/buildFromUnderstanding');
  const r = await startBuildFromUnderstanding({
    recordId: input.understandingId,
    enrollmentId: env.platformBuildClientEnrollment,
    setupMode: 'platform',
  });
  return r.ok ? { ok: true, projectId: r.projectId, reused: r.reused } : r;
}

/** For the client's page, the admin client view and the meeting brief. */
export async function clientDemoStatus(understandingId: string): Promise<ClientDemoStatus> {
  const none: ClientDemoStatus = { state: 'none', project_id: null, command_center_url: null, demo_url: null, link_expires_at: null };
  const projectId = await projectOf(understandingId);
  if (!projectId) return none;
  const view = await platformBuildForPortal(projectId);
  if (view) {
    return {
      state: view.state, project_id: projectId, command_center_url: view.command_center_url,
      demo_url: view.demo_url, link_expires_at: view.link_expires_at,
    };
  }
  // No run yet: the plan is still being written, or it stopped before a run could be queued.
  const { getIntake } = await import('./planStore');
  const status = (await getIntake(projectId))?.status;
  // Published with no run means the run was refused (cap, attempts): it is not still planning.
  const stopped = ['failed', 'gate_failed', 'awaiting_repo', 'published'].includes(String(status));
  const state = stopped ? 'failed' : 'planning';
  return { ...none, state, project_id: projectId };
}

async function projectOf(understandingId: string): Promise<string | null> {
  const { default: ProjectUnderstandingRecord } = await import('../../models/ProjectUnderstandingRecord');
  const record = await ProjectUnderstandingRecord.findByPk(understandingId);
  const handoff = (record as { build_handoff?: { project_id?: string } | null } | null)?.build_handoff;
  return handoff?.project_id ?? null;
}
