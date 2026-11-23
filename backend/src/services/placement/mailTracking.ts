/**
 * Mandrill link tracking for placement mail that carries one of OUR secret links (booking link, consent-room link,
 * employer sign-in link).
 *
 * Mandrill's account default rewrites every link, plain-text mail included, to http://track.colaberry.com/... (checked
 * live 2026-11-23). That first hop is plain http, so the secret link inside the tracking URL would cross the network
 * unencrypted. A per-message X-MC-Track header overrides the account default; asking for open tracking only leaves
 * every link untouched (verified live the same day: the link arrived as https://hire.refactored.ai/...). Plain-text
 * mail cannot report opens, so in practice this mail is untracked, which is the point.
 *
 * Employer follow-ups do NOT use this: they carry only the employer's own booking link, and their click tracking is a
 * feature (followUpTracking.ts).
 */
export const NO_CLICK_TRACKING: Readonly<Record<'X-MC-Track', string>> = Object.freeze({ 'X-MC-Track': 'opens' });
