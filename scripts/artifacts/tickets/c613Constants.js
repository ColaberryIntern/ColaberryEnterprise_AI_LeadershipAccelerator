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

module.exports = { OBSERVED, CAMPAIGN_ID, PENDING };
