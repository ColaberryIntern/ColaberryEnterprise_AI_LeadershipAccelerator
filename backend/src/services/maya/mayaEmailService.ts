import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { classifyError } from '../../utils/errorClassifier';
import { resolveMayaMode, type MayaModeAnswer } from './mayaPromotion';
import { AI_DISCLOSURE } from './mayaDisclosure';
import { isNonRoutableAddress } from '../email/reservedDomains';
import { computeIdempotencyKey } from '../email/idempotencyKey';

/**
 * MR2 - `sendEmail`: the first Maya capability whose action leaves the platform. SHADOW FIRST.
 *
 *   off     kill switch, or an unreadable one -> nothing at all, not even a ledger row.
 *   shadow  the default -> ONE ledger row holding the exact subject and body she would have
 *           sent, `delivered_at` NULL, and NO send. This is the reviewable artifact.
 *   live    only after Ali promotes `sendEmail` AND `GROWTH_JOURNEY_EXECUTION_ENABLED` is on
 *           -> claim the ledger row, then ONE send through `sendOnce`, `delivered_at` set.
 *
 * ── WHY THIS FILE EXISTS WHEN `agentEmailTool` ALREADY DOES SOMETHING SIMILAR ──
 *
 * `agents/tools/agentEmailTool.ts` is the shared outbound tool: it reads an agent's grant and
 * autonomy, asks `evaluateSend`, and drafts whenever anything is uncertain. It is the right
 * thing and it is not a capability - it has no promotion gate, no shadow mode and no per-person
 * ledger, which are exactly the three things MR2 asks for and exactly what `sendInAppWelcome`
 * has. This file is the capability layer; the two are complementary, not duplicates.
 *
 * ── SIX THINGS MUST BE TRUE BEFORE ANYTHING REACHES AN INBOX ─────────────────
 *
 * Measured in production 2026-11-12, every one of them is off or absent:
 *   1. the promotion record (`system_settings` -> `maya_capability_promotions`): no Maya records
 *      exist at all, so `resolveMayaMode` answers `shadow/'not_promoted'`;
 *   2. `GROWTH_JOURNEY_EXECUTION_ENABLED`: unset, so the M29 gate answers `shadow` even after a
 *      promotion;
 *   3. Maya's `ai_agents` row: `enabled=false`;
 *   4. her `send_email` grant: deliberately absent (`agentRegistrySeed.ts:3326`);
 *   5. a brand scope: her only caller passes no campaign;
 *   6. `evaluateSend`: the consent chokepoint, below.
 *
 * This service owns 1, 2 and 6. It does not grant itself 3, 4 or 5, and it must not: those are
 * rungs on the release ladder with a human owner.
 *
 * ── ONCE, AND THE INDEX DECIDES IT ──────────────────────────────────────────
 *
 * `maya_email_ledger.idempotency_key` is UNIQUE and the row is INSERTed with
 * `ON CONFLICT DO NOTHING` BEFORE any send, so two concurrent calls cannot both proceed. The
 * claim is arbitrated by the index rather than by a read-then-write, because a read-then-write
 * is a race and this is the kind of race that mails somebody twice. A shadow row is never
 * upgraded to a send later: once recorded, that person is done for that purpose, so promotion
 * never mails people retroactively.
 *
 * ── WHAT IS IN THE TABLE, AND WHY THAT MATTERS ──────────────────────────────
 *
 * The row holds a recipient address, a subject and a full composed body. It is the most
 * sensitive thing this capability creates, so three rules hold:
 *   - nothing else in the codebase reads this table;
 *   - NO log line carries the body or the recipient. Logs carry the purpose, the lead id and the
 *     idempotency key, which is a hash. A log line is the easiest place for a contact detail to
 *     escape the trust boundary;
 *   - it is kept deliberately, not indefinitely. `DROP TABLE IF EXISTS maya_email_ledger` is
 *     both the rollback for this change and the retention action once a promotion decision has
 *     been made. The release-gate runbook records it.
 *
 * THE TABLE is additive and created on first use (CREATE TABLE IF NOT EXISTS, memoized per
 * process), the same way `maya_welcome_ledger` is, so `server.ts` is not touched.
 *
 * FAILURE MODES: every path returns an outcome and nothing throws, because a caller must not die
 * because mail could not be decided. A send that fails after the claim leaves the row with
 * `delivered_at` NULL and `detail` set, and there is NO retry - a retry after a claim is how one
 * message becomes two.
 */

export type MayaEmailOutcome =
  | 'off'
  | 'not_routable'
  | 'no_lead'
  | 'blocked'
  | 'already_recorded'
  | 'recorded_shadow'
  | 'sent'
  | 'send_failed'
  | 'error';

