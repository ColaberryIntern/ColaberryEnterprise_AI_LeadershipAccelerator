import { bookCallSchema } from '../calendarSchema';
import { createFreeAccountSchema } from '../enrollmentSchema';
import { leadSchema } from '../../services/leadService';

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
};

const FREE_ACCOUNT = { full_name: 'Dana Reyes', email: 'dana@example.com' };
const LEAD = { name: 'Dana Reyes', email: 'dana@example.com' };

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
