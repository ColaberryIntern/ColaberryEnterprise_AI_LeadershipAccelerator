import { groupForSource } from './leadSourceGroups';

/**
 * The tags that tell somebody in GoHighLevel where a contact came from.
 *
 * WHY. Measured 2026-10-23: of 121 leads from the first paid campaign we hold `utm_source` and
 * `utm_campaign` for 117, and push NONE of it. The sync sends name, email, company and phone, so
 * in GHL an ad lead is indistinguishable from a referral, a cold import or somebody who walked in
 * from the newsletter. Kes asked "we do not know which ad produced them"; we do know, we were
 * just keeping it to ourselves.
 *
 * WHY TAGS AND NOT CUSTOM FIELDS. A GHL custom field has to be created in that sub-account before
 * anything can be written to it, and the school sub-account is new. Writing to a field that does
 * not exist fails quietly, which is the failure mode this whole thread has been about. Tags need
 * no setup, show on the contact, and can be turned into a smart list, so they work the day the
 * account is connected.
 *
 * WHY PREFIXES AND NOT COLONS. `src-`, `brand-`, `utm-` and `camp-` sort together in GHL's tag
 * list, so a reader sees provenance as one block. Colons read better but are not something I can
 * prove GHL accepts in a tag, and a rejected tag would fail silently - the exact class of bug
 * being fixed. Hyphens are known-safe.
 *
 * NOTHING HERE IS INVENTED. Every tag is a value already on the lead row, or the source group the
 * routing layer itself computes. A lead with no campaign gets no campaign tag rather than a tag
 * saying "unknown", because a reader filtering on `camp-unknown` would be filtering on our
 * ignorance rather than on anything the person did.
 */

export interface TaggableLead {
  source?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
}

/** GHL tags are matched loosely; lower-casing keeps one spelling per value. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return null;
  // Keep tags to characters that cannot be mistaken for syntax, and short enough to read in the
  // GHL tag list. A value that needs more than this is a data problem, not a tag.
  const safe = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe === '' ? null : safe.slice(0, 48);
}

/**
 * Provenance tags for one lead, in the order a reader wants them: brand, then source, then the
 * paid-media detail. Always returns a deduped list, and an empty list when the lead says nothing.
 */
export function provenanceTagsFor(lead: TaggableLead): string[] {
  const tags: string[] = [];

  const source = clean(lead.source);

  // The brand bucket, which is also which CRM sub-account they are in. From the same function
  // the routing uses, so the tag can never disagree with the destination.
  //
  // ONLY WHEN THE SOURCE IS KNOWN. `groupForSource` answers every input, falling back to a
  // default bucket for null - which is right for routing, because a lead still has to go
  // somewhere, and wrong as a tag, because it would label a contact with a brand nobody
  // established. A tag has to state what the person did, not where we had to put them.
  if (source) {
    const group = clean(groupForSource(lead.source));
    if (group) tags.push(`brand-${group}`);
    tags.push(`src-${source}`);
  }

  const utm = clean(lead.utm_source);
  if (utm) tags.push(`utm-${utm}`);

  const campaign = clean(lead.utm_campaign);
  if (campaign) tags.push(`camp-${campaign}`);

  return Array.from(new Set(tags));
}
