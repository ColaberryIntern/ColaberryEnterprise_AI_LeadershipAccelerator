/**
 * E.164 phone normalization, shared across the platform.
 *
 * Extracted from consentService (its original home) so callers that must not
 * drag in the consent module's database graph — synthflowService, dialing before
 * a voice call — can normalize a number too. It is a pure function with no
 * imports, so it loads anywhere.
 *
 * THE BUG THIS FIXES for consent: the previous version prefixed '+' to the bare
 * digits with no country code, so `214-555-0100` keyed as `+2145550100` while
 * `+1 214-555-0100` keyed as `+12145550100`. The same person, two keys — and a
 * consent lookup finds a row only under the key it was written with.
 *
 * THE BUG THIS FIXES for dialing: Synthflow forwards the number to Twilio as-is,
 * prepending only a bare '+' when there is none. A 10-digit US number typed on a
 * form ('6825975784') therefore reached Twilio as '+6825975784' — country code
 * +682, Cook Islands — and was rejected with 32205 "No International Permission".
 * Normalizing to '+16825975784' first is what lets a US applicant's call connect.
 *
 * The rules, in order:
 *  - the caller wrote '+', so they stated the country code: trust it
 *  - 10 bare digits: assume US/CA (+1). This IS an assumption, and it is the
 *    right one for a Texas business whose forms collect US mobiles — but it
 *    would key a bare 10-digit foreign number wrongly. A caller who knows better
 *    should pass the '+'.
 *  - 11 bare digits starting 1: a US number written without the plus
 *  - anything else: prefix '+' unchanged, rather than guess
 *  - fewer than 7 digits: not a phone number at all — return null
 */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  const statedCountryCode = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 7) return null;
  if (statedCountryCode) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}
