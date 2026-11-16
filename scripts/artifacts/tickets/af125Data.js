/**
 * AF12.5 — the one data module both PDFs read, so a number on the visual cannot drift from the
 * same number in the document.
 *
 * Every figure here was MEASURED on 2026-11-16, most of them inside the running production
 * container rather than locally. Where a number came from the ticket rather than from a
 * measurement it is marked, because the ticket was written on 10 Nov and the data has moved
 * under it since.
 */

const TICKET = 'AF12.5';
const PR = 4089;
const MERGED_ON = '2026-11-16';
const MERGE_SHA = '1c7609e5a';

/** What the ticket asked for, and what went out. One sentence each. */
const ASKED = 'Publish the capability records that both domain-detail endpoints already load and '
  + 'throw away, so the three builders whose Command Center panels have no source can build them.';
const DELIVERED = 'One shared, allow-listed projection now feeds both endpoints and the committed '
  + 'snapshot; merged, deployed and verified by measurement inside the production container.';

const HEADLINE = 'The capability records reach the builders. Live in production and measured there.';

/** Who reported it. Three people, independently, which is why it was a P0. */
const REPORTERS = [
  ['Mihret Netsereab', '10 Nov', 'Criterion 1. Escalated on Aleem’s instruction after he reviewed her PR #1.'],
  ['Victoria Spencer-Auber', '—', 'Criterion 3. The same missing data, reached from a different domain.'],
  ['Sarbjit Kaur', '3 Nov', 'Asked for the per-capability ceiling and reason, which needed the records.'],
];

/** The defect, stated so a reader can check it rather than take it on faith. */
const DEFECT = {
  one: 'Both domain-detail handlers called loadDomainMatrix(key), used accountable_human and '
    + 'researched_at from the result, and discarded m.capabilities. The records were loaded into '
    + 'a local variable and thrown away on every request.',
  two: 'buildAgentDomainSnapshot did the same: it takes the matrix as an input, derives its '
    + 'authority list from it, and never published the records themselves.',
  three: 'Meanwhile agentDomainSnapshot.ts told every Command Center page that its capability '
    + 'source was GET /api/admin/agent-domains/<domain>, and the builder story told them the '
    + 'snapshot carries the data for all six panels. Both were promises the platform published '
    + 'and did not keep.',
  hole: 'release_behaviour[] appeared in NO HTTP response anywhere in the platform. It is read in '
    + 'nine service modules and was exposed by none, so panel 4 had no source at all — '
    + 'authenticated or otherwise.',
};

/** The five headline numbers, all read out of the production container. */
const KPI = {
  capabilities: 448,
  rungs: 974,
  leaked: 0,
  newTests: 71,
  mutationsCaught: 12,
  mutationsRun: 12,
};

/** Capabilities and per-rung entries now reachable, by domain. Measured at main. */
const DOMAINS = [
  ['executive', 89, 116],
  ['marketing', 64, 177],
  ['admissions', 51, 143],
  ['platform', 49, 83],
  ['curriculum', 38, 109],
  ['learner_success', 37, 72],
  ['internship', 35, 65],
  ['sales', 32, 85],
  ['website', 28, 57],
  ['product_experience', 25, 67],
];

/** The shipping ladder, never collapsed into "done". */
const LADDER = [
  ['Built', true, 'One projection module, both handlers, the snapshot'],
  ['Tested', true, '71 new tests; 46,034 backend tests pass'],
  ['Merged', true, `PR #${PR}, all 10 CI checks green`],
  ['Deployed', true, 'Image built 11:43Z, container up 11:52Z'],
  ['Production verified', true, 'Measured inside the running container'],
];

/** What was checked in production, and what came back. */
const VERIFIED = [
  ['Domains projected', '10', true],
  ['Capabilities projected', '448', true],
  ['Per-rung release_behaviour entries', '974', true],
  ['Keys outside the allow-list', 'NONE', true],
  ['Mihret’s domain (product_experience)', '25 of 25 rows, file order preserved', true],
  ['Snapshot capabilities', '25 rows', true],
  ['sources.capabilities', 'now the -mine route she can reach', true],
  ['Clock key added to the snapshot', 'none', true],
  ['Byte-identical on rebuild', 'yes, the sync guarantee holds', true],
  ['Both endpoints', '401, alive and still guarded', true],
  ['Boot or schema errors', 'none', true],
];

