import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { classifyError } from '../../utils/errorClassifier';
import { resolveMayaMode, type MayaModeAnswer } from './mayaPromotion';
import { AI_DISCLOSURE } from './mayaDisclosure';
import { isNonRoutableAddress } from '../email/reservedDomains';

/**
 * M32 - send_in_app_welcome: the first thing Maya would ever send a person unprompted. SHADOW FIRST.
 *
 *   off     kill switch -> nothing at all, not even a ledger row.
 *   shadow  the default -> ONE ledger row holding the exact body she would have sent, delivered_at NULL, and NO send.
 *   live    only after Ali promotes sendInAppWelcome AND the M29 flags are on (GROWTH_JOURNEY_EXECUTION_ENABLED,
 *           EXPLORER_IN_APP_NUDGE_ENABLED: Ali's) -> claim the ledger row, then ONE in-app DM, delivered_at set.
 * In-app only. No email, SMS or voice path exists here, and NOTHING SENDS until Ali says so.
 *
 * WHO: Explorer enrollments created in the last 24 hours. The age guard is the lesson of Reese's 2026-08-18 incident: an
 * empty ledger does not mean everyone is new, and a returning guest whose account is reused at signup must not be greeted.
 *
 * ONCE: `maya_welcome_ledger.enrollment_id` is UNIQUE and the row is INSERTed before any send (ON CONFLICT DO NOTHING), so
 * concurrent signups or a re-run cannot produce a second row or a second message. A shadow row is never upgraded to a send
 * later: once recorded, that person is done, so promotion never greets people retroactively.
 *
 * THE TABLE is additive and created on first use (CREATE TABLE IF NOT EXISTS, memoized per process), so server.ts, a
 * grandfathered 3,000-line file, is not touched. Dropping it is safe: nothing else reads it.
 *
 * FAILURE MODES: every path returns an outcome and nothing throws, because this runs fire-and-forget beside signup. A
 * send that fails after the claim leaves the row with delivered_at NULL and detail 'send_failed' (no retry: a welcome is
 * not worth a second attempt that could double-send).
 */

export type MayaWelcomeOutcome =
  | 'off' | 'not_found' | 'not_explorer' | 'not_routable' | 'not_new' | 'already_recorded' | 'recorded_shadow' | 'sent' | 'send_failed' | 'error';

export interface MayaWelcomeResult { outcome: MayaWelcomeOutcome; mode?: MayaModeAnswer['mode'] }

export const NEW_ENROLLMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Fixed, not generated: identical for everyone, AI disclosed, no price, no date, no banned word. */
export function mayaWelcomeMessage(firstName: string): string {
  const name = firstName ? `, ${firstName}` : '';
  return `Welcome to Colaberry${name}. ${AI_DISCLOSURE} I can answer questions about the program, `
    + 'show you around the campus, or connect you with a person on our admissions team whenever you want one. '
    + 'Just reply here.';
}

export interface EnrollmentFacts {
  id: string;
  enrollment_type: string | null;
  full_name: string | null;
  /** Read only to decide whether this address could reach anybody. Never messaged. */
  email: string | null;
  created_at: Date | string;
}

export interface MayaWelcomeDeps {
  mode: () => Promise<MayaModeAnswer>;
  findEnrollment: (id: string) => Promise<EnrollmentFacts | null>;
  ensureTable: () => Promise<void>;
  /** INSERT ... ON CONFLICT DO NOTHING; true when THIS call created the row. */
  claim: (row: { enrollmentId: string; mode: 'shadow' | 'live'; body: string }) => Promise<boolean>;
  sendDm: (enrollmentId: string, body: string) => Promise<{ roomId: string; messageId: string }>;
  markDelivered: (enrollmentId: string, roomId: string, messageId: string) => Promise<void>;
  markFailed: (enrollmentId: string, detail: string) => Promise<void>;
  now: () => Date;
}

let tableReady: Promise<void> | null = null;