export interface MayaEmailResult {
  outcome: MayaEmailOutcome;
  mode?: MayaModeAnswer['mode'];
  /** Set on `blocked` only: the named reason from the consent gate, for the log and the caller. */
  reason?: string;
  /** Set on `recorded_shadow` and `sent`: the key the ledger row carries. Never an address. */
  idempotencyKey?: string;
}

/**
 * What Maya may email about. A closed set of reviewed copy, NOT a free-text body and NOT a model
 * call.
 *
 * `mayaWelcomeService` makes the same choice for the same reason, stated there as "Fixed, not
 * generated: identical for everyone, AI disclosed, no price, no date, no banned word." An email
 * leaves the platform and cannot be withdrawn, so the copy is reviewed once here rather than
 * generated per send and reviewed never.
 *
 * Adding a purpose is a deliberate edit to this object. That is the point.
 */
export type MayaEmailPurpose = 'explorer_welcome';

interface EmailTemplate {
  subject: string;
  body: (firstName: string) => string;
}

const TEMPLATES: Readonly<Record<MayaEmailPurpose, EmailTemplate>> = Object.freeze({
  // The email counterpart of the in-app welcome. Deliberately the same message: it is the one
  // piece of unprompted Maya copy that has already been reviewed and shipped, so it is the
  // honest first template rather than a new one invented to fill this slot.
  //
  // Three things it must not contain, each for a concrete reason:
  //   - a price, a cohort date, a deadline or a seat count: Maya is never authoritative for any
  //     of them (mayaTopicGuard classifies exactly these as non-authoritative topics);
  //   - the word "free": 40 TAC 807.172(d);
  //   - a claim that a person will contact them, which is a promise nobody has made.
  explorer_welcome: {
    subject: 'Welcome to Colaberry',
    body: (firstName) => {
      const name = firstName ? `, ${firstName}` : '';
      return `Welcome to Colaberry${name}. ${AI_DISCLOSURE} `
        + 'You can sign in to the portal any time to see the program, look around the campus, or '
        + 'ask me a question. If you would rather talk to a person on our admissions team, say so '
        + 'and I will put you in touch.';
    },
  },
});

export interface MayaEmailRequest {
  purpose: MayaEmailPurpose;
  /** The intended address. Validated here; never trusted to be routable. */
  recipient: string;
  /** Used only for the greeting, and only if it passes the first-name guard. */
  recipientName?: string | null;
  /**
   * A stable id for the person or record this email is about - an enrollment id or a lead id.
   * It is what makes the idempotency key unique per person per purpose, so two different people
   * cannot collide even when a test-mode redirect sends both to the same address.
   */
  subjectRef: string;
}

/** The transport's answer, narrowed to what this service needs from `sendOnce`. */
export interface MayaEmailSendResult {
  outcome: 'sent' | 'skipped' | 'failed';
  messageId?: string;
  errorClass?: string;
}

export interface MayaEmailDeps {
  mode: () => Promise<MayaModeAnswer>;
  /** Case-insensitive lead lookup. `leads` carries a UNIQUE index on LOWER(email). */
  findLeadId: (email: string) => Promise<number | null>;
  evaluate: (leadId: number, toEmail: string) => Promise<{
    allowed: boolean; blockedReason?: string; redirectEmail?: string;
  }>;
  ensureTable: () => Promise<void>;
  /** INSERT ... ON CONFLICT DO NOTHING; true when THIS call created the row. */
  claim: (row: {
    idempotencyKey: string; purpose: string; mode: 'shadow' | 'live';
    recipient: string; subject: string; body: string; leadId: number;
  }) => Promise<boolean>;
  send: (args: {
    recipient: string; subject: string; body: string; businessEventId: string;
  }) => Promise<MayaEmailSendResult>;
  markDelivered: (idempotencyKey: string, providerMessageId: string) => Promise<void>;
  markFailed: (idempotencyKey: string, detail: string) => Promise<void>;
}

let tableReady: Promise<void> | null = null;

