/**
 * C8.7 - the pilot-to-case-study integration design.
 *
 * The measure mappings are parsed out of the shipped policy module, so the document
 * cannot describe a mapping the code does not enforce. Everything else here is a fact
 * about the existing engine, each one carrying the file that establishes it.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', '..', '..', 'backend', 'src');
const POLICY = path.join(BACKEND, 'services', 'commercialization', 'pilotCaseStudyPolicy.ts');

const AS_OF = '24 October 2026';

const BACKSLASH = String.fromCharCode(92);

/** Strip comments so prose ABOUT the policy is never parsed as the policy. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const policySrc = stripComments(fs.readFileSync(POLICY, 'utf8'));

function readString(span) {
  let out = '';
  let i = 0;
  while (i < span.length) {
    const ch = span[i];
    if (ch === "'" || ch === '"') {
      i += 1;
      let buf = '';
      while (i < span.length && span[i] !== ch) {
        if (span[i] === BACKSLASH) {
          // ’ and friends are written as escapes in the source.
          if (span[i + 1] === 'u') {
            buf += String.fromCharCode(parseInt(span.slice(i + 2, i + 6), 16));
            i += 6;
            continue;
          }
          buf += span[i + 1];
          i += 2;
          continue;
        }
        buf += span[i];
        i += 1;
      }
      out += buf;
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.trim();
}

/** The five C7.6 measures and how each lands in the engine. */
function parseMappings() {
  const start = policySrc.indexOf('export const MEASURE_MAPPINGS');
  const end = policySrc.indexOf('\n];', start);
  if (start === -1 || end === -1) throw new Error('C8.7: MEASURE_MAPPINGS not found');
  const body = policySrc.slice(start, end);

  return body.split(/\n {2}\{\n/).slice(1).map((raw) => {
    const span = `\n${raw.split(/\n {2}\},?/)[0]}`;
    const m = {};
    for (const f of ['measure', 'attribution', 'why', 'inlineCaveat']) {
      const hit = new RegExp(`\\n {4}${f}:([\\s\\S]*?)(?=\\n {4}[a-zA-Z]+:|$)`).exec(span);
      if (!hit || /^\s*null\s*,?\s*$/.test(hit[1])) { m[f] = null; continue; }
      m[f] = readString(hit[1]) || null;
    }
    const v = /verification: \{ class: '(\w+)', method: '(\w+)' \}/.exec(span);
    m.verification = v ? { class: v[1], method: v[2] } : null;
    m.publishable = /publishable: true/.test(span);
    return m;
  });
}

const MAPPINGS = parseMappings();

/** Facts about the engine, each with the file that establishes it. */
const ENGINE_FACTS = [
  { fact: 'The ladder has five rungs: story_hypothesis, build_record, '
      + 'capability_demonstration, operational_result, impact_case_study.',
    where: 'services/sbp/caseStudyHypothesis.ts' },
  { fact: 'Publishing requires operational_result.',
    where: 'services/caseStudy/caseStudyPublishMaturityRule.ts, PUBLISHABLE_FROM' },
  { fact: 'operational_result is documented UNREACHABLE: it needs an outcome measured '
      + 'through an approved measurement definition, and no measurement-definition '
      + 'concept exists in the codebase.',
    where: 'services/sbp/caseStudyFoundation.ts, OUTCOME_WHY' },
  { fact: 'Maturity is never stored. It is recomputed from evidence on every read, so '
      + 'nothing can be promoted by editing a column.',
    where: 'services/sbp/caseStudyFoundation.ts' },
  { fact: 'The maturity rule is a deliberate no-op when no project foundation resolves, '
      + 'so the pre-existing library is not retroactively refused.',
    where: 'services/caseStudy/caseStudyPublishMaturityRule.ts' },
  { fact: 'Every publish check is a hard block. There is no override, no force flag and '
      + 'no default-allow branch, and the gate returns all blockers at once.',
    where: 'services/caseStudy/caseStudyPublishGate.ts' },
  { fact: 'Naming the customer requires consent true in BOTH the record and the approved '
      + 'snapshot, re-checked on every publish because consent can be withdrawn between '
      + 'two clicks.',
    where: 'services/caseStudy/caseStudyPublishRules.ts, ruleOrganizationConsent' },
  { fact: 'A figure verified by self-attestation is refused outright rather than '
      + 'discounted.',
    where: 'services/caseStudy/caseStudyPublishRules.ts, self_attested_verification' },
  { fact: 'source_type already has an unused "engagement" value, and nothing writes it.',
    where: 'types/caseStudy.ts, CaseStudySourceType' },
  { fact: 'A delivery-to-case-study adapter already exists, with three consent flags and '
      + 'a nine-value fact allowlist. It has zero production callers.',
    where: 'services/delivery/caseStudyAdapter.ts, modules/delivery/caseStudy.ts' },
];

/** Measured against production on 24 October 2026. */
const MEASURED = {
  asOf: AS_OF,
  caseStudies: { total: 20, approved: 13, archived: 6, draft: 1 },
  publications: { rows: 38, distinctStudies: 14, approvedAndPublished: 13, archivedButPublished: 1 },
  naming: { named: 4, namedWithConsent: 4, anonymized: 10, hidden: 6 },
  verificationLogs: { total: 2339, partial: 1624, notVerified: 715, fullyVerified: 0 },
  pilotsRun: 0,
};

/** The trap the design exists to avoid. */
const TRAP = {
  what: 'Setting project_id on an engagement-sourced case study makes it PERMANENTLY '
    + 'unpublishable, which is worse than being blocked.',
  how: 'A non-null project_id, or a cited repository that resolves to a student project, '
    + 'makes the project foundation resolve. That turns the maturity rule from a no-op '
    + 'into an active check demanding operational_result - a rung the computation cannot '
    + 'return, because the measurement-definition concept it needs does not exist.',
  fix: 'Do not set it. An engagement is not a student project, so the honest answer and '
    + 'the safe one are the same answer.',
};

function assertFiveMeasuresParsed() {
  if (MAPPINGS.length !== 5) {
    throw new Error(`C8.7: parsed ${MAPPINGS.length} measures, expected 5`);
  }
  for (const m of MAPPINGS) {
    if (!m.measure || !m.attribution || !m.why) {
      throw new Error(`C8.7: measure ${m.measure || '?'} parsed incomplete`);
    }
  }
  return MAPPINGS.length;
}

/** The document must not describe the declined measure as publishable. */
function assertDocumentDeclinesTheOutcomeMeasure() {
  const declined = MAPPINGS.find((m) => m.attribution === 'declined');
  if (!declined) throw new Error('C8.7: the declined measure did not parse');
  if (declined.publishable || declined.verification) {
    throw new Error('C8.7: the document shows the declined measure as publishable');
  }
  return declined;
}

/** Every engine fact must name the file that establishes it. */
function assertEveryFactIsSourced() {
  for (const f of ENGINE_FACTS) {
    if (!f.where || !/\.ts/.test(f.where)) {
      throw new Error(`C8.7: "${f.fact.slice(0, 40)}..." names no source file`);
    }
  }
  return ENGINE_FACTS.length;
}

module.exports = {
  AS_OF, MAPPINGS, ENGINE_FACTS, MEASURED, TRAP,
  assertFiveMeasuresParsed, assertDocumentDeclinesTheOutcomeMeasure, assertEveryFactIsSourced,
};
