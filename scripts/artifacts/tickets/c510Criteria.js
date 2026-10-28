/**
 * C5.10's acceptance criteria, scored, plus the guards that refuse to build a
 * document which has drifted from the page it describes.
 *
 * ## Why these guards read the page and not this folder
 *
 * This artifact's whole claim is that it was measured rather than recalled. Two of its
 * load-bearing statements are about what the source code does NOT do: the participant
 * table carries no provenance, and no copy claims a credential. Both are the kind of
 * statement that silently becomes false when somebody improves the page - and a document
 * that keeps asserting a fixed defect is worse than one that never mentioned it, because
 * it sends the reader looking for a bug that is gone.
 *
 * So assertProvenanceCoverageMatchesTheSource and assertNoCertificationClaim parse
 * SponsorDashboardPage.tsx off disk every build. If the page changes, the build fails
 * and this folder has to be updated to match it.
 */
const fs = require('fs');
const path = require('path');
const D = require('./c510Data');

const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

const PAGE = path.join(
  __dirname, '..', '..', '..', 'frontend', 'src', 'pages', 'SponsorDashboardPage.tsx',
);

/** The page with comments removed, so a guard never matches its own explanation. */
function pageCode() {
  return fs.readFileSync(PAGE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * The four criteria as the ticket words them.
 *
 * Criterion 1 is scored PARTIAL rather than MET or UNMET, because both of the simpler
 * answers mislead. All four provenance classes exist, carry their own glyph and survive
 * grayscale, which is what "visually distinct" asks for. Two of them have no render site
 * in the page, so a reviewer cannot see the distinction by looking at the dashboard.
 */
function criteria() {
  const unreachable = D.PROVENANCE.filter((p) => !p.reachable);
  const bare = D.COVERAGE.filter((c) => !c.badged);

  return [
    {
      id: 1,
      text: 'Measured, target and not-yet-measured visually distinct',
      verdict: unreachable.length === 0 ? 'MET' : 'PARTIAL',
      // Spelled out: a numeral mid-sentence reads as a list marker in a scorecard
      // whose other numbers are all headline figures.
      brief: 'All four defined with their own glyph. ' + WORD[unreachable.length]
        + ' never render, and ' + WORD[bare.length] + ' of ' + WORD[D.COVERAGE.length]
        + ' figure groups carry no marker.',
      detail: 'All four classes are defined with their own glyph, so the distinction '
        + 'survives grayscale, color-blindness and a printed screenshot. '
        + unreachable.length + ' of the 4 have no render site anywhere in the page ('
        + unreachable.map((p) => p.cls).join(', ') + '), so the distinction cannot be '
        + 'photographed. Separately, ' + bare.length + ' of the ' + D.COVERAGE.length
        + ' figure groups carry no marker at all, including the participant table.',
    },
    {
      id: 2,
      text: 'Reuses existing admin components',
      verdict: 'MET',
      brief: 'Badge, Card, Table, Progress, Avatar, Skeleton, Input and Button all come '
        + 'from the shared core. One documented non-reuse.',
      detail: 'Badge, Card, Table, Progress, Avatar, Skeleton, Input and Button all come '
        + 'from colaberry/components/core. The provenance badge is built from the shared '
        + 'Badge rather than a new primitive. One deliberate non-reuse is documented in '
        + 'the page: publicV2/Claim’s <Metric> emits cbv2-* classes that this '
        + 'page’s scoped stylesheet does not define, so importing it would have '
        + 'rendered the honesty badge invisible.',
    },
    {
      id: 3,
      text: 'Route verified mounted',
      verdict: 'MET',
      brief: 'Live at the production URL, and the deployed bundle carries this build.',
      detail: 'Declared at frontend/src/routes/publicRoutes.tsx:56 and answering 200 at '
        + 'https://enterprise.colaberry.ai/sponsor/dashboard on ' + D.OBSERVED + '. The '
        + 'deployed bundle contains the provenance markers, so what is live is this '
        + 'build and not an older one.',
    },
    {
      id: 4,
      text: 'PR open, not merged',
      verdict: 'UNMET',
      brief: 'Merged nineteen minutes after opening, so your review never came first.',
      detail: 'PR #' + D.PR.number + ' merged at ' + D.PR.mergedAt + ', nineteen minutes '
        + 'after opening. The criterion exists to put Ali’s review ahead of the '
        + 'merge, and that did not happen. Recorded rather than reinterpreted.',
    },
  ];
}

/**
 * The page's provenance coverage must still be what this folder says it is.
 *
 * Counts render sites in the live source and compares them with the one COVERAGE entry
 * marked badged. Any new <Provenance> render - a good change - fails the build, because
 * the document's "the table carries no marker" sentence would have gone stale.
 */
function assertProvenanceCoverageMatchesTheSource() {
  const code = pageCode();
  const renders = (code.match(/<Provenance\s+of=/g) || []).length;
  const expected = D.PROVENANCE.reduce((a, p) => a + p.renders, 0);

  if (renders !== expected) {
    throw new Error('The page renders ' + renders + ' provenance badges; this artifact '
      + 'is written against ' + expected + '. If badges were added, the document still '
      + 'claims the participant table and the standouts carry none, which would send a '
      + 'reader hunting a defect that is fixed. Update c510Data COVERAGE and PROVENANCE.');
  }

  const unreachable = D.PROVENANCE.filter((p) => !p.reachable).map((p) => p.cls);
  for (const cls of unreachable) {
    if (new RegExp("<Provenance\\s+of=\\{?'?" + cls).test(code)) {
      throw new Error("'" + cls + "' is described here as having no render site, but the "
        + 'page now renders it. That is the gap closing - update this folder to say so.');
    }
  }
}

/**
 * No copy on the page may claim a credential, in any phrasing.
 *
 * The same rule as the suite's guard, enforced at build time so the artifact cannot be
 * produced while the claim is live. The previous version of the suite's guard named two
 * exact strings and passed while three sentences still said we had certified named
 * employees; this one strips the data-contract tokens and fails on anything left.
 */
function assertNoCertificationClaim() {
  let prose = pageCode();
  for (const token of [/\.certified\b/g, /'certified'/g, /\bcertified\b(?=\s*[:?])/g,
    /\bcert_earned\b/g]) {
    prose = prose.replace(token, ' ');
  }
  const claims = [...prose.matchAll(/[^\n]*certif[^\n]*/gi)].map((m) => m[0].trim());
  if (claims.length > 0) {
    throw new Error('The page claims a credential Colaberry does not issue. CCAR-F is '
      + 'Anthropic’s and we sell preparation for it, so this cannot be filed as '
      + 'done: ' + claims.join(' | '));
  }
}

/**
 * The headline rests on link_accessed being zero. That is only evidence if the event is
 * one the system emits - otherwise a zero means "not instrumented" and the whole
 * takeaway collapses into an unfounded claim about what sponsors have seen.
 */
function assertTheZeroIsEvidenceAndNotSilence() {
  if (!D.PRODUCTION.auditVocabulary.includes('link_accessed')) {
    throw new Error('link_accessed is not in the recorded audit vocabulary, so a count '
      + 'of zero proves nothing about whether a sponsor ever logged in.');
  }
  if (D.PRODUCTION.linkAccessed > 0 || D.PRODUCTION.linkGenerated > 0) {
    throw new Error('A sponsor session now exists in production (generated='
      + D.PRODUCTION.linkGenerated + ', accessed=' + D.PRODUCTION.linkAccessed + '). The '
      + 'takeaway that the measured state has never rendered is no longer true. Re-read '
      + 'the dashboard as a logged-in sponsor before rebuilding this.');
  }
  const summed = D.PRODUCTION.rejectionReasons.reduce((a, r) => a + r.count, 0);
  if (summed !== D.PRODUCTION.linkRejected) {
    throw new Error('The rejection reasons sum to ' + summed + ' but the total is '
      + D.PRODUCTION.linkRejected + '. One of the two was edited without the other.');
  }
}

/**
 * This ticket is about outcomes and has no outcome data, which is the one thing a
 * document like this is tempted to fix by inventing. Nothing here may carry a
 * percentage or a conversion figure.
 */
function assertNoInventedOutcome() {
  const text = JSON.stringify(D);
  const found = [...text.matchAll(/\d+(?:\.\d+)?\s?%/g)].map((m) => m[0]);
  if (found.length > 0) {
    throw new Error('A rate appears in C5.10’s data (' + found.join(', ') + '). No '
      + 'cohort has run, so there is no honest basis for one and it would propagate into '
      + 'every forecast that cites this page.');
  }
}

/** The manifest the ticket asks for must be complete; a blank row is a false tick. */
function assertManifestIsComplete() {
  for (const [field, value] of D.MANIFEST) {
    if (!value || String(value).trim().length < 4) {
      throw new Error('Manifest field "' + field + '" is empty. The ticket asks for the '
        + 'manifest as the artifact; a blank row reads as answered and is not.');
    }
  }
  if (D.MANIFEST.length < 10) {
    throw new Error('The manifest has ' + D.MANIFEST.length + ' rows; the ticket names '
      + 'twelve fields. Say "none" where a field genuinely does not apply.');
  }
}

function assertAllGuards() {
  assertProvenanceCoverageMatchesTheSource();
  assertNoCertificationClaim();
  assertTheZeroIsEvidenceAndNotSilence();
  assertNoInventedOutcome();
  assertManifestIsComplete();
  return criteria().filter((c) => c.verdict === 'MET').length;
}

module.exports = { criteria, assertAllGuards, pageCode };
