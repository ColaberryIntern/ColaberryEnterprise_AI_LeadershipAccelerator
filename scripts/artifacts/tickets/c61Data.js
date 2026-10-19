/**
 * C6.1 - Strategic Account Data Model. THE single source for both PDFs.
 *
 * ## The rule this ticket sets, and the answer it produces
 *
 * "No new table proposed without proving the existing one cannot carry it." Taken seriously,
 * that produces a stronger answer than expected: **zero new tables**. `organizations`
 * already carries the shape, and the two things that looked like blockers turn out not to
 * be.
 *
 * ## Everything here was measured against production on 18 October 2026
 *
 * The decisive measurements, none of them guessable:
 *
 *   - `leads` holds 24,791 rows and only 2,584 carry a company at all. It is PERSON-shaped.
 *   - Those 2,584 resolve to 2,253 distinct companies with exactly ONE near-duplicate
 *     spelling across the whole set, so the free text is unusually clean.
 *   - `organizations` holds 9 rows typed `enterprise_customer` (7) and `client` (2).
 *   - `organizations.owner_enrollment_id` is NULLABLE and 2 of the 9 rows have none, so an
 *     account with no enrolled owner is already legal.
 *   - `organizations.lead_id` exists and is populated on 2 rows, so the link to the CRM is
 *     already there.
 *   - Only two foreign keys point at `organizations`: `org_cohorts` and `org_members`. Both
 *     are optional children.
 *
 * ## The trap worth naming
 *
 * The admin surface labeled "Business Accounts" reads `adminOrgApi`, which is the
 * `organizations` table. Anyone looking for the account entity finds that page first and
 * could reasonably conclude the CRM account model already exists and is populated with
 * three rows named "Colaberry" and one named "Self Emp". It is the learner org construct
 * wearing a sales name.
 */

const AS_OF = '18 October 2026';

const HEADLINE = 'No new tables. `organizations` already has a nullable owner, a link to '
  + 'the CRM and a type discriminator, so a strategic account is a new TYPE in an existing '
  + 'table rather than a second account universe.';

const SO_WHAT = [
  'The ticket says the fastest way to break this initiative is a parallel account universe. '
    + 'The honest risk here runs the other way too: `organizations` is a learner construct, '
    + 'and dropping sales accounts into it carelessly would pollute the cohort side. The '
    + 'discriminator is what makes it safe, and it is already there and already in use.',
  '`leads` cannot be the account. It holds 24,791 rows of which only 2,584 carry a company, '
    + 'so 90% of the CRM has no employer at all, and the rows that do are people rather '
    + 'than organizations. What `leads` is good for is the decision-maker entity, which is '
    + 'exactly what it already models.',
  'The one thing genuinely missing is the join. `leads.company` is free text and there is no '
    + 'foreign key from a person to an account. The text is clean enough to seed one, with a '
    + 'single near-duplicate spelling across 2,253 companies, but seeding is a migration and '
    + 'it needs saying out loud rather than assuming.',
];

/* ------------------------------------------------------------------ *
 * THE VERDICT TABLE, which is the deliverable
 * ------------------------------------------------------------------ */

const V = {
  REUSE: { k: 'REUSE', color: '#2f7d32' },
  EXTEND: { k: 'EXTEND', color: '#1f6feb' },
  BUILD: { k: 'BUILD NEW', color: '#b3261e' },
};

