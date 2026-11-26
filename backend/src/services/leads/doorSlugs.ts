/**
 * The `lead_sources.slug` each public DOOR claims for itself.
 *
 * A door is a place a stranger can hand us their email. Which brand's lead that
 * becomes is a property of the door, not of the hostname it is served from, and
 * not of the utm parameters the click carried. See
 * `leads/explorerSourceAttribution.ts` for the production measurement behind
 * that distinction.
 *
 * Deliberately a module of nothing but constants. The four Explorer / Open House
 * doors previously each had to repeat a bare string literal, which is how four
 * call sites drift apart; naming them here means a door cannot be added with a
 * silently different answer. It holds no logic so that nothing ever has cause to
 * mock it - a mocked module returns `undefined` for exports it does not list, and
 * a slug that arrives as `undefined` resolves to no brand without failing.
 */

/**
 * The free AI class funnel: the Open House registration endpoint
 * (training.colaberry.com), the public Open House landing-page signup
 * (refactored.ai/open-house, enterprise.colaberry.ai/open-house), the `/enroll`
 * free-signup page, and Eventbrite attendee onboarding.
 *
 * All four are the same Colaberry Training class, which is why they share one
 * slug, and it is the same slug `participantController` already sends for the
 * portal free-signup door - the funnel's other entrance. Verified against
 * production: all 146 attributed leads from that door resolve to `training` and
 * brand `colaberry-training`, which is also the brand the landing-page snack bar
 * reads.
 */
export const OPEN_HOUSE_DOOR_SOURCE_SLUG = 'training';