export function ensureMayaEmailTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS maya_email_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key VARCHAR(32) NOT NULL UNIQUE,
        purpose VARCHAR(48) NOT NULL,
        mode VARCHAR(10) NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        lead_id INTEGER,
        provider_message_id TEXT,
        detail VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ
      )`);
    })().catch((err) => { tableReady = null; throw err; });
  }
  return tableReady;
}

/** Test-only: forget the memoized table check. */
export function __resetMayaEmailTableForTests(): void { tableReady = null; }

/**
 * Test-only: the real dependency set.
 *
 * Same reason as `__mayaWelcomeDepsForTests`. The service takes its deps as an argument, which
 * would otherwise leave the REAL consent call, the REAL lead lookup and the REAL transport with
 * no coverage at all, since every service-level test passes stubs. That glue is what runs for the
 * first time on the day the capability is promoted.
 */
export function __mayaEmailDepsForTests(): MayaEmailDeps { return defaultDeps(); }

function defaultDeps(): MayaEmailDeps {
  return {
    mode: () => resolveMayaMode('sendEmail'),

    // Raw SQL rather than the Lead model, matching the sibling service: it keeps the model barrel
    // out of this import graph. `lower(email)` is not a scan - `leads` is uniquely indexed on
    // LOWER(email), which is also why at most one row can come back. Case matters here: 986 of
    // 25,430 lead rows store a mixed-case address and 21 of those leads have an unsubscribe
    // event, so an exact match would have missed people who opted out.
    findLeadId: async (email) => {
      const rows = await sequelize.query<{ id: number }>(
        'SELECT id FROM leads WHERE lower(email) = :email LIMIT 1',
        { type: QueryTypes.SELECT, replacements: { email: email.trim().toLowerCase() } },
      );
      return rows[0]?.id ?? null;
    },

    evaluate: async (leadId, toEmail) => {
      const { evaluateSend } = await import('../communicationSafetyService');
      const decision = await evaluateSend({
        leadId, channel: 'email', toEmail, source: 'agent',
      });
      return {
        allowed: decision.allowed,
        blockedReason: decision.blockedReason,
        redirectEmail: decision.redirect?.email,
      };
    },

    ensureTable: ensureMayaEmailTable,

    claim: async ({ idempotencyKey, purpose, mode, recipient, subject, body, leadId }) => {
      const rows = await sequelize.query<{ id: string }>(
        `INSERT INTO maya_email_ledger
           (idempotency_key, purpose, mode, recipient, subject, body, lead_id)
         VALUES (:idempotencyKey, :purpose, :mode, :recipient, :subject, :body, :leadId)
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        {
          type: QueryTypes.SELECT,
          replacements: { idempotencyKey, purpose, mode, recipient, subject, body, leadId },
        },
      );
      return rows.length === 1;
    },

    send: async ({ recipient, subject, body, businessEventId }) => {
      const { sendOnce } = await import('../email/idempotentSend');
      const { sendMayaEmail } = await import('../email/mayaEmailTransport');
      const result = await sendOnce(
        { recipient, subject, businessEventId },
        () => sendMayaEmail({ to: recipient, subject, body }),
      );
      if (result.outcome === 'sent') {
        return { outcome: 'sent', messageId: result.messageId };
      }
      if (result.outcome === 'skipped') {
        // The send ledger already holds a claim for this exact (recipient, subject, event), so
        // mail either went or is in flight. Reporting it as sent would be a guess; reporting it
        // as failed would invite a retry. 'skipped' is its own answer.
        return { outcome: 'skipped' };
      }
      return { outcome: 'failed', errorClass: result.errorClass };
    },

    markDelivered: async (idempotencyKey, providerMessageId) => {
      await sequelize.query(
        `UPDATE maya_email_ledger
            SET delivered_at = NOW(), provider_message_id = NULLIF(:providerMessageId, '')
          WHERE idempotency_key = :idempotencyKey AND delivered_at IS NULL`,
        { replacements: { idempotencyKey, providerMessageId } },
      );
    },

    markFailed: async (idempotencyKey, detail) => {
      await sequelize.query(
        'UPDATE maya_email_ledger SET detail = :detail WHERE idempotency_key = :idempotencyKey',
        { replacements: { idempotencyKey, detail: detail.slice(0, 64) } },
      );
    },
  };
}

