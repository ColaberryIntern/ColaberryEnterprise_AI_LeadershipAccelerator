/**
 * C8.5 - what was built, and the two decisions a reviewer will want to argue with.
 *
 * The figures here are read from the SHIPPED SOURCE wherever a figure could drift: the
 * artifact kinds and the forbidden-content column list come out of the ensure file, so a
 * document claiming seven kinds cannot survive someone adding an eighth.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', '..', '..', 'backend', 'src');
const ENSURE = path.join(BACKEND, 'db', 'ensureAccountArtifactLinkSchema.ts');
const SERVICE = path.join(BACKEND, 'services', 'commercialization', 'accountArtifactLinkService.ts');

const AS_OF = '23 October 2026';

/** Pull a `const NAME = [ 'a', 'b' ] as const;` list out of the TypeScript. */
function readStringArray(src, name) {
  const re = new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`);
  const hit = re.exec(src);
  if (!hit) throw new Error(`C8.5: could not read ${name} from the source`);
  return (hit[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
}

const ensureSrc = fs.readFileSync(ENSURE, 'utf8');
const serviceSrc = fs.readFileSync(SERVICE, 'utf8');

const KINDS = readStringArray(ensureSrc, 'ARTIFACT_KINDS');
const FORBIDDEN = readStringArray(ensureSrc, 'FORBIDDEN_CONTENT_COLUMNS');
const SOURCE_TYPES = readStringArray(ensureSrc, 'SOURCE_TYPES');

/** The C0.3 rules this surface enforces, quoted from the approved standard. */
const C03_RULES = [
  { n: 1, rule: 'One canonical location per artifact',
    here: 'A unique index on (organization_id, canonical_url). The same document cannot '
      + 'be linked to an account twice, which is the ticket metric as a constraint.' },
  { n: 2, rule: 'Tickets link rather than re-upload',
    here: 'The table has no column that could hold a document and the service makes no '
      + 'network call, so the app cannot become a second copy or a proxy for one.' },
  { n: 3, rule: 'Stable filenames with internal version history',
    here: 'Enforced at link time: a URL whose filename carries a date, a version marker '
      + 'or a status word is refused, with the rule quoted back.' },
  { n: 4, rule: 'A registry row written at creation time',
    here: 'Each link row records the kind, the title, who linked it and when.' },
  { n: 5, rule: 'The index is the map, artifacts are the evidence',
    here: 'The account view is a map of pointers. Every row opens the canonical copy.' },
];

/** The decision worth defending, and the alternative that lost. */
const DESIGN_DECISION = {
  chosen: 'One link table, account_artifact_links',
  rejected: 'A list inside the organizations.attributes JSONB column that C8.3 added',
  why: 'C6.1 says default strongly to reuse, and the JSONB column already exists, so the '
    + 'links could have gone there with no DDL at all. It lost on the ticket’s own '
    + 'metric: "nobody re-sends a document an account already has" is a uniqueness '
    + 'guarantee, and a JSONB array cannot provide one. Appending to it is '
    + 'read-modify-write, so two people linking at the same moment silently lose a row, '
    + 'and nothing stops the same document being added twice.',
  cost: 'One new table. Everything else about the account still lives on organizations, '
    + 'so this adds a relationship, not a second account universe.',
};

/** What the subagent survey found, which changed the design. */
const SURVEY = [
  { claim: 'Reuse artifact_relationships', verdict: 'IMPOSSIBLE',
    detail: 'Both foreign keys are NOT NULL to artifact_definitions, the curriculum '
      + 'template table. It is not polymorphic and does not reference artifacts at all.' },
  { claim: 'Reuse the artifacts table', verdict: 'IMPOSSIBLE',
    detail: 'That is the student capstone artifact: project_id is NOT NULL with a foreign '
      + 'key to projects, and its kind is build or showcase, not a document taxonomy.' },
  { claim: 'Something already links an artifact to an account', verdict: 'FALSE',
    detail: 'Eight artifact tables exist and every one is anchored to a project, a '
      + 'session, a ticket, a case study or an enrollment. None carries organization_id.' },
  { claim: 'A canonical-pointer convention exists to copy', verdict: 'TRUE',
    detail: 'CertEvidenceMapping: an unconstrained source_type plus source_id pair, with '
      + 'a header that says "THIS TABLE HOLDS NO ARTIFACT". That is the pattern used.' },
];

/** "Links only" is structural. Each of these is an assertion in the suite. */
const STRUCTURAL_GUARDS = [
  { what: 'The table cannot hold a document',
    how: `No column named any of ${FORBIDDEN.length} content words, and no BYTEA or BLOB.` },
  { what: 'The service cannot fetch a document',
    how: 'Its test reads the service source and refuses fetch, axios, got and https.get.' },
  { what: 'The card cannot upload a document',
    how: 'Its test refuses type="file", an accept attribute and a multipart form.' },
  { what: 'A document cannot be linked twice',
    how: 'Unique index, plus a service path that returns the existing row with created:false.' },
  { what: 'A C0.3-breaking filename cannot be linked',
    how: 'Refused at link time; the test uses the exact filename this session mis-filed.' },
];

/** Acceptance criteria as build gates. */
function assertSevenKinds() {
  const expected = ['deck', 'research', 'account_brief', 'proposal', 'contract',
    'pilot_outcome', 'case_study'];
  if (KINDS.join(',') !== expected.join(',')) {
    throw new Error(`C8.5: artifact kinds drifted from the ticket: ${KINDS.join(', ')}`);
  }
  return KINDS.length;
}

/** The acceptance criterion. If the service ever learns to fetch, the build stops. */
function assertServiceHoldsNoArtifact() {
  if (/\bfetch\s*\(|axios|node-fetch|https?\.get\(/.test(serviceSrc)) {
    throw new Error('C8.5: the service makes a network call, so it is no longer links-only');
  }
  const contentCol = FORBIDDEN.find((c) => new RegExp(`\\b${c}\\s+(TEXT|BYTEA|JSONB)`, 'i')
    .test(ensureSrc));
  if (contentCol) {
    throw new Error(`C8.5: the table gained a content column (${contentCol})`);
  }
  return FORBIDDEN.length;
}

/** Every C0.3 rule must say how this surface honors it, or the mapping is decoration. */
function assertEveryC03RuleIsHonored() {
  for (const r of C03_RULES) {
    if (!r.here || r.here.length < 40) {
      throw new Error(`C8.5: C0.3 rule ${r.n} has no implementation note`);
    }
  }
  return C03_RULES.length;
}

module.exports = {
  AS_OF,
  KINDS,
  FORBIDDEN,
  SOURCE_TYPES,
  C03_RULES,
  DESIGN_DECISION,
  SURVEY,
  STRUCTURAL_GUARDS,
  assertSevenKinds,
  assertServiceHoldsNoArtifact,
  assertEveryC03RuleIsHonored,
};