export function ensureMayaWelcomeTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS maya_welcome_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        enrollment_id UUID NOT NULL UNIQUE REFERENCES enrollments(id),
        mode VARCHAR(10) NOT NULL,
        body TEXT NOT NULL,
        room_id UUID,
        message_id UUID,
        detail VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ
      )`);
    })().catch((err) => { tableReady = null; throw err; });
  }
  return tableReady;
}

/** Test-only: forget the memoized table check. */
export function __resetMayaWelcomeTableForTests(): void { tableReady = null; }

/**
 * Test-only: the real dependency set, so the delivery glue can be covered.
 *
 * `maybeSendMayaWelcome` takes its deps as an argument, which makes the service logic easy
 * to test and left the REAL `sendDm` with no coverage at all: every existing test passes a
 * stub. This exposes the genuine wiring (getMayaEnrollmentId -> openDm -> sendDmMessage)
 * without widening the production surface, since nothing else calls it.
 */
export function __mayaWelcomeDepsForTests(): MayaWelcomeDeps { return defaultDeps(); }

function defaultDeps(): MayaWelcomeDeps {
  return {
    mode: () => resolveMayaMode('sendInAppWelcome'),
    findEnrollment: async (id) => {
      const rows = await sequelize.query<EnrollmentFacts>(
        'SELECT id, enrollment_type, full_name, email, created_at FROM enrollments WHERE id = :id LIMIT 1',
        { type: QueryTypes.SELECT, replacements: { id } },
      );
      return rows[0] ?? null;
    },
    ensureTable: ensureMayaWelcomeTable,
    claim: async ({ enrollmentId, mode, body }) => {
      const rows = await sequelize.query<{ id: string }>(
        `INSERT INTO maya_welcome_ledger (enrollment_id, mode, body) VALUES (:enrollmentId, :mode, :body)
         ON CONFLICT (enrollment_id) DO NOTHING RETURNING id`,
        { type: QueryTypes.SELECT, replacements: { enrollmentId, mode, body } },
      );
      return rows.length === 1;
    },
    sendDm: async (enrollmentId, body) => {
      const { getMayaEnrollmentId } = await import('../mayaIdentitySeed');
      const mayaId = await getMayaEnrollmentId();
      if (!mayaId) throw new Error('maya_identity_not_seeded');
      const { openDm, sendDmMessage } = await import('../communityRooms/dmService');
      const { roomId } = await openDm(mayaId, enrollmentId, null);
      const message = await sendDmMessage({ enrollmentId: mayaId, cohortId: null, isAdmin: false }, roomId, body);
      return { roomId, messageId: String((message as { id?: string } | null)?.id ?? '') };
    },
    markDelivered: async (enrollmentId, roomId, messageId) => {
      await sequelize.query(
        `UPDATE maya_welcome_ledger SET delivered_at = NOW(), room_id = :roomId, message_id = NULLIF(:messageId, '')::uuid
         WHERE enrollment_id = :enrollmentId AND delivered_at IS NULL`,
        { replacements: { enrollmentId, roomId, messageId } },
      );
    },
    markFailed: async (enrollmentId, detail) => {
      await sequelize.query('UPDATE maya_welcome_ledger SET detail = :detail WHERE enrollment_id = :enrollmentId',
        { replacements: { enrollmentId, detail: detail.slice(0, 64) } });
    },
    now: () => new Date(),
  };
}

function firstName(full: string | null): string {
  const t = String(full ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[A-Za-z][A-Za-z'-]{0,30}$/.test(t) ? t : '';
}

function log(event: string, enrollmentId: string, outcome: 'success' | 'failure', err?: unknown): void {
  const line = { timestamp: new Date().toISOString(), level: err ? 'warn' : 'info', service: 'maya', event, outcome,
    error_class: err ? classifyError(err) : undefined, context: { enrollment_id: enrollmentId } };
  (err ? console.warn : console.log)(JSON.stringify(line));
}

export async function maybeSendMayaWelcome(enrollmentId: string, deps: MayaWelcomeDeps = defaultDeps()): Promise<MayaWelcomeResult> {
  try {
    const mode = await deps.mode();
    if (mode.mode === 'off') return { outcome: 'off', mode: 'off' };

    const e = await deps.findEnrollment(enrollmentId);
    if (!e) return { outcome: 'not_found', mode: mode.mode };
    if (e.enrollment_type !== 'explorer') return { outcome: 'not_explorer', mode: mode.mode };
    // Synthetic fixtures are not people. Checked BEFORE the ledger claim, so a probe leaves
    // no row at all rather than a row that looks like a suppressed greeting. An end-to-end
    // job creates one of these every day, and three of the first 13 ledger rows were for it.
    if (isNonRoutableAddress(e.email)) return { outcome: 'not_routable', mode: mode.mode };
    if (deps.now().getTime() - new Date(e.created_at).getTime() > NEW_ENROLLMENT_WINDOW_MS) return { outcome: 'not_new', mode: mode.mode };

    await deps.ensureTable();
    const body = mayaWelcomeMessage(firstName(e.full_name));
    const live = mode.mode === 'live';
    if (!(await deps.claim({ enrollmentId, mode: live ? 'live' : 'shadow', body }))) return { outcome: 'already_recorded', mode: mode.mode };
    if (!live) {
      log('maya_welcome_recorded_shadow', enrollmentId, 'success');
      return { outcome: 'recorded_shadow', mode: 'shadow' };
    }

    try {
      const { roomId, messageId } = await deps.sendDm(enrollmentId, body);
      await deps.markDelivered(enrollmentId, roomId, messageId);
      log('maya_welcome_sent', enrollmentId, 'success');
      return { outcome: 'sent', mode: 'live' };
    } catch (err: unknown) {
      log('maya_welcome_send_failed', enrollmentId, 'failure', err);
      await deps.markFailed(enrollmentId, 'send_failed').catch((e: unknown) => log('maya_welcome_mark_failed_failed', enrollmentId, 'failure', e));
      return { outcome: 'send_failed', mode: 'live' };
    }
  } catch (err: unknown) {
    log('maya_welcome_failed', enrollmentId, 'failure', err);
    return { outcome: 'error' };
  }
}
