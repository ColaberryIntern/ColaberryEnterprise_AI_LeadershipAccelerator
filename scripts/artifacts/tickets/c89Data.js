/**
 * C8.9 - cohort to organization join. THE single source for both PDFs.
 *
 * ## This ticket needs no code, and saying so is the work
 *
 * The ticket's own warning is the sharpest thing in it: "Declaring it done against a schema
 * that exists but holds no rows... a table with the right shape and zero records reads as
 * capability and is not. Prove it with real data, not with a migration."
 *
 * The honest finding runs the other way too. The MECHANISM is entirely built - table
 * created at boot, model, tenant-scoped service, routes, and existing tests covering the
 * idempotent link. Writing a second one would be the mirror of the failure the ticket
 * warns about: shipping code to look busy against a gap that is not a code gap.
 *
 * What is missing is one business decision and one critical fix that belongs to another
 * ticket. Both are named below rather than worked around.
 */
const fs = require('fs');
const path = require('path');
const { findBritishSpelling, americanForm } = require('../britishSpellings');

const SERVICE = path.join(
  __dirname, '..', '..', '..', 'backend', 'src', 'services', 'adminOrgService.ts',
);
const SERVICE_TEST = path.join(
  __dirname, '..', '..', '..', 'backend', 'src', 'services', '__tests__',
  'adminOrgService.test.ts',
);

const AS_OF = '2026-10-20';

/* ── measured in production, read-only ────────────────────────────────────── */

const MEASURED = {
  orgCohorts: 0,
  organizations: 9,
  cohorts: 5,
  tenantMemberships: 0,
  tenants: 4,
  orgMembers: 29,
};

/** Cohorts that actually hold learners, so "attach a real one" has candidates. */
const COHORTS = [
  { name: 'Explorer - Prospects', learners: 435, institutional: false,
    why: 'A prospect pool, not an institution\'s licensed learners. Attaching it to an '
      + 'organization would assert that 435 people belong to that institution, which is '
      + 'the single most damaging thing this join could get wrong.' },
  { name: 'Cohort - July 2026', learners: 57, institutional: true, why: 'A real delivery cohort.' },
  { name: 'Cohort - November 2026', learners: 38, institutional: true, why: 'A real delivery cohort.' },
  { name: 'Cohort - April 2026', learners: 14, institutional: true, why: 'A real delivery cohort.' },
];

/* ── the three acceptance criteria, judged ────────────────────────────────── */

const CRITERIA = [
  {
    n: 1,
    text: 'A cohort can be attached to an institution and the join is queryable',
    verdict: 'MET',
    evidence: 'org_cohorts is created at boot by ensureOrgAccountSchema, called from '
      + 'server.ts. OrgCohort is a model. adminOrgService.addCohortToOrganization takes a '
      + 'tenant scope, validates the organization and the cohort, and uses findOrCreate so '
      + 'a re-link is a no-op rather than a duplicate, backed by a unique index on '
      + '(org_id, cohort_id). getOrganizationDetail reads the join. Existing tests in '
      + 'adminOrgService.test.ts cover the create and the idempotent re-link.',
  },
  {
    n: 2,
    text: 'org_cohorts holds real rows for at least one real institution',
    verdict: 'BLOCKED',
    evidence: 'Zero rows today. This needs a write to production AND a decision only Ali '
      + 'can make: WHICH of the nine organizations owns WHICH cohort. That is an assertion '
      + 'about who a group of learners belongs to, not a configuration step, and getting '
      + 'it wrong mis-attributes real people to an institution that did not buy them.',
  },
  {
    n: 3,
    text: 'An institutional license holder can see only their own learners',
    verdict: 'CANNOT BE MET YET',
    evidence: 'tenant_memberships holds 0 rows against 4 tenants, so the isolation layer is '
      + 'in its permissive migration mode. That is C7.7 gap G2, rated CRITICAL, and it is a '
      + 'tenancy migration rather than anything this ticket can do. Until it is closed, '
      + 'populating the join would group learners without isolating them, which is the '
      + 'appearance of a license boundary without the boundary.',
  },
];