/** The same guard the welcome uses: a name that is not a plain first name becomes no name. */
function firstName(full: string | null | undefined): string {
  const t = String(full ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[A-Za-z][A-Za-z'-]{0,30}$/.test(t) ? t : '';
}

/**
 * One structured line per outcome.
 *
 * `context` deliberately carries the purpose, the lead id and the idempotency key - which is a
 * sha256 prefix, not an address. It never carries the recipient, the subject or the body.
 */
function log(
  event: string,
  outcome: 'success' | 'failure',
  context: Record<string, unknown>,
  err?: unknown,
): void {
  // Routed on the OUTCOME, not on whether an exception happens to be in hand. The sibling
  // welcome service routes on `err`, which means a refusal with no exception - a suppressed
  // recipient, an unverifiable one - lands on `console.log` at `info`. Those are precisely the
  // lines somebody needs to find later, so here a failure is a warning whether or not anything
  // threw.
  const failed = outcome === 'failure';
  const line = {
    timestamp: new Date().toISOString(),
    level: failed ? 'warn' : 'info',
    service: 'maya',
    event,
    outcome,
    error_class: err ? classifyError(err) : undefined,
    context,
  };
  (failed ? console.warn : console.log)(JSON.stringify(line));
}

/** The business event id for a purpose and a subject. Stable, so the key is stable. */
export function mayaEmailBusinessEventId(purpose: MayaEmailPurpose, subjectRef: string): string {
  return `maya-email-${purpose}-${subjectRef}`;
}

export async function sendMayaEmailForPurpose(
  req: MayaEmailRequest,
  deps: MayaEmailDeps = defaultDeps(),
): Promise<MayaEmailResult> {
  const base = { purpose: req.purpose, subject_ref: req.subjectRef };
  try {
    const mode = await deps.mode();
    if (mode.mode === 'off') return { outcome: 'off', mode: 'off' };

    // Checked FIRST, and before the ledger claim, so a fixture leaves no row at all rather than
    // a row that looks like a suppressed email. This is the rule MR4 established after Maya
    // composed a welcome for a smoke-test account every day for 13 days.
    if (isNonRoutableAddress(req.recipient)) {
      return { outcome: 'not_routable', mode: mode.mode };
    }

    // Consent lives on the lead. No lead means consent cannot be verified, and an unverifiable
    // consent is not a licence to send - it is the reason not to. This fails CLOSED on purpose:
    // the alternative is mailing somebody whose unsubscribe we were unable to look up.
    const leadId = await deps.findLeadId(req.recipient);
    if (leadId === null) {
      log('maya_email_no_consent_record', 'failure', base);
      return { outcome: 'no_lead', mode: mode.mode };
    }

    const decision = await deps.evaluate(leadId, req.recipient);
    if (!decision.allowed) {
      // A suppression writes NO ledger row. `agentEmailTool` states the rule this follows: if
      // someone unsubscribed, bounced or complained, there must not be a record of a message to
      // them sitting in a queue for a human to approve later. That is how an unsubscribe gets
      // overridden by a tired reviewer.
      const reason = decision.blockedReason ?? 'send_not_allowed';
      log('maya_email_blocked', 'failure', { ...base, lead_id: leadId, reason });
      return { outcome: 'blocked', mode: mode.mode, reason };
    }

    // A redirect is test mode pointing mail at a safe address. Honoured, not ignored: ignoring it
    // would send real mail while the platform believed it was in test.
    const sendTo = decision.redirectEmail || req.recipient;

    const template = TEMPLATES[req.purpose];
    const subject = template.subject;
    const body = template.body(firstName(req.recipientName));
    const businessEventId = mayaEmailBusinessEventId(req.purpose, req.subjectRef);
    // Keyed on the address mail would actually go to, so this row and the `email_send_ledger`
    // row share one key and can be joined. `subjectRef` is inside the business event id, so two
    // people redirected to the same test address still get distinct keys.
    const idempotencyKey = computeIdempotencyKey(sendTo, subject, businessEventId);

    await deps.ensureTable();

    const live = mode.mode === 'live';
    const claimed = await deps.claim({
      idempotencyKey,
      purpose: req.purpose,
      mode: live ? 'live' : 'shadow',
      recipient: sendTo,
      subject,
      body,
      leadId,
    });
    if (!claimed) {
      return { outcome: 'already_recorded', mode: mode.mode, idempotencyKey };
    }

    if (!live) {
      log('maya_email_recorded_shadow', 'success', {
        ...base, lead_id: leadId, idempotency_key: idempotencyKey,
      });
      return { outcome: 'recorded_shadow', mode: 'shadow', idempotencyKey };
    }

    const sent = await deps.send({ recipient: sendTo, subject, body, businessEventId });
    if (sent.outcome === 'sent') {
      await deps.markDelivered(idempotencyKey, sent.messageId ?? '');
      log('maya_email_sent', 'success', {
        ...base, lead_id: leadId, idempotency_key: idempotencyKey,
      });
      return { outcome: 'sent', mode: 'live', idempotencyKey };
    }

    // Both `skipped` and `failed` leave the row undelivered. There is no retry: a retry after a
    // claim is how one message becomes two.
    const detail = sent.outcome === 'skipped' ? 'send_skipped' : (sent.errorClass ?? 'send_failed');
    log('maya_email_send_failed', 'failure', {
      ...base, lead_id: leadId, idempotency_key: idempotencyKey, detail,
    });
    await deps.markFailed(idempotencyKey, detail).catch((e: unknown) => log(
      'maya_email_mark_failed_failed', 'failure', { ...base, idempotency_key: idempotencyKey }, e,
    ));
    return { outcome: 'send_failed', mode: 'live', idempotencyKey };
  } catch (err: unknown) {
    log('maya_email_failed', 'failure', base, err);
    return { outcome: 'error' };
  }
}

export default sendMayaEmailForPurpose;
