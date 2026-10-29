import {
  captureSignupConsent,
  PHONE_CONSENT_TEXT,
  type ConsentChoice,
} from './captureSignupConsent';
import { normalizePhone } from '../../utils/phone';
import type { ConsentChannel } from '../../models/ConsentRecord';

/**
 * Record permission to call or text a number collected by a public form.
 *
 * ── WHY THIS IS ONE HELPER AND NOT A LOOP AT EVERY CALL SITE ────────────────
 *
 * Before this file, exactly one surface asked for phone permission — the portal
 * free-signup page — and it wrote the pair with a two-iteration loop inlined in
 * `freeSignupService`. Four more surfaces now need the same thing (the strategy
 * call modal that fronts fifteen landing pages, the contact form, the shared lead
 * capture form, the enrol page). Five copies of a loop that decides what somebody
 * is legally taken to have agreed to is five chances to get one of them subtly
 * wrong, and the wrong ones do not fail loudly: they write a row that reads
 * correctly, passes any table-level assertion, and authorises nothing (or worse,
 * authorises more than was asked). So there is one implementation and every caller
 * uses it, including the original.
 *
 * ── WHAT IT WRITES, AND WHY TWO ROWS ────────────────────────────────────────
 *
 * Both `voice` and `sms`, keyed on the PHONE. The wording on screen names calls
 * AND texts, so one grant covering only whichever channel we later find convenient
 * would be a record of an agreement nobody made. `resolveConsentSubject` keys both
 * of those channels on the number, which is what a send looks consent up by — an
 * email-keyed row would exist, read `basis='express_written'`, and be invisible to
 * the gate.
 *
 * ── WHAT IT REFUSES TO WRITE ────────────────────────────────────────────────
 *
 * Nothing at all unless the box was ticked AND the number survives
 * `normalizePhone` (under 7 digits is not a telephone number, and a grant keyed on
 * "555" can never match anybody). An unticked box records NOTHING rather than a
 * revocation — a person who simply did not tick must not be suppressed.
 *
 * ── IDEMPOTENCY, STATED HONESTLY ────────────────────────────────────────────
 *
 * `consent_records` is an append-only ledger and `recordConsent` always INSERTs;
 * `getCurrentConsent` resolves permission by `ORDER BY captured_at DESC LIMIT 1`.
 * So a double submit appends a second identical `granted` row and the effective
 * permission is unchanged — idempotent in the state that matters, not in row count.
 * That is deliberate and matches every other consent writer here: the ledger is the
 * audit trail, and collapsing two genuine affirmative acts into one row would lose
 * history. No side effect fires from a consent row, so duplicate rows are not
 * duplicate side effects.
 *
 * ── FAILURE POSTURE ─────────────────────────────────────────────────────────
 *
 * Never throws. A consent write must never cost somebody their booking, their
 * account or their enquiry. Each channel is guarded separately so a failure on
 * `voice` does not also lose the `sms` grant the person gave in the same tick.
 */

/** The two channels a telephone number can be reached on. */
export const PHONE_CONSENT_CHANNELS: readonly ConsentChannel[] = ['voice', 'sms'];

export interface PhoneConsentInput {
  /** The number as typed. Formatting is irrelevant; `normalizePhone` keys it. */
  phone?: string | null;
  /** Recorded alongside as context. NOT used as the key — see the docblock. */
  email?: string | null;
  /** What the person actually ticked. Absent or false writes nothing. */
  phoneConsent: ConsentChoice;
  /** Which surface captured it — `strategy_call`, `contact_form`, `free_signup`. */
  source: string;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Returns how many channel grants were written: 0 when there was nothing to
 * record, or 2 on success. A partial 1 means one of the two writes failed and is
 * worth noticing, which is why this returns a count rather than a boolean.
 */
export async function capturePhoneConsent(input: PhoneConsentInput): Promise<number> {
  // Guard before the helper rather than only inside it, so a caller logging this
  // count can tell "nobody ticked" from "we tried and the database refused".
  if (!input || !normalizePhone(input.phone)) return 0;

  let written = 0;
  for (const channel of PHONE_CONSENT_CHANNELS) {
    try {
      // eslint-disable-next-line no-await-in-loop -- two writes, order irrelevant
      const ok = await captureSignupConsent({
        email: input.email ?? undefined,
        phone: input.phone,
        channel,
        marketingOptIn: input.phoneConsent,
        source: input.source,
        // The exact wording shown. Pinned to the frontend copy by
        // consentTextParity.test.ts, because a record attesting to words nobody
        // saw is worse than no record: it is wrong in good faith.
        consentText: PHONE_CONSENT_TEXT,
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      if (ok) written += 1;
    } catch {
      // captureSignupConsent is already swallow-safe; this catches the call site
      // itself (an `undefined` input field, a thrown getter) so one bad channel
      // cannot take the other down with it.
    }
  }

  return written;
}

/**
 * Pull `phone_consent` off a request body.
 *
 * Deliberately NOT a Zod coercion. The schemas accept the checkbox as a boolean or
 * the strings "true"/"on" because that is what different forms actually send, and
 * `isAffirmative` inside `captureSignupConsent` is the single narrow gate that
 * decides which of those COUNTS. This just hands the raw value through with a type
 * the helper accepts, so no call site has to cast.
 */
export function readPhoneConsent(body: unknown): ConsentChoice {
  if (!body || typeof body !== 'object') return undefined;
  return (body as Record<string, unknown>).phone_consent as ConsentChoice;
}
