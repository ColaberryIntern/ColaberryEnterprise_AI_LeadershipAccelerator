/**
 * C8.11 - deployment candidate selection and handover.
 *
 * THE TICKET'S PREMISE IS WRONG IN THE MOST EXPENSIVE DIRECTION. It says "no selection or
 * handover flow exists". One exists end to end: schema, model, service, six HTTP
 * endpoints, a server-side client projection, and a live external-facing portal tab that
 * renders a release with its evidence summary. It is called a RELEASE, not a deployment
 * candidate, and the row's default status is literally 'candidate'.
 *
 * It holds zero rows because the whole Refactored Delivery OS has never been run, which
 * its own IMPLEMENTATION_STATUS records as "Deployment state: NOT DEPLOYED" with the
 * seven required end-to-end scenarios not executed. That is a different problem from a
 * missing flow, and building a second flow would have been this initiative's signature
 * failure.
 *
 * WHAT THIS TICKET ACTUALLY SHIPPED IS ONE SMALL THING plus three decisions. The one
 * thing is the release-to-evidence join, which was a real hole: the column and its index
 * existed and nothing ever wrote them. The three decisions are Ali's, and two of them are
 * governance rather than engineering.
 */

const AS_OF = '26 October 2026';

/* ------------------------------------------------------------------ *
 * What already exists
 * ------------------------------------------------------------------ */

const EXISTING = [
  {
    piece: 'The candidate record',
    where: 'delivery_releases, ensureRefactoredDeliverySchema.ts:884',
    detail: 'status defaults to the literal string "candidate". Carries candidate_sha, '
      + 'check_results, waived_categories, approved_by_identity_id and approved_at. '
      + 'Unique on (delivery_project_id, version).',
  },
  {
    piece: 'The selection and approval service',
    where: 'services/delivery/releaseManagement.ts',
    detail: 'createReleaseCandidate, recordReleaseCheck, waiveReleaseCheck with a '
      + 'mandatory written reason, evaluateRelease, and approveRelease which stamps the '
      + 'approver and the time.',
  },
  {
    piece: 'The HTTP surface',
    where: 'routes/deliveryAdminRoutes.ts, six endpoints under /api/refactored/admin',
    detail: 'Cut a candidate, record a check, waive with a reason, read the gate verdict, '
      + 'approve. Each one requireAdmin. Approval returns 409 when the gate refuses and '
      + '401 without an identity.',
  },
  {
    piece: 'The handover checklist',
    where: 'modules/delivery/releaseChecks.ts:23',
    detail: 'stories_complete, requirements_covered, tests, browser, security, '
      + 'accessibility, ai_evals, migration_rehearsal, rollback, client_acceptance. The '
      + 'mandatory subset varies by delivery profile.',
  },
  {
    piece: 'The external-facing view',
    where: 'ClientPortal.tsx Releases tab, fed by clientReleaseProjection.ts',
    detail: 'Renders each release with its evidence_summary and a count of waived checks, '
      + 'behind a JWT with no role claim, a server-side field allowlist, and a '
      + 'fail-closed tripwire that 500s rather than leak an unlisted field.',
  },
  {
    piece: 'The customer sign-off record',
    where: 'delivery_client_acceptances + services/delivery/clientAcceptance.ts',
    detail: 'Snapshots what the client was shown at the moment they accepted, assembled '
      + 'server-side and never from the request body.',
  },
  {
    piece: 'A second, lifecycle-level version of the same thing',
    where: 'project_lifecycle_states, stages release_review then launch_ready then operating',
    detail: 'Thirteen governed stages with prerequisites and its own admin UI, shipping '
      + 'dark behind ENABLE_PROJECT_LIFECYCLE.',
  },
];

/** Why it is all empty. Measured against production. */
const MEASURED = {
  asOf: AS_OF,
  deliveryProjects: 12,
  deliveryProjectsByStatus: 'discovery 8, building 4, none past building',
  deliveryStories: 0,
  deliveryReleases: 0,
  deliveryEvidence: 0,
  deliveryClientAcceptances: 0,
  lifecycleRows: 24,
  lifecycleRowsPastDiscovery: 0,
  verifiedStudentStories: 382,
  verifiedStudentProjects: 33,
  verifiedProjectsLinkedToDelivery: 0,
  sponsors: 1,
  sponsorSeats: 0,
};

/* ------------------------------------------------------------------ *
 * The criteria
 * ------------------------------------------------------------------ */