/** The design decisions worth arguing with, each with the reason it went that way. */
const DECISIONS = [
  {
    title: 'An allow-list, never a spread',
    body: 'CapabilityRecord ends in readonly [extra: string]: unknown, so a spread would publish '
      + 'whatever a researcher put in a JSON file, to every caller, forever. One extra is '
      + 'specifically dangerous: current_approved_autonomy exists in two of the ten files and '
      + 'coverageMatrix.ts exists in part to stop it being read as an approval. Nine fields are '
      + 'declared, frozen, and asserted against all 448 real records.',
  },
  {
    title: 'No default limit, deliberately',
    body: 'The ticket asked for a limit; it got an optional one. Panel 2 is one row per '
      + 'capability, so a default cap would silently make a builder’s own inventory wrong '
      + 'while looking complete. Measured: the largest whole-domain projection is marketing at '
      + '61.5 KB, because the allow-list already drops 83 to 87 per cent of the raw file.',
  },
  {
    title: 'Two orders in one file, disagreeing on purpose',
    body: 'Panel 2 requires record order; the snapshot’s authority list sorts by '
      + 'capability_id. The two arrays do not line up positionally, so a page joining them by '
      + 'index would mis-attribute every row past the first difference. Join on capability_id. '
      + 'Both orders are pinned by a test.',
  },
  {
    title: 'A second defect, fixed on the way',
    body: 'sources.capabilities named a program-gated route while builders hold dashboard, so the '
      + 'field claiming to be their capability source named the exact endpoint that refused them. '
      + 'That is the 403 Kalkidan Bezabeh reported on 5 Nov. It now names the -mine twin.',
  },
];

/** BREAK list. A check that passes with the code broken proves nothing. */
const BREAKS = [
  ['Removed capabilities from the program handler', '6 failures'],
  ['Removed it from the -mine handler', '6 failures'],
  ['Made the projection a raw spread', '18 failures'],
  ['Sorted the projection by capability_id', '7 failures'],
  ['Dropped the negative-limit clamp', '1 failure, exactly the test written for it'],
  ['human_decision truthy instead of === true', '1 failure, exactly the test written for it'],
  ['Removed capabilities from the snapshot', '9 failures'],
  ['Pointed sources.capabilities back at the program route', '2 failures'],
  ['A gap becoming undefined instead of null', '3 failures'],
  ['Dropped a field but kept it in the allow-list', '5 failures'],
  ['Capped the snapshot at 10 records', '1 failure, exactly the test written for it'],
  ['Passed release_behaviour entries through unprojected', '5 failures'],
];

/** Stated plainly, because a closed ticket with an overstated artifact is the worse outcome. */
const NOT_ESTABLISHED = [
  'No frontend. Nothing consumes the new fields yet; the builders’ Command Centers live in '
    + 'their own repositories. This makes their criteria satisfiable, it does not satisfy them.',
  'A builder sees the new snapshot fields on their next document sync, not at the moment of '
    + 'deploy.',
  'The dataset scope recorded by AF11 and Phase 2b is still not enforced at runtime by anything. '
    + 'Unchanged by this ticket, and still the next phase.',
  'The capability counts moved from 444 to 448 between the ticket being written and this build, '
    + 'because research files changed under us. The tests were written as floors rather than '
    + 'exact counts for that reason.',
];

/** A flake found while running the gates, reported rather than folded in. */
const FLAKE = 'watcherRetirement.test.ts fails in roughly 1 full backend run in 3, passes 27 of 27 '
  + 'in isolation, and touches nothing this ticket edits. Another session’s file and a '
  + 'different ticket. It will redden CI intermittently for everyone until it is fixed.';

module.exports = {
  TICKET, PR, MERGED_ON, MERGE_SHA, ASKED, DELIVERED, HEADLINE, REPORTERS, DEFECT, KPI,
  DOMAINS, LADDER, VERIFIED, DECISIONS, BREAKS, NOT_ESTABLISHED, FLAKE,
};
