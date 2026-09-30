// ============================================================================
// Portal "Open on your phone" handoff — a QR/short-link bridge that lets a
// student already signed in on a desktop open the Today screen on their phone
// WITHOUT re-typing a password. The desktop mints a single-use, short-lived
// token; the phone exchanges it for a normal 7-day participant session JWT
// (the exact same session magic-link login and free-signup issue).
//
// Security posture (see CLAUDE.md — idempotency + failure-first + auth):
//   - Token is one-time: the exchange is a single atomic UPDATE ... RETURNING
//     that only succeeds while used_at IS NULL AND expires_at > NOW(), so a
//     replay (or a race) can never mint two sessions from one code.
//   - Token is short-lived: ~90s TTL, so a shoulder-surfed screen is useless a
//     minute later. The desktop panel auto-refreshes the code.
//   - Bearer only, never logged: the token travels in the QR URL / query, is
//     exchanged over HTTPS for a JWT, then is burned. No password is involved.
//
// The data-access layer is injectable (HandoffStore) so the token state machine
// is unit-tested deterministically without a live database. The default store
// is Postgres via the shared sequelize instance.
// ============================================================================
import crypto from 'crypto';
import QRCode from 'qrcode';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import { Enrollment } from '../models';
import { signParticipantJwt } from './participantService';

/** How long a freshly minted handoff code stays valid. */
export const HANDOFF_TTL_MS = 90 * 1000;

export interface HandoffEnrollment {
  id: string;
  email: string;
  cohort_id: string | null;
}

/** Data-access contract for the handoff token lifecycle. Injectable for tests. */
export interface HandoffStore {
  insert(row: { token: string; enrollment_id: string; expires_at: Date }): Promise<void>;
  /**
   * Atomically claim a token: mark it used and return its row IFF it exists,
   * is unused, and is unexpired. Returns null otherwise (unknown / expired /
   * already used). Single call = single-use guarantee.
   */
  claim(token: string): Promise<{ enrollment_id: string } | null>;
  loadEnrollment(id: string): Promise<HandoffEnrollment | null>;
}

/** Default Postgres-backed store (via raw SQL — no model needed for this table). */
export const sqlHandoffStore: HandoffStore = {
  async insert(row) {
    await sequelize.query(
      `INSERT INTO portal_handoff_tokens (token, enrollment_id, expires_at)
       VALUES (:token, :eid, :exp)`,
      { replacements: { token: row.token, eid: row.enrollment_id, exp: row.expires_at } },
    );
  },
  async claim(token) {
    const [rows] = await sequelize.query(
      `UPDATE portal_handoff_tokens
          SET used_at = NOW()
        WHERE token = :token AND used_at IS NULL AND expires_at > NOW()
      RETURNING enrollment_id`,
      { replacements: { token } },
    );
    const row = (rows as Array<{ enrollment_id: string }>)[0];
    return row ? { enrollment_id: row.enrollment_id } : null;
  },
  async loadEnrollment(id) {
    const e = await Enrollment.findByPk(id);
    if (!e) return null;
    return { id: e.id, email: e.email, cohort_id: e.cohort_id ?? null };
  },
};

/** Idempotent schema bootstrap (boot runs no global sequelize.sync). */
export async function ensureHandoffSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS portal_handoff_tokens (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       token VARCHAR(64) NOT NULL UNIQUE,
       enrollment_id UUID NOT NULL,
       expires_at TIMESTAMPTZ NOT NULL,
       used_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_portal_handoff_token ON portal_handoff_tokens (token)`,
    `CREATE INDEX IF NOT EXISTS idx_portal_handoff_expires ON portal_handoff_tokens (expires_at)`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] Portal handoff schema statement failed:', err.message?.split('\n')[0]);
    }
  }
  console.log('[DB] Portal handoff schema ensured');
}

function portalBaseUrl(): string {
  return env.frontendUrl || 'https://enterprise.colaberry.ai';
}

export interface HandoffCreateResult {
  url: string;
  qrSvg: string;
  expiresAt: string;
  ttlMs: number;
}

/**
 * Mint a one-time handoff code for an already-authenticated enrollment and
 * render it as an inline SVG QR that points at the phone-exchange URL.
 */
export async function createHandoff(
  enrollmentId: string,
  store: HandoffStore = sqlHandoffStore,
): Promise<HandoffCreateResult> {
  const token = crypto.randomBytes(24).toString('base64url'); // 32 url-safe chars
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
  await store.insert({ token, enrollment_id: enrollmentId, expires_at: expiresAt });

  const url = `${portalBaseUrl()}/portal/handoff?t=${token}`;
  const qrSvg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#141110', light: '#ffffff' },
  });

  return { url, qrSvg, expiresAt: expiresAt.toISOString(), ttlMs: HANDOFF_TTL_MS };
}

export type HandoffExchangeResult =
  | { ok: true; jwt: string }
  | { ok: false; reason: 'missing' | 'invalid_or_expired' | 'enrollment_missing' };

/**
 * Exchange a handoff code for a participant session JWT. Single-use + expiry are
 * enforced inside store.claim(); a failed claim yields a safe, non-leaky error.
 */
export async function exchangeHandoff(
  token: string,
  store: HandoffStore = sqlHandoffStore,
): Promise<HandoffExchangeResult> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };

  const claimed = await store.claim(token);
  if (!claimed) return { ok: false, reason: 'invalid_or_expired' };

  const enrollment = await store.loadEnrollment(claimed.enrollment_id);
  if (!enrollment) return { ok: false, reason: 'enrollment_missing' };

  return { ok: true, jwt: signParticipantJwt(enrollment) };
}
