import { resolveGhlAccountForSource } from './ghlAccountRouting';

/**
 * A deep link to a person's contact record in the right GoHighLevel sub-account.
 *
 * WHY THIS IS NOT A TEMPLATE STRING IN THE UI. A GHL contact URL needs the LOCATION as well as
 * the contact id, and which location a person lives in depends on their lead source: Colaberry
 * Training routes to the school sub-account, every other brand to Agent Cory. A hardcoded
 * location would send an operator to the wrong account's URL, where the contact does not exist
 * and GHL answers with an empty record rather than an error - a dead end that looks like missing
 * data rather than a wrong link.
 *
 * WHERE THE LOCATION COMES FROM. The v1 API key for each account is a JWT whose payload names the
 * location it is scoped to, so the location is read from the key that routing selects. That keeps
 * one source of truth: swap an account's key and the links follow it, with nothing else to update.
 * It also means a brand with no key on file produces NO link rather than a guessed one, which is
 * the same withhold-rather-than-misdirect rule the routing layer itself follows.
 *
 * The key is never logged and never returned - only the location id it declares.
 */

const GHL_APP_BASE = 'https://app.gohighlevel.com/v2/location';

/** A GHL location id as it appears in a URL: the ids in use are 20 to 22 URL-safe characters. */
const LOCATION_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The location a v1 API key is scoped to, from its own JWT payload.
 *
 * Returns null for anything that is not a readable JWT carrying a `location_id`, because a
 * malformed key must produce no link rather than a link to nowhere.
 */
export function locationIdFromApiKey(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  const parts = String(apiKey).split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as Record<string, unknown>;
    const loc = payload.location_id;
    if (typeof loc !== 'string' || !LOCATION_ID.test(loc)) return null;
    return loc;
  } catch {
    return null;
  }
}

/** A GHL contact id, as stored on `leads.ghl_contact_id`. */
const CONTACT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The URL for this person's contact, or null when we cannot say.
 *
 * Null for: no contact id (never synced), a source whose account has no key on file, or a key we
 * cannot read a location out of. Every one of those is "we do not know where this person is in
 * the CRM", and the UI is expected to say nothing rather than offer a link that goes nowhere.
 */
export async function ghlContactUrl(
  source: string | null | undefined,
  contactId: string | null | undefined,
): Promise<string | null> {
  if (!contactId || !CONTACT_ID.test(contactId)) return null;

  const route = await resolveGhlAccountForSource(source);
  if (route.status !== 'ready') return null;

  const location = locationIdFromApiKey(route.account.apiKey);
  if (!location) return null;

  return `${GHL_APP_BASE}/${location}/contacts/detail/${contactId}`;
}
