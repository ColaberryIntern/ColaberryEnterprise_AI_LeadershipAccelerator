/**
 * The one tag that marks a GoHighLevel contact as one of our Explorer sign-ups.
 *
 * ─── WHY THIS EXISTS, AND WHY IT GOES ON THE CREATE CALL ────────────────────
 *
 * GHL's "Contact Created" workflow routes every new contact carrying a phone
 * number into Cora's outbound AI calling. Measured by Kes Delele on 2026-11-21
 * against 100 Explorer sign-ups that had a phone number: Cora had called all of
 * them, and for the 87 with an account date the first call landed within 11
 * hours of the account being created. Three were ever reached.
 *
 * Cora now refuses to call any contact carrying this tag, checked both when a
 * campaign starts and again immediately before each dial. For that to work from
 * the first instant, the tag has to be present the moment the contact exists.
 *
 * ─── THE RACE THIS CLOSES ───────────────────────────────────────────────────
 *
 * `createContact` previously sent a contact with NO `tags` key at all on an
 * Explorer sign-up, because it only sets tags when an interest group is supplied
 * and the Explorer path supplies none. Our provenance tags then arrived as
 * separate follow-up requests, one per tag, because GHL v1 has no bulk tag
 * endpoint. So at the instant "Contact Created" fired, the contact was bare, and
 * any workflow reading tags at trigger time saw nothing.
 *
 * Passing this on the CREATE payload removes the gap entirely for a new contact.
 * There is no later request to lose, retry or reorder.
 *
 * ─── WHY A HYPHEN ───────────────────────────────────────────────────────────
 *
 * `ghlProvenanceTags.clean()` maps every character outside [a-z0-9._-] to a
 * hyphen, so a two-word tag with a space is not constructible by this codebase.
 * Kes chose the hyphenated spelling for exactly that reason. The separate,
 * space-separated tag seen on some older contacts is applied inside GHL by
 * something neither system owns; this one is ours and is written deliberately.
 *
 * ─── WHY IT CARRIES NO PREFIX ───────────────────────────────────────────────
 *
 * The provenance tags are all prefixed (`brand-`, `src-`, `utm-`, `camp-`)
 * because they answer "where did this person come from". This one answers a
 * different question, "is this person one of ours to leave alone", and it is
 * consumed by a system outside this codebase that asked for this exact string.
 * A prefix here would be our taxonomy leaking into their contract.
 */
export const AI_EXPLORER_TAG = 'ai-explorer';

/**
 * The tag list an Explorer sign-up door passes to the GHL sync.
 *
 * A list rather than the bare string so a second classification tag can be added
 * later without touching four call sites and their signatures.
 */
export const EXPLORER_SIGNUP_TAGS: readonly string[] = [AI_EXPLORER_TAG];
