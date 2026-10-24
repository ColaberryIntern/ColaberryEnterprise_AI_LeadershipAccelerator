/**
 * C8.6 - the hypothesis board, read out of the shipped register rather than retyped.
 *
 * The five hypotheses and their kill conditions are parsed from hypothesisRegister.ts, so
 * a document claiming five bets cannot survive someone adding a sixth, and a kill
 * condition cannot be softened in the document without being softened in the code.
 */
const fs = require('fs');
const path = require('path');

const REGISTER = path.join(
  __dirname, '..', '..', '..',
  'backend', 'src', 'services', 'commercialization', 'hypothesisRegister.ts',
);

const AS_OF = '23 October 2026';

/**
 * COMMENTS ARE STRIPPED BEFORE PARSING, and the reason is a bug this caught.
 *
 * `readString` collects every quoted literal in a field's span. The register has a line
 * comment between `label` and `registerLabel` that itself quotes the British spelling,
 * written to explain the difference - so the label parsed as
 * "Annual enterprise programprogramme" (spelling-exempt: quotes the bug on purpose) and
 * rendered that doubled word onto the one-pager.
 *
 * This is the same failure as reading prose ABOUT sql as sql, which `bootSchemaCreatable`
 * documents in this repo. A parser that cannot tell code from the commentary on it will
 * eventually report the commentary.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const src = stripComments(fs.readFileSync(REGISTER, 'utf8'));

const BACKSLASH = String.fromCharCode(92);

/** Read concatenated string literals, respecting which quote opened the string. */
function readString(span) {
  let out = '';
  let i = 0;
  while (i < span.length) {
    const ch = span[i];
    if (ch === "'" || ch === '"') {
      i += 1;
      let buf = '';
      while (i < span.length && span[i] !== ch) {
        if (span[i] === BACKSLASH) { buf += span[i + 1]; i += 2; continue; }
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

const FIELDS = ['key', 'label', 'registerLabel', 'whoPays', 'evidenceRequired',
  'killCondition'];

function parseHypotheses() {
  const start = src.indexOf('export const REVENUE_HYPOTHESES');
  const end = src.indexOf('\n];', start);
  if (start === -1 || end === -1) throw new Error('C8.6: REVENUE_HYPOTHESES not found');
  const body = src.slice(start, end);

  return body.split(/\n {2}\{\n/).slice(1).map((raw) => {
    // Prepend the newline the split consumed. Without it the FIRST field of each object
    // has no preceding newline and the field regex misses it - which here is `key`, so
    // every hypothesis parsed keyless. C8.4's parser survived the same bug only because
    // its first field is `n` and `key` sits second.
    const span = `\n${raw.split(/\n {2}\},?/)[0]}`;
    const h = {};
    for (const f of FIELDS) {
      const hit = new RegExp(`\\n {4}${f}:([\\s\\S]*?)(?=\\n {4}[a-zA-Z]+:|$)`).exec(span);
      h[f] = hit ? readString(hit[1]) : null;
    }
    const t = /target: \{ stage: '(\w+)', count: (\d+), by: '([\d-]+)' \}/.exec(span);
    h.target = t ? { stage: t[1], count: Number(t[2]), by: t[3] } : null;
    h.tripwireDates = (span.match(/on: '([\d-]+)'/g) || [])
      .map((s) => s.replace(/on: '|'/g, ''));
    return h;
  });
}

const HYPOTHESES = parseHypotheses();

/** Measured against production on 2026-10-23, by the same queries the funnel runs. */
const OBSERVED = {
  asOf: AS_OF,
  strategicAccounts: 0,
  verdicts: {
    paid_accelerator: { evidence: 0, inFlight: 0, daysLeft: 69 },
    annual_enterprise: { evidence: 0, inFlight: 0, daysLeft: 159 },
    workforce_funded: { evidence: 0, inFlight: 0, daysLeft: 159 },
    higher_education: { evidence: 0, inFlight: 0, daysLeft: 159 },
    partner_delivered: { evidence: 0, inFlight: 0, daysLeft: 250 },
  },
};

/** Why no cycle time is projected. The honest alternative, stated. */
const NO_PROJECTION = {
  tempting: 'Flag a hypothesis as unreachable when the deadline minus the time it takes '
    + 'to produce the evidence goes negative.',
  whyNot: 'That needs a measured sales cycle, and C7.10 established that Colaberry has '
    + 'never run a pilot. No cycle has ever been observed, so the figure would have been '
    + 'invented and would then sit at the root of every kill decision on this board.',
  instead: 'Ask whether anything upstream could still BECOME the required evidence. Zero '
    + 'proposals and zero contacts is a fact rather than a projection.',
};

/** The distinction the board refuses to blur. */
const UNCOUNTABLE_RULE = {
  what: 'A stage with no source yields no verdict, and a tripwire cannot fire on one.',
  why: 'C8.4 established that several funnel stages have no source at all. Reading "no '
    + 'rows" as "no evidence" would retire a bet the instrument never measured, killing '
    + 'a hypothesis for an instrumentation gap rather than a commercial one.',
};

function assertFiveHypothesesParsed() {
  if (HYPOTHESES.length !== 5) {
    throw new Error(`C8.6: parsed ${HYPOTHESES.length} hypotheses, expected 5`);
  }
  for (const h of HYPOTHESES) {
    for (const f of ['key', 'label', 'evidenceRequired', 'killCondition']) {
      if (!h[f]) throw new Error(`C8.6: hypothesis ${h.key || '?'} parsed with no ${f}`);
    }
  }
  return HYPOTHESES.length;
}

/** Every kill condition in the document must carry a date, as the code requires. */
function assertEveryKillConditionIsDated() {
  for (const h of HYPOTHESES) {
    if (!/\b(19|20)\d{2}\b/.test(h.killCondition)) {
      throw new Error(`C8.6: ${h.key} has a kill condition with no date`);
    }
    if (!h.tripwireDates.length) {
      throw new Error(`C8.6: ${h.key} has no dated tripwire`);
    }
  }
  return HYPOTHESES.length;
}

/** The document must not quote a price the C0.1 register left UNKNOWN by design. */
function assertNoPriceIsQuoted() {
  if (/\$\s?\d/.test(JSON.stringify(HYPOTHESES))) {
    throw new Error('C8.6: a hypothesis carries a price; C0.1 leaves every price UNKNOWN');
  }
}

/**
 * No label may contain a doubled word, which is what comment contamination produced
 * before `stripComments` existed ("Annual enterprise programprogramme"). Cheap to check
 * and it names the exact failure rather than a generic one.
 */
function assertNoLabelIsContaminated() {
  for (const h of HYPOTHESES) {
    for (const field of ['label', 'registerLabel', 'whoPays']) {
      const v = h[field] || '';
      // A doubled run of 4+ letters, e.g. "programprogramme" or "costcost".
      if (/([a-z]{4,})\1/i.test(v.replace(/\s+/g, ''))) {
        throw new Error(`C8.6: ${h.key}.${field} looks contaminated by a comment: "${v}"`);
      }
    }
  }
  return HYPOTHESES.length;
}

module.exports = {
  AS_OF, HYPOTHESES, OBSERVED, NO_PROJECTION, UNCOUNTABLE_RULE, stripComments,
  assertFiveHypothesesParsed, assertEveryKillConditionIsDated, assertNoPriceIsQuoted,
  assertNoLabelIsContaminated,
};
