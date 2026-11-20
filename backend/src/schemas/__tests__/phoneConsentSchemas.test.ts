import { bookCallSchema } from '../calendarSchema';
import { createFreeAccountSchema } from '../enrollmentSchema';
import { leadSchema, publicLeadSchema } from '../../services/leadService';

/**
 * `phone_consent` at the three inbound boundaries that accept a phone.
 *
 * ── THE DEPLOY-ORDER FACT THESE TESTS PIN ───────────────────────────────────
 *
 * None of these three is `.strict()`, which is why the ordering matters in the
 * direction people expect least. A `.strict()` route rejects an unknown key with a
 * 400 — loud, obvious, fixed in minutes. A NON-strict route silently DROPS it. So
 * shipping the frontend first here would not break anything: every form would ask
 * for permission, every tick would be sent, and every grant would be discarded
 * with nothing logged and nothing failing. Backend first, always.
 *
 * The assertions below are therefore about the shape of the contract rather than
 * about rejection: that the key is accepted, that absent means absent (never a
 * manufactured `true`), and that it is parsed INDEPENDENTLY of the generic contact
 * consent beside it.
 */

const BOOKING = {
  name: 'Dana Reyes',
  email: 'dana@example.com',
  slot_start: '2026-11-04T15:00:00.000Z',
  timezone: 'America/Chicago',
  // REQUIRED since PH1 (Ali, 2026-11-19): every public signup/lead form requires a phone.
  phone: '(214) 555-0100',
};

const FREE_ACCOUNT = { full_name: 'Dana Reyes', email: 'dana@example.com', phone: '(214) 555-0100' };
const LEAD = { name: 'Dana Reyes', email: 'dana@example.com' };
const PUBLIC_LEAD = { ...LEAD, phone: '(214) 555-0100' };

describe('bookCallSchema', () => {
  it('accepts the tick as a boolean, "true" or "on"', () => {
    for (const v of [true, 'true', 'on'] as const) {
      expect(bookCallSchema.parse({ ...BOOKING, phone_consent: v }).phone_consent).toBe(v);
    }
  });

  it('accepts false, which is a real answer and not an absence', () => {
    expect(bookCallSchema.parse({ ...BOOKING, phone_consent: false }).phone_consent).toBe(false);
  });

  it('leaves it UNDEFINED when the client did not send it', () => {
    // An older cached bundle cannot ask the question. Defaulting to false here
    // would be harmless; defaulting to true would be a disaster, and the honest
    // shape is neither.
    expect(bookCallSchema.parse(BOOKING).phone_consent).toBeUndefined();
  });

  it('does not make a booking fail over the tick', () => {
    // The permission is optional. Somebody who declines still gets their call.
    expect(() => bookCallSchema.parse({ ...BOOKING, phone: '(214) 555-0100' })).not.toThrow();
  });

  it('rejects a value that is neither a boolean nor a checkbox string', () => {
    expect(() => bookCallSchema.parse({ ...BOOKING, phone_consent: 'yes' })).toThrow();
    expect(() => bookCallSchema.parse({ ...BOOKING, phone_consent: 1 })).toThrow();
  });
});

describe('createFreeAccountSchema', () => {
  it('parses the phone grant SEPARATELY from the email opt-in', () => {
    // The email box says "Email me about Colaberry courses". If one field could
    // supply the other's value, that sentence would be authorising a phone call.
    const out = createFreeAccountSchema.parse({
      ...FREE_ACCOUNT, marketing_opt_in: true, phone_consent: false,
    });
    expect(out.marketing_opt_in).toBe(true);
    expect(out.phone_consent).toBe(false);

    const flipped = createFreeAccountSchema.parse({
      ...FREE_ACCOUNT, marketing_opt_in: false, phone_consent: true,
    });
    expect(flipped.marketing_opt_in).toBe(false);
    expect(flipped.phone_consent).toBe(true);
  });

  it('ticking the email box alone grants nothing by phone', () => {
    const out = createFreeAccountSchema.parse({ ...FREE_ACCOUNT, marketing_opt_in: true });
    expect(out.phone_consent).toBeUndefined();
  });
});

