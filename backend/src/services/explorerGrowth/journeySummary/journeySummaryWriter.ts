/**
 * Write one composed journey card onto a GoHighLevel contact (T208).
 *
 * TWO WAYS THIS CAN FAIL SILENTLY, AND WHAT STOPS EACH:
 *
 * 1. WRONG SUB-ACCOUNT. GHL v1 keys are per sub-account. The field
 *    `ent_lead_journey_summary` exists ONLY in School of Data Analytics;
 *    verified 2026-11-27, where the default key saw 25 custom fields and not
 *    that one. Writing with the default key would return HTTP 200 and store
 *    nothing. So the key is always resolved per lead source through
 *    `ghlApiKeyForSource`, and a lead whose route is unresolved is SKIPPED
 *    rather than written with a fallback key.
 *
 * 2. MISSING FIELD. `ghlService.createContact`'s own comment records that
 *    writing to a GHL custom field that does not exist in the destination
 *    sub-account "fails quietly". HTTP 200 is therefore not evidence that a
 *    card was stored. `verifyWriteLanded` reads one contact back, and the
 *    runner uses it as a per-run canary: if the first write of a run did not
 *    persist, the run stops instead of reporting hundreds of silent no-ops.
 *
 * This module does its own single GET rather than adding a getter to
 * `ghlService.ts`, which is 626 lines and over CLAUDE.md's 500-line hard
 * ceiling; that rule says the next change to such a file must split it first,
 * and a read helper for one caller is a bad reason to move code that sends mail.
 */
import { updateContact } from '../../ghlService';
import { resolveGhlAccountForSource } from '../../leads/ghlAccountRouting';
import { getSetting } from '../../settingsService';

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

/** No outbound call without a bound. */
export const WRITE_TIMEOUT_MS = 15000;

/** The field Kes created on 2026-11-25, replacing `ent_call_activity_summary`. */
export const DEFAULT_JOURNEY_FIELD = 'ent_lead_journey_summary';

/** GHL custom field keys are lowercase, digits and underscore. */
const FIELD_KEY = /^[a-z0-9_]{1,64}$/;

export type WriteOutcome =
  | { status: 'written' }
  | { status: 'skipped'; reason: 'no_route' | 'no_field' | 'nothing_to_write' }
  | { status: 'failed'; errorClass: string; detail: string };

/**
 * Which field to write for a sub-account.
 *
 * ABSENT means the field Kes named. PRESENT but not a plain field key means we
 * do not know where to write, so the answer is null and nothing is written —
 * the same fail-closed shape `parseSmsField` uses, and for the same reason:
 * writing to a guessed field stores text where nobody will look.
 */
export function parseJourneyField(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_JOURNEY_FIELD;
  if (typeof raw !== 'string') return null;
  const key = raw.trim().replace(/^contact\./, '');
  return FIELD_KEY.test(key) ? key : null;
}

export function journeyFieldSettingFor(accountKey: string): string {
  return `ghl_journey_field_${accountKey}`;
}

/** Resolve the key and field for a lead source, or say why we cannot. */
export async function resolveWriteTarget(
  leadSource: string | null,
): Promise<{ apiKey: string; field: string } | { skip: 'no_route' | 'no_field' }> {
  // resolveGhlAccountForSource rather than ghlApiKeyForSource: that wrapper
  // discards the account NAME, and the field setting is per sub-account. Taking
  // both from one resolution is what stops the credential and the field drifting
  // to different sub-accounts, which would write a real card into the wrong CRM.
  const route = await resolveGhlAccountForSource(leadSource);
  if (route.status !== 'ready') return { skip: 'no_route' };

  const field = parseJourneyField(
    await getSetting(journeyFieldSettingFor(route.account.accountKey)),
  );
  if (!field) return { skip: 'no_field' };
  return { apiKey: route.account.apiKey, field };
}

/**
 * Read one contact back and report whether the field holds exactly `expected`.
 *
 * Used as a per-run canary, not per write: an exact-match read on every lead
 * would double the API calls for a daily pass over ~950 contacts, and the
 * failure this guards against (a missing field, a wrong sub-account) is a
 * property of the run, not of one lead.
 */
export async function verifyWriteLanded(
  contactId: string,
  field: string,
  expected: string,
  apiKey: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = await res.json() as { contact?: { customField?: Array<{ id?: string; value?: unknown }> } };
    const fields = body.contact?.customField ?? [];
    return fields.some((f) => String(f.value ?? '') === expected);
  } catch {
    // A failed verification is not a failed write, but it is not proof either,
    // so the caller treats false as "do not trust this run".
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Write the card. Returns a typed outcome rather than throwing, so one bad
 * contact cannot end a pass over the whole pool.
 */
export async function writeJourneySummary(
  contactId: string,
  leadSource: string | null,
  text: string | null,
): Promise<WriteOutcome> {
  if (!text) return { status: 'skipped', reason: 'nothing_to_write' };

  const target = await resolveWriteTarget(leadSource);
  if ('skip' in target) return { status: 'skipped', reason: target.skip };

  try {
    const result = await updateContact(
      contactId,
      { customField: { [target.field]: text } },
      target.apiKey,
    );
    if (!result.success) {
      return {
        status: 'failed',
        errorClass: 'UpstreamRejected',
        // The error is the API's text, never the key and never the card body.
        detail: String(result.error ?? 'unknown').slice(0, 200),
      };
    }
    return { status: 'written' };
  } catch (e) {
    const err = e as Error;
    return {
      status: 'failed',
      errorClass: err.name || 'Error',
      detail: (err.message || '').slice(0, 200),
    };
  }
}
