/**
 * C8.4 - the funnel stage definitions, READ OUT OF THE CODE rather than restated.
 *
 * The ticket's point is that the definitions must not be re-invented, and the surest way
 * to re-invent them is to type them twice. So this parses `funnelStages.ts`, which is
 * what the service actually computes from. A document that disagrees with the running
 * code is worse than no document, because it is believed.
 *
 * The parse is asserted, not trusted: if it finds the wrong number of stages, or a stage
 * missing a field, the build fails rather than rendering a short document that looks
 * complete.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(
  __dirname, '..', '..', '..',
  'backend', 'src', 'services', 'commercialization', 'funnelStages.ts',
);

const AS_OF = '23 October 2026';

/**
 * Read the string literals in a span and concatenate them.
 *
 * A scanner rather than a regex because the data mixes quote styles deliberately:
 * `"interaction_outcomes.outcome = 'sent' ..."` is one double-quoted string containing
 * single quotes, and a regex that matched every quoted run would split it into three.
 */
function readConcatenatedString(span) {
  let out = '';
  let i = 0;
  while (i < span.length) {
    const ch = span[i];
    if (ch === "'" || ch === '"') {
      i += 1;
      let buf = '';
      while (i < span.length && span[i] !== ch) {
        if (span[i] === '\\') { buf += span[i + 1]; i += 2; continue; }
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

const FIELDS = ['key', 'label', 'definition', 'trigger', 'source', 'evidence',
  'rationale', 'excludes'];

/** Split the FUNNEL_STAGES array into one span per object literal. */
function stageSpans(src) {
  const start = src.indexOf('export const FUNNEL_STAGES');
  if (start === -1) throw new Error('C8.4: FUNNEL_STAGES not found in funnelStages.ts');
  const end = src.indexOf('\n];', start);
  if (end === -1) throw new Error('C8.4: could not find the end of FUNNEL_STAGES');
  const body = src.slice(start, end);

  // Each stage begins at a line that is exactly "  {" inside the array.
  return body.split(/\n {2}\{\n/).slice(1).map((s) => s.split(/\n {2}\},?/)[0]);
}

function parseStages() {
  const src = fs.readFileSync(SOURCE, 'utf8');
  return stageSpans(src).map((span, idx) => {
    const stage = { n: idx + 1 };
    for (const f of FIELDS) {
      const re = new RegExp(`\\n {4}${f}:([\\s\\S]*?)(?=\\n {4}[a-zA-Z]+:|$)`);
      const hit = re.exec(span);
      if (!hit) { stage[f] = null; continue; }
      if (/^\s*null\s*,?\s*$/.test(hit[1])) { stage[f] = null; continue; }
      stage[f] = readConcatenatedString(hit[1]) || null;
    }
    return stage;
  });
}

const STAGES = parseStages();

/**
 * The parse found every stage and every required field.
 *
 * Without this the failure mode is silent: a change to the TypeScript formatting makes
 * the regex miss, and the document renders with six stages or with empty rationales, and
 * looks fine.
 */
function assertParseIsComplete() {
  if (STAGES.length !== 10) {
    throw new Error(`C8.4: parsed ${STAGES.length} stages from funnelStages.ts, expected 10`);
  }
  const required = ['key', 'label', 'definition', 'trigger', 'evidence', 'rationale'];
  for (const s of STAGES) {
    for (const f of required) {
      if (!s[f]) throw new Error(`C8.4: stage ${s.key || s.n} parsed with no ${f}`);
    }
  }
  return STAGES.length;
}

/** The document must carry the same exclusion the code enforces. */
function assertOpensAreExcludedInTheDocument() {
  const engaged = STAGES.find((s) => s.key === 'engaged');
  if (!engaged) throw new Error('C8.4: the engaged stage did not parse');
  if (/opened|clicked/.test(engaged.trigger)) {
    throw new Error('C8.4: the parsed engaged trigger counts an open or a click');
  }
  if (!engaged.excludes || !/13,892/.test(engaged.excludes)) {
    throw new Error('C8.4: the document must state the number the looser rule would give');
  }
  return engaged;
}

/** A stage with no source must read as uncounted, never as zero. */
function assertAbsentStagesSaySo() {
  const absent = STAGES.filter((s) => s.evidence === 'absent');
  if (absent.length !== 2) {
    throw new Error(`C8.4: expected 2 stages with no source, parsed ${absent.length}`);
  }
  for (const s of absent) {
    if (!/^NONE/.test(s.trigger)) {
      throw new Error(`C8.4: ${s.key} has no source but its trigger does not say NONE`);
    }
  }
  return absent.map((s) => s.label);
}

/** Counts used in the document, each traceable to the 2026-10-23 production probe. */
const MEASURED = {
  asOf: AS_OF,
  outcomes: [
    { channel: 'email', sent: 40672, opened: 13892, clicked: 5837, bounced: 440, replied: 15 },
    { channel: 'sms', sent: 7672, replied: 10 },
    { channel: 'voice', sent: 23, answered: 22, noAnswer: 407, voicemail: 114 },
    { channel: 'system', sent: 557 },
  ],
  bookedMeetings: 9,
  strategicAccounts: 0,
  organizationsByType: { enterprise_customer: 7, client: 2 },
  engagedUnderStrictRule: 47,
  engagedUnderLooseRule: 19729,
};

module.exports = {
  AS_OF,
  SOURCE,
  STAGES,
  MEASURED,
  assertParseIsComplete,
  assertOpensAreExcludedInTheDocument,
  assertAbsentStagesSaySo,
  // exported for its own test
  readConcatenatedString,
};
