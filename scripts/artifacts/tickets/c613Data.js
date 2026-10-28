/**
 * C6.13 - the ten-company target list for the CEO-direct motion.
 *
 * This file composes the two sector halves and holds the campaign state they are
 * enrolled against. The evidence itself lives in c613CompaniesFinancial (banking,
 * payments, insurance) and c613CompaniesOperating (manufacturing, healthcare
 * operations, utilities); the checks that refuse to build a misleading document live
 * in c613Criteria.
 *
 * ## What this list does NOT claim
 *
 * Requisition AGE. Career sites refresh the displayed posted date - the same Tennant
 * posting read "Sep 28, 2026" in a search snippet and "Oct 27, 2026" live, hours apart.
 * The ticket called a req open over 90 days "the sharpest filter in the whole
 * strategy"; it is not verifiable from outside, and must_have item 2 was reworded in
 * production on 2026-10-27 to record OUR observation date instead. Every date below is
 * what a site displayed on that day, labeled as such.
 *
 * ## The order
 *
 * `rank` is the order the companies were assembled in, not a recommended sequence of
 * approach. The ticket reserves the order to Ali, and three of the ten now carry a
 * failed disqualifier, so proposing a sequence here would pre-empt a decision that is
 * his.
 */
const { OBSERVED, CAMPAIGN_ID, PENDING } = require('./c613Constants');
const { FINANCIAL } = require('./c613CompaniesFinancial');
const { OPERATING } = require('./c613CompaniesOperating');

/**
 * Campaign state, read from production read-only on 2026-10-27 AFTER the enrollment
 * write. All four activation blockers remain closed, so nothing here can send.
 */
const CAMPAIGN = {
  id: CAMPAIGN_ID,
  status: 'draft',
  qaStatus: 'untested',
  approvalStatus: 'approved',
  budgetSpent: '0.00',
  budgetTotal: '500.00',
  activationGate: { claims_approved: false, dry_run_reviewed: false },
  enrolled: 10,
  touchpoints: 0,
  responses: 0,
  leadIdRange: '25369-25378',
};

/**
 * must_have as it now stands in production. Item 2 was reworded on 2026-10-27; it
 * previously read "An AI engineering req open longer than 90 days", which no candidate
 * could satisfy honestly, so every qualification claim against it would have been false.
 */
const MUST_HAVE = [
  'A public, dated AI commitment the CEO has stated to a board or market',
  'An open AI, data engineering or data science requisition, recorded with the date it was observed',
  'No VP of AI or equivalent already in post',
];

const COMPANIES = [...FINANCIAL, ...OPERATING];

module.exports = { OBSERVED, CAMPAIGN, MUST_HAVE, COMPANIES, PENDING };