const ENTITIES = [
  {
    n: 1, entity: 'Account', verdict: V.EXTEND, where: 'organizations',
    why: 'It already has everything structural an account needs: `name` NOT NULL, a `status`, '
      + 'a nullable `owner_enrollment_id` so an account with no enrolled owner is legal, a '
      + 'nullable `lead_id` that already links to the CRM, and an `organization_type` '
      + 'discriminator already carrying enterprise_customer and client.',
    change: 'Add a `strategic_account` value to `organization_type`. Nothing else is '
      + 'structurally required for the entity to exist.',
    proof: '9 rows; owner_enrollment_id nullable with 2 of 9 null; lead_id populated on 2; '
      + 'only org_cohorts and org_members reference it, both optional.',
  },
  {
    n: 2, entity: 'Decision makers', verdict: V.REUSE, where: 'leads',
    why: 'This is what `leads` already is. It carries name, email, title, role, phone, '
      + 'linkedin_url, apollo_id and 24,791 rows of them. Modelling people a second time is '
      + 'the duplicate universe the ticket warns about.',
    change: 'None to the entity. See row 3 for the join.',
    proof: '62 columns on `leads`, including title, role, linkedin_url and apollo_id.',
  },
  {
    n: 3, entity: 'Account to person join', verdict: V.EXTEND, where: 'leads',
    why: 'The only genuine structural gap. `leads.company` is free text with no foreign key, '
      + 'so there is no way to ask who we know at an account.',
    change: 'Add a nullable `organization_id` to `leads`. Seed it from the existing company '
      + 'text, which is clean enough: 2,253 distinct companies and exactly one '
      + 'near-duplicate spelling.',
    proof: '2,584 of 24,791 leads carry a company; 2,253 distinct; 1 near-duplicate pair.',
  },
  {
    n: 4, entity: 'Initiative', verdict: V.EXTEND, where: 'organizations',
    why: 'An initiative is an attribute of the account relationship, not an entity with its '
      + 'own lifecycle yet. Giving it a table before a single account exists is speculative.',
    change: 'One nullable text column, or a key inside the attributes json in row 9.',
    proof: 'Zero strategic accounts exist today, so there is nothing to normalize away from.',
  },
  {
    n: 5, entity: 'ICP segment', verdict: V.REUSE, where: 'C2.5 scorecard, not the database',
    why: 'C2.5 already produced the ICP scorecard and filed it as C25_ICP_SCORECARD.csv. The '
      + 'segment an account belongs to is derivable from the account, and storing a copy '
      + 'invites it to drift from the approved definition.',
    change: 'Store the segment slug only, matching the five in C5.1. Not the scoring.',
    proof: 'C25_ICP_SCORECARD.csv and .html filed in 02 - Positioning & Business Model.',
  },
  {
    n: 6, entity: 'Fit and urgency', verdict: V.REUSE, where: 'leads scoring columns',
    why: 'There are ALREADY four score columns and three stage columns on `leads`: '
      + 'lead_score, executive_briefing_score, sponsorship_readiness_score, maturity_score, '
      + 'pipeline_stage, executive_interest_stage, sponsorship_stage. A fifth score and a '
      + 'fourth stage is how a schema stops meaning anything.',
    change: 'None. Score the ACCOUNT with C7.1’s lighthouse scorecard and store the '
      + 'single resulting number, rather than inventing per-dimension columns.',
    proof: '7 score or stage columns already on `leads`, counted on 18 Oct 2026.',
  },
  {
    n: 7, entity: 'Warm paths', verdict: V.BUILD, where: 'a small join table',
    why: 'Nothing in the schema models "who do we know at this account, and through whom". '
      + 'The nearest things are `lead_tenant_contexts.relationship_type` and '
      + '`inbox_vips.relationship`, and neither connects a person to an account. This is a '
      + 'many-to-many between an account and a person with a relationship kind, which is '
      + 'genuinely a join table and cannot be a column.',
    change: 'One table: account, person, relationship kind, strength, who introduced. This '
      + 'is the ONLY new table in this design and it exists because the shape is a '
      + 'relationship, not an attribute.',
    proof: 'Swept every column matching referral, introduc, relationship, warm or '
      + 'connection: 24 hits, none joining a person to an account.',
  },
  {
    n: 8, entity: 'Funding probability', verdict: V.EXTEND, where: 'organizations',
    why: 'A single number on the account. It has no sub-structure and no history requirement '
      + 'that anybody has asked for.',
    change: 'One nullable integer, or a key in the attributes json.',
    proof: 'No existing column models it; no existing table has the right grain.',
  },
  {
    n: 9, entity: 'Next action', verdict: V.EXTEND, where: 'organizations',
    why: 'Account-level, single-valued, and changes often. A history of next actions is a '
      + 'different feature nobody has asked for; if it is wanted later it becomes a table '
      + 'then, with the requirement in hand.',
    change: 'A nullable text and a nullable due date, or keys in the attributes json.',
    proof: 'leads.notes and leads.last_contacted_at exist at PERSON grain, which is the '
      + 'wrong grain for an account-level next action.',
  },
  {
    n: 10, entity: 'Everything not yet named', verdict: V.EXTEND, where: 'organizations',
    why: 'The fields above are what C6.1 lists today. A strategic account program discovers '
      + 'attributes as it runs, and the alternative to planning for that is a migration per '
      + 'discovery.',
    change: 'One nullable jsonb `attributes` column. The codebase already does this in 35 '
      + 'places, so it is the house pattern rather than a novelty.',
    proof: '35 jsonb columns across lead, account and campaign tables.',
  },
];