const CRITERIA = [
  {
    n: 1,
    name: 'A delivery lead can mark which projects the customer takes into production',
    verdict: 'NOT MET',
    blockedOn: 'an admin interface',
    evidence: 'The mechanism is complete. Six endpoints cut, check, waive, evaluate and '
      + 'approve a release candidate, each admin-gated, with the approver recorded on the '
      + 'row. What does not exist is any way to reach them: a search of the entire '
      + 'frontend for the string "refactored/admin" returns zero hits, so there is no '
      + 'page, no button and no form anywhere.',
    toClose: 'An admin page over the six endpoints that already exist. No new backend '
      + 'work, and deliberately none added here, because a second service would have '
      + 'been the duplicate this ticket warns about.',
  },
  {
    n: 2,
    name: 'Handover carries the evidence trail with it',
    verdict: 'NOT MET',
    blockedOn: 'a decision about what the client may see',
    evidence: 'Half of this was a genuine hole and is fixed in this change. '
      + 'delivery_evidence.release_id and its index have existed since the schema '
      + 'shipped and nothing ever wrote them, so every evidence row was attached to a '
      + 'story and to no release. A release now claims the project unclaimed evidence '
      + 'when it is cut. The other half is untouched on purpose: what the client sees is '
      + 'still only the gate verdicts on the release row, because widening an '
      + 'allowlisted external surface is a decision rather than a gap.',
    toClose: 'Decide whether the external view shows the evidence rows themselves or '
      + 'continues to show only the check verdicts, then change the allowlist in that '
      + 'one direction.',
  },
  {
    n: 3,
    name: 'The selection is visible to the sponsor, not just internally',
    verdict: 'NOT MET',
    blockedOn: 'which party "sponsor" means',
    evidence: 'There are two unrelated external parties in this codebase and the surface '
      + 'that does this job serves the other one. A CLIENT is an external reviewer on a '
      + 'delivery project, authenticated by a scoped JWT, and already sees releases with '
      + 'their evidence. A SPONSOR is an employer who bought seats, authenticated by an '
      + 'emailed expiring token, and sees a talent-discovery dashboard with seat counts '
      + 'and participant rankings and not one delivery field. Production holds 1 sponsor '
      + 'and 0 sponsor seats.',
    toClose: 'Say which party the criterion means. If it means the client, this is '
      + 'already met and the ticket should say so. If it genuinely means the '
      + 'seat-buying sponsor, that is a new surface and a new scope.',
  },
];

/* ------------------------------------------------------------------ *
 * What this change actually did
 * ------------------------------------------------------------------ */

const SHIPPED = {
  what: 'The release-to-evidence join',
  files: 'services/delivery/releaseEvidence.ts, wired into createReleaseCandidate',
  why: 'The column and the index existed and nothing wrote them. A handover carried the '
    + 'gate verdicts without the trail behind them, and a verdict is an assertion while '
    + 'the evidence rows are the proof.',
  properties: [
    'A release claims only evidence that belongs to no release yet, so cutting a second '
      + 'release cannot rewrite what the first one shipped with.',
    'Idempotent by that same rule: claiming twice claims nothing the second time.',
    'Best-effort and after the release row exists, because the release is the primary '
      + 'record and a derived join must not be able to lose it.',
    'Returns ran:false rather than claimed:0 when it could not look, because a handover '
      + 'reporting no evidence when it means it never checked is this initiative\'s '
      + 'recurring failure.',
    'summarizeTrailCoverage reports a passing check with no evidence behind it as '
      + 'unevidenced, and deliberately does not block on it: the gate already decides '
      + 'pass or fail, and a second gate would stop releases on dimensions nobody has '
      + 'instrumented.',
  ],
};

/* ------------------------------------------------------------------ *
 * The decisions, two of which are governance
 * ------------------------------------------------------------------ */

