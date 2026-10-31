/**
 * AF2.7's facts: three portal surfaces that told somebody something untrue, what each one's
 * acceptance criterion actually asked for, and the evidence that it is now met.
 *
 * Data only, no rendering, so every number here can be re-checked without reading layout code.
 * Each `asked` string is a compression of the ticket's own acceptance wording rather than a
 * restatement of what was built -- the point of the artifact is whether the thing that was ASKED
 * FOR got done, and that comparison is impossible if both halves are written from the diff.
 */

/** The ticket is P2 and was found in front of the cohort during the 19-20 Oct rollout. */
const TICKET = 'AF2.7';
const MEASURED_ON = '2026-10-28';
const PR = 3450;
const MERGE_SHA = '79ab565b';

/**
 * Ranked as the ticket ranks them: one functional, two cosmetic. The ranking is part of the
 * requirement, not editorial -- the ticket says they are "filed together because that is the
 * shared cause, and ranked because one is functional and two are cosmetic".
 */
const ITEMS = [
  {
    key: 'view-as',
    n: 1,
    rank: 'functional',
    title: 'View-as leaked into the admin\'s OWN management portal',
    reported: 'Ali, 20 Oct: "when I click to see their account and then I click on Mgmt Portal, '
      + 'it takes me to mine instead of theirs so I can\'t see their Mgmt portal".',
    asked: 'Either open the IMPERSONATED person\'s management portal read-only, or hide the entry '
      + 'during a view-as session with a one-line reason. A silent fall-through to the viewer\'s '
      + 'own portal must be impossible, and it must be asserted by a test that DRIVES a view-as '
      + 'session rather than by inspection.',
    delivered: 'Hidden, with the reason carried on the read-only banner. That is the second branch '
      + 'of the acceptance, chosen because it is the one that cannot be half-right: there is no '
      + 'route into the bridge to fall through.',
    mechanism: [
      'The view-as flow mints a read-only participant token and stores it in sessionStorage, '
        + 'which is tab-scoped ON PURPOSE so two tabs can hold two identities.',
      'The Management Portal entry opened in a NEW TAB.',
      'sessionStorage does not cross tabs, so the new tab found no view-as token.',
      'getParticipantToken() then fell back to localStorage.participant_token -- the admin\'s own.',
      'The bridge minted an admin session for the ADMIN, and nothing errored.',
    ],
    whyItMatters: 'The whole value of view-as is seeing what they see. A surface that silently '
      + 'substitutes your own view is worse than one that refuses, because the viewer has no '
      + 'signal they are being shown the wrong thing.',
    files: [
      ['frontend/src/pages/portal/mgmtBridgeGate.ts', 'new: the single place the rule lives'],
      ['frontend/src/utils/participantToken.ts', 'canonical isReadOnlyParticipantSession()'],
      ['frontend/src/components/campus/AdminLink.tsx', 'gated at the leaf; 4 call sites inherit it'],
      ['frontend/src/pages/portal/today/PortalShell.tsx', 'the nav group is not assembled'],
      ['frontend/src/components/portal/ReadOnlyBanner.tsx', 'carries the one-line reason'],
    ],
    tests: 17,
    testNote: 'Three files, and every case is paired with its own control in the employee\'s own '
      + 'session, so a mutation in either direction fails a different test. One check scans the '
      + 'whole assembled nav for ANY route into the bridge and names no nav item, so a new entry '
      + 'added later is caught without editing the test.',
  },
  {
    key: 'preview',
    n: 2,
    rank: 'cosmetic',
    title: 'A dead preview link on every project page, platform-wide',
    reported: 'Found while working item 1. Not an Agent Factory regression: the ten interns are '
      + 'simply the newest people to be shown it.',
    asked: 'Do not render the link unless the host actually resolves, or finish the feature so '
      + 'that it does. Building the preview hosting itself is explicitly out of scope.',
    delivered: 'The link renders only when REACT_APP_PROJECT_PREVIEW_HOST is set, read per render '
      + 'rather than at module load. It is unset in production, so nothing renders.',
    mechanism: [
      'Every student project page rendered a clickable link to <slug>.preview.colaberry.ai, '
        + 'unconditionally, derived from the project slug.',
      'Measured 20 Oct: preview.colaberry.ai had NO DNS AT ALL -- not the apex, not any '
        + 'subdomain, across six probes.',
      'So the link had never worked, for any student, on any project.',
    ],
    whyItMatters: 'A dead link on a student\'s own project page is the same category as the '
      + 'unchecked portfolio link that C5.0 refuses to publish.',
    files: [
      ['frontend/src/pages/portal/projects/ProjectInterior.tsx', 'host read per render, then gated'],
    ],
    tests: 5,
    testNote: 'Read PER RENDER, not at module scope: the first attempt read the host once at '
      + 'import time, which forced the test to re-isolate the module registry and loaded a second '
      + 'React into it. The env read moved rather than the test being worked around.',
  },
  {
    key: 'names',
    n: 3,
    rank: 'cosmetic',
    title: 'The ten domain projects were named with raw machine keys',
    reported: 'They read admissions, product_experience, learner_success -- snake_case, lower '
      + 'case -- where every other student project carries a human name (CoreOps, HosPulse, '
      + 'Ambit, Ledgerly). Interns see this on their own project page and on the admin board.',
    asked: 'The ten read as titles. The ticket flags the trap itself: the provisioner uses '
      + 'findOrCreate and only honors a name on first creation, so a re-run will NOT repair the '
      + 'existing rows -- they need a direct update AND the provisioner needs fixing, or the next '
      + 'domain lands wrong again.',
    delivered: 'Both halves. One naming function lives beside the titles in the registry and is '
      + 'called by the provisioner AND by a repair script, so the row a repair renames and the row '
      + 'the next provision creates cannot disagree.',
    mechanism: [
      'The provisioner wrote name: plan.domain_key.',
      'domainProjectName() now sits beside the titles in agentDomainRegistry.ts; two copies of '
        + 'that rule is how a repair silently writes a different name than the next provision.',
      'renameAgentDomainProjects.ts repairs the ten rows already in production: dry-run by '
        + 'default, --execute to write, scoped to the name column by an explicit fields list.',
      'A row carrying neither the key nor the title was renamed by a human on purpose, so it is '
        + 'reported as skipped_custom and LEFT ALONE rather than overwritten.',
    ],
    whyItMatters: 'Cosmetic on one screen, but it is the name an intern sees on their own work.',
    files: [
      ['backend/src/services/agentDomain/agentDomainRegistry.ts', 'domainProjectName(), beside the titles'],
      ['backend/src/services/agentDomain/agentDomainProvisioner.ts', 'calls it instead of the raw key'],
      ['backend/src/scripts/renameAgentDomainProjects.ts', 'new: repairs the ten existing rows'],
    ],
    tests: 11,
    testNote: 'Idempotency is MEASURED, not argued: a third --execute run against the live '
      + 'database wrote nothing and reported 10 ALREADY CORRECT.',
  },
];

/**
 * What the production deploy actually proved, and what it did not.
 *
 * The honest unit here is the asset hash change plus the markers, because a deploy's exit code
 * says nothing about whether the surface a human touches changed. Checked through the real
 * hostname: localhost does not match the server_name and falls through to a block that 404s /api.
 */
const DEPLOY = {
  mergeSha: MERGE_SHA,
  checks: [
    ['/ through Cloudflare', '200', true],
    ['/api/portal/points without a token', '401', true],
    ['main bundle fetched', '200, 1,963,014 bytes', true],
    ['all three change markers present in the bundle', 'found', true],
    ['negative control string absent from the bundle', 'absent', true],
    ['asset hash moved', 'af3c141b -> 8959de3a', true],
  ],
  rowsRenamed: 10,
  rowsTotal: 10,
  idempotentRun: 'a third --execute run wrote nothing',
};

const TOTAL_TESTS = ITEMS.reduce((a, i) => a + i.tests, 0);

module.exports = { TICKET, MEASURED_ON, PR, MERGE_SHA, ITEMS, DEPLOY, TOTAL_TESTS };