describe('leadSchema', () => {
  it('parses the phone grant SEPARATELY from consent_contact', () => {
    const out = leadSchema.parse({ ...LEAD, consent_contact: true, phone_consent: false });
    expect(out.consent_contact).toBe(true);
    expect(out.phone_consent).toBe(false);
  });

  it('defaults to FALSE, never true, when the client is silent', () => {
    // This one defaults rather than staying undefined because every internal
    // caller constructs a `LeadInput` by hand, and the default is what makes those
    // call sites state their answer explicitly instead of inheriting one.
    const out = leadSchema.parse(LEAD);
    expect(out.phone_consent).toBe(false);
    expect(out.consent_contact).toBe(false);
  });

  it('the generic contact tick cannot supply the phone grant', () => {
    expect(leadSchema.parse({ ...LEAD, consent_contact: true }).phone_consent).toBe(false);
  });

  it('is a strict boolean here, because every caller is server-side', () => {
    // Unlike the two form-facing schemas above, nothing posts "on" to this one
    // from a raw HTML form — the React clients send JSON booleans.
    expect(() => leadSchema.parse({ ...LEAD, phone_consent: 'true' })).toThrow();
  });
});

/**
 * PH1 (Ali, 2026-11-19): the NUMBER is required on every public signup/lead form; the PERMISSION
 * to call it is not. These pin both halves at the schema boundary.
 */
describe('PH1: the phone is required, the permission is not', () => {
  const BOOKING_NO_PHONE = { ...BOOKING, phone: undefined };
  const FREE_NO_PHONE = { ...FREE_ACCOUNT, phone: undefined };

  it.each([
    ['bookCallSchema', bookCallSchema, BOOKING_NO_PHONE],
    ['createFreeAccountSchema', createFreeAccountSchema, FREE_NO_PHONE],
    ['publicLeadSchema', publicLeadSchema, LEAD],
  ])('%s rejects a body with no phone', (_name, schema, base) => {
    expect(schema.safeParse(base).success).toBe(false);
  });

  it.each([
    ['bookCallSchema', bookCallSchema, BOOKING_NO_PHONE],
    ['createFreeAccountSchema', createFreeAccountSchema, FREE_NO_PHONE],
    ['publicLeadSchema', publicLeadSchema, LEAD],
  ])('%s rejects a blank, short or over-long phone', (_name, schema, base) => {
    for (const phone of ['', '   ', '555-0100', '1234567890123456', 'x'.repeat(51)]) {
      expect(schema.safeParse({ ...base, phone }).success).toBe(false);
    }
  });

  it.each([
    ['bookCallSchema', bookCallSchema, BOOKING],
    ['createFreeAccountSchema', createFreeAccountSchema, FREE_ACCOUNT],
    ['publicLeadSchema', publicLeadSchema, PUBLIC_LEAD],
  ])('%s accepts a phone with NO consent - consent stays optional', (_name, schema, base) => {
    const out = schema.parse(base) as Record<string, unknown>;
    expect(out.phone).toBe('(214) 555-0100');
    // Never manufactured: absent stays absent (or the leadSchema false default).
    expect(out.phone_consent === undefined || out.phone_consent === false).toBe(true);
  });

  it('the internal leadSchema stays phone-optional, for callers that are not public forms', () => {
    expect(leadSchema.safeParse(LEAD).success).toBe(true);
  });
});

describe('the three schemas are NOT strict, which is why backend deploys first', () => {
  it.each([
    ['bookCallSchema', bookCallSchema, BOOKING],
    ['createFreeAccountSchema', createFreeAccountSchema, FREE_ACCOUNT],
    ['leadSchema', leadSchema, LEAD],
  ])('%s silently drops an unknown key rather than rejecting it', (_name, schema, base) => {
    // Pinned as a FACT, not endorsed as a design. It is the reason a
    // frontend-first deploy of this change would look completely healthy while
    // discarding every grant: no 400, no log line, no failing request.
    const parsed = schema.parse({ ...base, some_key_added_later: true }) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('some_key_added_later');
  });
});
