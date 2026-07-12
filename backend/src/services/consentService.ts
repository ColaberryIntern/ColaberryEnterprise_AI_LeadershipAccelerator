/**
 * consentService — affirmative-consent capture + pre-send gate for AI-driven outbound
 * (TBI audit P0-3; design: docs/ai-governance/consent-capture-design.md, Ali-approved §7).
 *
 * SHADOW-FIRST BY DESIGN. The gate computes a consent verdict for every outbound send and records
 * it (ai_events `consent.check`), but it only *blocks* a send when `consent_enforcement === 'enforce'`.
 * The default is `shadow`: the dashboard sees exactly what WOULD be blocked (the TCPA/GDPR exposure)
 * without touching a single live customer send. Ali flips the setting to `enforce` when capture
 * (Phase 2) has populated enough `granted` records that enforcement won't pause the pipeline.
 *
 * Failure posture: the gate is SWALLOW-SAFE and FAILS OPEN. A bug or DB hiccup in the consent
 * system must never block live outbound — a consent-system error degrades to "allow + logged".
 * (The policy *verdict* for voice/SMS without a record is still `block`; enforcement is opt-in.)
 */
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import ConsentRecord from '../models/ConsentRecord';
import type {
  ConsentChannel,
  ConsentSubjectType,
  ConsentBasis,
  ConsentJurisdiction,
  ConsentStatus,
} from '../models/ConsentRecord';
import { getSetting } from './settingsService';
import { emitAiEvent } from './aiEventService';
import { getTraceId } from '../utils/requestContext';

export type ConsentMode = 'off' | 'shadow' | 'enforce';
export type ConsentVerdict = 'allow' | 'block';

const EXPRESS_BASES: ConsentBasis[] = ['express_written', 'double_opt_in'];

// ---------------------------------------------------------------------------
// Schema (explicit — prod does not run sequelize.sync; mirrors ConsentRecord model)
// ---------------------------------------------------------------------------

export async function ensureConsentSchema(): Promise<void> {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS consent_records (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_type  VARCHAR(16)  NOT NULL,
        subject_id    VARCHAR(255) NOT NULL,
        channel       VARCHAR(8)   NOT NULL,
        status        VARCHAR(10)  NOT NULL,
        basis         VARCHAR(32),
        jurisdiction  VARCHAR(10),
        source        VARCHAR(120),
        evidence      JSONB,
        captured_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        revoked_at    TIMESTAMPTZ,
        expires_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )`);
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS consent_records_subject ON consent_records(subject_type, subject_id, channel)`
    );
    await sequelize.query(`CREATE INDEX IF NOT EXISTS consent_records_channel ON consent_records(channel)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS consent_records_status ON consent_records(status)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS consent_records_captured ON consent_records(captured_at)`);
    console.log('[DB] consent_records schema ensured');
  } catch (err: any) {
    console.warn('[DB] consent_records schema ensure failed:', err?.message);
  }
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

/** Current enforcement mode. Defaults to 'shadow' (evaluate + log, never block). */
export async function getConsentMode(): Promise<ConsentMode> {
  try {
    const raw = String((await getSetting('consent_enforcement')) ?? 'shadow').toLowerCase();
    if (raw === 'off' || raw === 'enforce') return raw;
    return 'shadow';
  } catch {
    // Setting unreadable → safest non-disruptive default is shadow (never blocks a live send).
    return 'shadow';
  }
}

// ---------------------------------------------------------------------------
// Identity normalization
// ---------------------------------------------------------------------------

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e.includes('@') ? e : null;
}

/** Loose E.164-ish: keep digits, prefix '+'. Good enough to key consent rows. */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  return digits.length >= 7 ? `+${digits}` : null;
}

interface SubjectKey {
  subject_type: ConsentSubjectType;
  subject_id: string;
}

/** The candidate (subject_type, subject_id) keys a send could match consent on, per channel. */
export function subjectCandidates(params: {
  channel: ConsentChannel;
  leadId?: number | null;
  email?: string | null;
  phone?: string | null;
}): SubjectKey[] {
  const keys: SubjectKey[] = [];
  if (params.channel === 'email') {
    const e = normalizeEmail(params.email);
    if (e) keys.push({ subject_type: 'email', subject_id: e });
  } else {
    const p = normalizePhone(params.phone);
    if (p) keys.push({ subject_type: 'phone', subject_id: p });
  }
  if (params.leadId != null) keys.push({ subject_type: 'lead', subject_id: String(params.leadId) });
  return keys;
}

