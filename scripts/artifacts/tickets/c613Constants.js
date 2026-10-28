/**
 * C6.13 - the handful of values the company files, the criteria and the renderer all
 * have to agree on.
 *
 * OBSERVED is the one that earns its own module. Every requisition finding in this
 * ticket is a statement about a single day, because career sites refresh their posted
 * dates and the age of a posting cannot be established from outside. If two files ever
 * disagreed about which day the boards were read, every "open req" claim in the
 * artifact would quietly lose its meaning. One constant, imported everywhere.
 */

/** The day every careers board and ATS in this ticket was enumerated. */
const OBSERVED = '2026-10-27';

/** The draft campaign the ten are enrolled against. Unarmed; see c613Data.CAMPAIGN. */
const CAMPAIGN_ID = '36272d49-c2e9-4688-b497-047c83afd125';

/** Sentinel for an evidence field not yet filled. c613Criteria refuses to build on it. */
const PENDING = '__PENDING__';

/**
 * The L&D disqualifier as Ali settled it on 2026-10-28, and the test it replaced.
 *
 * The ticket's wording was "no full talent plus L&D function". Run literally it failed
 * three of the ten, and the one it cut hardest - Tennant - was the best-fitting company
 * on the list by every other signal. Ali was given both readings and chose the refined
 * one, so the test now asks about the SCALE AND SCOPE of what a company already builds
 * rather than whether it trains anybody at all.
 *
 * `evidenceLimit` is here because the refined wording is easy to state in a way nothing
 * can fail. No AI curriculum was found at any of the ten, so a literal "already runs an
 * AI-capability program" test would have disqualified nobody and quietly turned the
 * criterion into decoration. The wording below therefore tests demonstrated capacity to
 * build enterprise capability, which is what actually predicts a build-it-ourselves
 * answer - and c613Criteria fails the build if it ever stops filtering.
 */
const DISQ_LD = {
  decidedOn: '2026-10-28',
  wording: 'No in-house organization already building technical or professional '
    + 'capability at enterprise scale. A training function scoped to trades, safety, '
    + 'compliance, product or leadership does not disqualify; an enterprise learning '
    + 'organization owning a platform, staff and curriculum does.',
  replaced: 'No full talent plus L&D function.',
  evidenceLimit: 'No AI curriculum was found at any of the ten, so no company is '
    + 'disqualified for running an AI program today. The test is demonstrated capacity '
    + 'to build enterprise capability, which is the thing that predicts a '
    + 'build-it-ourselves answer.',
};

module.exports = { OBSERVED, CAMPAIGN_ID, PENDING, DISQ_LD };