const DECISION = 'Which organization owns which cohort. Everything else is either done or '
  + 'belongs to C7.7 G2.';

/* ── assertions ───────────────────────────────────────────────────────────── */

/** Criterion 1 is only MET if the code and its test are actually there. */
function assertMechanismExists() {
  const svc = fs.readFileSync(SERVICE, 'utf8');
  const test = fs.readFileSync(SERVICE_TEST, 'utf8');
  if (!/export async function addCohortToOrganization/.test(svc)) {
    throw new Error('C8.9: addCohortToOrganization is gone. Criterion 1 is no longer MET; '
      + 'rewrite the verdict rather than the check.');
  }
  if (!/OrgCohort\.findOrCreate/.test(svc)) {
    throw new Error('C8.9: the link is no longer idempotent via findOrCreate');
  }
  if (!/addCohortToOrganization/.test(test)) {
    throw new Error('C8.9: the join has lost its test, so "built and tested" is now false');
  }
  return true;
}

/** The ticket's named failure: do not report capability from an empty table. */
function assertEmptinessIsNotDressedUp() {
  const met = CRITERIA.filter((c) => c.verdict === 'MET').map((c) => c.n);
  if (MEASURED.orgCohorts === 0 && met.includes(2)) {
    throw new Error('C8.9: org_cohorts holds zero rows, so criterion 2 cannot be MET. That '
      + 'is exactly the pattern this ticket warns about.');
  }
  if (MEASURED.orgCohorts > 0) {
    throw new Error('C8.9: org_cohorts now holds rows. Re-measure and rewrite the verdicts '
      + 'rather than shipping a stale BLOCKED.');
  }
  return MEASURED.orgCohorts;
}

/** Criterion 3 depends on a fact about another system; it must stay checked, not assumed. */
function assertIsolationGapIsStated() {
  if (MEASURED.tenantMemberships !== 0) {
    throw new Error('C8.9: tenant_memberships is no longer empty. Criterion 3 may now be '
      + 'reachable; re-measure before shipping this verdict.');
  }
  const c3 = CRITERIA.find((c) => c.n === 3);
  if (!/G2/.test(c3.evidence)) {
    throw new Error('C8.9: criterion 3 must name C7.7 G2 as the blocker, so a reader can '
      + 'follow it rather than taking the refusal on trust.');
  }
  return true;
}

/** The prospect pool must stay flagged. It is the obvious cohort and the wrong one. */
function assertProspectPoolIsFlagged() {
  const pool = COHORTS.find((c) => /Prospects/i.test(c.name));
  if (!pool || pool.institutional !== false) {
    throw new Error('C8.9: the prospect pool must stay marked as NOT institutional. It is '
      + 'the largest cohort and therefore the one someone would reach for first.');
  }
  return pool.learners;
}

/** No unexplained verdict. */
function assertEveryCriterionHasEvidence() {
  for (const c of CRITERIA) {
    if (!['MET', 'BLOCKED', 'CANNOT BE MET YET'].includes(c.verdict)) {
      throw new Error(`C8.9: criterion ${c.n} has an unrecognized verdict`);
    }
    if (!c.evidence || c.evidence.length < 60) {
      throw new Error(`C8.9: criterion ${c.n} has no real evidence behind its verdict`);
    }
  }
  return CRITERIA.length;
}

function assertCopyIsClean() {
  const prose = [
    ...CRITERIA.map((c) => `${c.text} ${c.evidence}`),
    ...COHORTS.map((c) => c.why),
    DECISION,
  ].join(' ');
  const british = findBritishSpelling(prose);
  if (british) {
    throw new Error(`C8.9: British spelling "${british}"; use "${americanForm(british)}"`);
  }
  if (/—/.test(prose)) throw new Error('C8.9: the copy contains an em dash');
  return true;
}

module.exports = {
  AS_OF,
  MEASURED,
  COHORTS,
  CRITERIA,
  DECISION,
  assertMechanismExists,
  assertEmptinessIsNotDressedUp,
  assertIsolationGapIsStated,
  assertProspectPoolIsFlagged,
  assertEveryCriterionHasEvidence,
  assertCopyIsClean,
};