// ---------------------------------------------------------------------------
// Current-state lookup (latest non-expired grant/revoke for a subject+channel)
// ---------------------------------------------------------------------------

export async function getCurrentConsent(
  channel: ConsentChannel,
  candidates: SubjectKey[]
): Promise<ConsentRecord | null> {
  if (candidates.length === 0) return null;
  const now = new Date();
  const row = await ConsentRecord.findOne({
    where: {
      channel,
      status: { [Op.in]: ['granted', 'revoked'] },
      expires_at: { [Op.or]: [{ [Op.is]: null }, { [Op.gt]: now }] },
      // (cand1 OR cand2 OR …) AND'd with the column filters above
      [Op.or]: candidates.map((c) => ({ subject_type: c.subject_type, subject_id: c.subject_id })),
    },
    order: [['captured_at', 'DESC']],
  });
  return row;
}

// ---------------------------------------------------------------------------
// Policy evaluation (§4 of the design) — pure verdict, no side effects
// ---------------------------------------------------------------------------

export interface ConsentDecisionInput {
  channel: ConsentChannel;
  leadId?: number | null;
  email?: string | null;
  phone?: string | null;
  jurisdiction?: ConsentJurisdiction | null;
}

export interface ConsentDecision {
  verdict: ConsentVerdict;
  basis: ConsentBasis | 'none';
  reason: string;
  jurisdiction: ConsentJurisdiction;
  hasRecord: boolean;
}

/**
 * The §4 allow-logic:
 *  - voice/sms: allow only with a `granted` express-written / double-opt-in record (else BLOCK — TCPA).
 *  - email:     allow if `granted`; else US/CA/unknown B2B → allow on CAN-SPAM opt-out; EU/UK → BLOCK.
 *  - any `revoked` current record → BLOCK (belt-and-suspenders with suppression).
 */
export async function evaluateConsent(input: ConsentDecisionInput): Promise<ConsentDecision> {
  const jurisdiction: ConsentJurisdiction = input.jurisdiction ?? 'unknown';
  const candidates = subjectCandidates(input);
  const current = await getCurrentConsent(input.channel, candidates);
  const hasRecord = !!current;

  if (current?.status === 'revoked') {
    return { verdict: 'block', basis: 'none', reason: 'revoked', jurisdiction, hasRecord };
  }

  const granted = current?.status === 'granted';

  if (input.channel === 'voice' || input.channel === 'sms') {
    if (granted && current?.basis && EXPRESS_BASES.includes(current.basis)) {
      return { verdict: 'allow', basis: current.basis, reason: 'express_consent', jurisdiction, hasRecord };
    }
    return { verdict: 'block', basis: 'none', reason: 'no_express_consent', jurisdiction, hasRecord };
  }

  // email
  if (granted) {
    return { verdict: 'allow', basis: current?.basis ?? 'opt_in_form', reason: 'granted', jurisdiction, hasRecord };
  }
  if (jurisdiction === 'EU' || jurisdiction === 'UK') {
    return { verdict: 'block', basis: 'none', reason: 'eu_no_consent', jurisdiction, hasRecord };
  }
  // US / CA / unknown B2B cold email — CAN-SPAM opt-out is sufficient (matches current behavior).
  return { verdict: 'allow', basis: 'cold_b2b_opt_out', reason: 'can_spam_opt_out', jurisdiction, hasRecord };
}

// ---------------------------------------------------------------------------
// The send-gate (mode-aware + emits ai_events) — used by communicationSafetyService
// ---------------------------------------------------------------------------

export interface ConsentGateResult {
  mode: ConsentMode;
  enforced: boolean; // true only when mode === 'enforce'
  verdict: ConsentVerdict;
  reason: string;
  basis: ConsentBasis | 'none';
}

/**
 * Evaluate + record consent for an outbound send. SWALLOW-SAFE + FAILS OPEN: any error
 * degrades to allow (enforced:false) so the consent system can never break a live send.
 * Only blocks when mode === 'enforce' AND the verdict is block — the caller enforces that.
 */