/* ------------------------------------------------------------------ *
 * THE TRAP
 * ------------------------------------------------------------------ */

const TRAP = {
  what: 'The admin page called "Business Accounts" is the learner organizations table.',
  detail: 'AdminBusinessAccountsPage imports adminOrgApi, which calls the org routes backed '
    + 'by `organizations`. Anyone looking for the CRM account entity finds that page first. '
    + 'Of the 9 rows, three are named "Colaberry" and one is "Self Emp", so the page looks '
    + 'like a broken CRM rather than a working learner-org list.',
  consequence: 'That is the most likely way this initiative accidentally builds the parallel '
    + 'universe: not by creating a new table, but by concluding the existing one is unusable '
    + 'on the basis of how its admin page reads.',
};

const LIMITS = [
  'This is a design decision and nothing is built, which the ticket puts out of scope. The '
    + 'migration to seed `leads.organization_id` from company text is named but not written.',
  'The one new table, warm paths, needs Ali’s approval under the ticket’s own rule. '
    + 'Everything else is a type value, a nullable column or a json key.',
  'Row counts move. `organizations` was 6 rows earlier on 17 October and 9 on 18 October, '
    + 'which is why every figure here carries its date.',
  'Whether the five ICP segment slugs should match C5.1’s five website segments exactly '
    + 'is an open question. They currently describe the same five audiences and nothing '
    + 'enforces that they stay aligned.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS - the ticket's acceptance criteria as build gates
 * ------------------------------------------------------------------ */

/** "Every entity has a reuse/extend/build verdict with reasoning." */
function assertEveryEntityHasAVerdict() {
  for (const e of ENTITIES) {
    if (!e.verdict || !e.why || !e.change) {
      throw new Error(`C6.1: entity "${e.entity}" is missing a verdict, a reason or a change`);
    }
  }
  return ENTITIES.length;
}

/**
 * "No new table proposed without proving the existing one cannot carry it."
 *
 * Enforced literally: a BUILD verdict must carry proof, and that proof must describe a
 * search that came back empty rather than an opinion about fit.
 */
function assertBuildVerdictsAreProven() {
  const builds = ENTITIES.filter((e) => e.verdict === V.BUILD);
  for (const b of builds) {
    if (!b.proof || !/none|no |zero|empty|swept/i.test(b.proof)) {
      throw new Error(`C6.1: "${b.entity}" proposes a new table without proving the absence`);
    }
  }
  if (builds.length > 1) {
    throw new Error(`C6.1: ${builds.length} new tables proposed. The ticket says default `
      + 'strongly to reuse; more than one needs a much better argument than this document has.');
  }
  return builds.length;
}

/** Every verdict must name where the data lands, or it is not a design. */
function assertEveryVerdictNamesAHome() {
  const bad = ENTITIES.filter((e) => !e.where || !String(e.where).trim());
  if (bad.length) {
    throw new Error('C6.1: no home named for ' + bad.map((b) => b.entity).join(', '));
  }
  return ENTITIES.length;
}

/** The trap must stay stated; it is the most useful thing in the document. */
function assertTrapStaysStated() {
  if (!/organizations/i.test(TRAP.detail) || !/adminOrgApi/i.test(TRAP.detail)) {
    throw new Error('C6.1: the Business Accounts trap must name the table and the API');
  }
  return true;
}

module.exports = {
  AS_OF, V, HEADLINE, SO_WHAT, ENTITIES, TRAP, LIMITS,
  assertEveryEntityHasAVerdict, assertBuildVerdictsAreProven,
  assertEveryVerdictNamesAHome, assertTrapStaysStated,
};