const DECISIONS = [
  {
    n: 1,
    question: 'Does the plan now authorize production deployment?',
    kind: 'GOVERNANCE',
    detail: 'assertDeploymentAuthorized in services/delivery/releaseGate.ts refuses '
      + 'unconditionally, with the rule not_authorized_by_plan and the text "Master plan '
      + 'section 20 does not authorize production deployment. This refusal is '
      + 'unconditional and is removed by a code change with a review, not by '
      + 'configuration." Nothing writes a release status of "released" either, although '
      + 'the client route reads for it.',
    why: 'This ticket asks which projects the customer takes INTO PRODUCTION. Recording '
      + 'that selection is already allowed and already built, because the codebase draws '
      + 'the line itself: a release is a record, not a deployment. Actually deploying is '
      + 'refused by plan. I did not implement the released state, because doing so would '
      + 'have crossed that line quietly under the cover of a ticket that did not ask for '
      + 'it.',
  },
  {
    n: 2,
    question: 'Does "sponsor" in criterion 3 mean the client or the seat-buying employer?',
    kind: 'SCOPE',
    detail: 'They are different people with different authentication, different data and '
      + 'different portals. The client portal already does what criterion 3 describes.',
    why: 'If it means the client, this ticket is closer to done than it looks. If it '
      + 'means the sponsor, the work is a new surface rather than a gap in this one.',
  },
  {
    n: 3,
    question: 'Who links verified learner work to a delivery project?',
    kind: 'STRUCTURAL',
    detail: 'Of the 33 student projects carrying commit-verified work, across 382 '
      + 'verified stories, ZERO are linked to a delivery project. The four existing '
      + 'source links point at four different projects that carry no verified work.',
    why: 'This is the deepest finding here. Even a finished handover flow with a UI would '
      + 'currently have nothing to hand over, because the work that has been verified and '
      + 'the projects a customer would take into production are two disconnected sets.',
  },
];

const RECOMMENDATION = {
  verdict: 'DO NOT BUILD A SELECTION FLOW. ONE EXISTS.',
  because: 'Every piece this ticket describes is built, tested and merged. The zero rows '
    + 'are not a missing flow, they are a pipeline that has never been run: no delivery '
    + 'project has a single story, and none has moved past building.',
  smallestPathToUseful: 'An admin page over the six endpoints that already exist, and a '
    + 'decision on which external party criterion 3 means. Neither is a new service.',
};

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/** Every verdict is MET or NOT MET, and every NOT MET says what would close it. */
function assertEveryVerdictIsBinaryAndActionable() {
  for (const c of CRITERIA) {
    if (c.verdict !== 'MET' && c.verdict !== 'NOT MET') {
      throw new Error(`C8.11: criterion ${c.n} has verdict "${c.verdict}"`);
    }
    if (c.verdict === 'NOT MET' && (!c.blockedOn || !c.toClose || c.toClose.length < 30)) {
      throw new Error(`C8.11: criterion ${c.n} fails without saying what would close it`);
    }
    if (!c.evidence || c.evidence.length < 80) {
      throw new Error(`C8.11: criterion ${c.n} has no usable evidence`);
    }
  }
  if (CRITERIA.length !== 3) {
    throw new Error(`C8.11: ${CRITERIA.length} criteria, expected 3`);
  }
  return CRITERIA.length;
}

/**
 * The document must keep saying the flow already exists.
 *
 * This is the finding the whole artifact turns on. If an edit ever softened it into "the
 * flow is incomplete", the next reader would build the duplicate this ticket's own
 * warning is about.
 */
function assertThePremiseCorrectionSurvives() {
  if (!/DO NOT BUILD A SELECTION FLOW/.test(RECOMMENDATION.verdict)) {
    throw new Error('C8.11: the document no longer says a flow already exists');
  }
  if (EXISTING.length < 5) {
    throw new Error('C8.11: the existing-pieces list has been trimmed below the point '
      + 'where it demonstrates the flow is complete');
  }
  if (MEASURED.deliveryReleases !== 0 || MEASURED.deliveryStories !== 0) {
    throw new Error('C8.11: delivery rows appeared; re-measure before shipping this');
  }
}

/** The deployment refusal must never be described as an oversight. */
function assertTheDeploymentRefusalIsNamedAsGovernance() {
  const d = DECISIONS.find((x) => x.n === 1);
  if (!d || d.kind !== 'GOVERNANCE') {
    throw new Error('C8.11: the deployment refusal is no longer flagged as governance');
  }
  if (!/unconditional/i.test(d.detail)) {
    throw new Error('C8.11: the refusal is no longer described as unconditional');
  }
}

/** The structural disconnect is the finding most likely to be dropped for being awkward. */
function assertTheDisconnectIsStated() {
  if (MEASURED.verifiedProjectsLinkedToDelivery !== 0) {
    throw new Error('C8.11: projects are now linked; re-measure');
  }
  const d = DECISIONS.find((x) => x.kind === 'STRUCTURAL');
  if (!d || !/ZERO are linked/.test(d.detail)) {
    throw new Error('C8.11: the verified-work-to-delivery disconnect is no longer stated');
  }
}

module.exports = {
  AS_OF, EXISTING, MEASURED, CRITERIA, SHIPPED, DECISIONS, RECOMMENDATION,
  assertEveryVerdictIsBinaryAndActionable, assertThePremiseCorrectionSurvives,
  assertTheDeploymentRefusalIsNamedAsGovernance, assertTheDisconnectIsStated,
};