export async function assertConsentForSend(input: ConsentDecisionInput): Promise<ConsentGateResult> {
  let mode: ConsentMode = 'shadow';
  try {
    mode = await getConsentMode();
    if (mode === 'off') {
      return { mode, enforced: false, verdict: 'allow', reason: 'gate_off', basis: 'none' };
    }

    const decision = await evaluateConsent(input);
    const enforced = mode === 'enforce';
    const blockedNow = enforced && decision.verdict === 'block';

    // Record the verdict for the Trust dashboard. outcome reflects what happens to the SEND:
    // 'blocked' only when we actually stop it; in shadow the send proceeds → 'success'.
    await emitAiEvent({
      event_type: 'consent.check',
      outcome: blockedNow ? 'blocked' : 'success',
      trace_id: getTraceId() ?? null,
      external_system: 'internal',
      metadata: {
        channel: input.channel,
        verdict: decision.verdict,
        basis: decision.basis,
        reason: decision.reason,
        jurisdiction: decision.jurisdiction,
        has_record: decision.hasRecord,
        mode,
        enforced,
        // would_block = the policy says block but we let it through because we're not enforcing yet.
        would_block: !enforced && decision.verdict === 'block',
      },
    });

    return { mode, enforced, verdict: decision.verdict, reason: decision.reason, basis: decision.basis };
  } catch (err: any) {
    console.error('[consentService] gate error — failing OPEN:', err?.message);
    return { mode, enforced: false, verdict: 'allow', reason: 'consent_check_error', basis: 'none' };
  }
}

// ---------------------------------------------------------------------------
// Capture API (Phase 2 capture points + suppression sync call these)
// ---------------------------------------------------------------------------

export interface RecordConsentInput {
  subjectType: ConsentSubjectType;
  subjectId: string;
  channel: ConsentChannel;
  status?: ConsentStatus; // default 'granted'
  basis?: ConsentBasis;
  jurisdiction?: ConsentJurisdiction;
  source: string;
  evidence?: Record<string, any>;
  expiresAt?: Date | null;
}

/** Append a consent event (grant/pending). Normalizes email/phone subject ids. Swallow-safe. */
export async function recordConsent(input: RecordConsentInput): Promise<ConsentRecord | null> {
  try {
    const subjectId =
      input.subjectType === 'email'
        ? normalizeEmail(input.subjectId) ?? input.subjectId
        : input.subjectType === 'phone'
          ? normalizePhone(input.subjectId) ?? input.subjectId
          : input.subjectId;

    return await ConsentRecord.create({
      subject_type: input.subjectType,
      subject_id: subjectId,
      channel: input.channel,
      status: input.status ?? 'granted',
      basis: input.basis ?? null,
      jurisdiction: input.jurisdiction ?? null,
      source: input.source,
      evidence: input.evidence ?? null,
      captured_at: new Date(),
      expires_at: input.expiresAt ?? null,
    });
  } catch (err: any) {
    console.error('[consentService] recordConsent failed:', err?.message);
    return null;
  }
}

/**
 * Append a `revoked` event (called when suppression / unsubscribe fires). If channel is omitted,
 * revokes across all three channels. Swallow-safe — never breaks the unsubscribe path.
 */
export async function revokeConsent(input: {
  subjectType: ConsentSubjectType;
  subjectId: string;
  channel?: ConsentChannel;
  source: string;
  evidence?: Record<string, any>;
}): Promise<void> {
  const channels: ConsentChannel[] = input.channel ? [input.channel] : ['voice', 'sms', 'email'];
  for (const channel of channels) {
    await recordConsent({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      channel,
      status: 'revoked',
      source: input.source,
      evidence: input.evidence,
    });
  }
}

/** Count consent.check events in the last N days (for the Trust rubric). */
export async function countConsentChecks(days = 7): Promise<number> {
  try {
    const rows = (await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM ai_events
       WHERE event_type = 'consent.check' AND created_at >= NOW() - (:days || ' days')::interval`,
      { type: QueryTypes.SELECT, replacements: { days } }
    )) as Array<{ n: number }>;
    return Number(rows[0]?.n) || 0;
  } catch {
    return 0;
  }
}
