/**
 * C5.9 - the guided demo at /demo. THE single source for the artifact.
 *
 * ## It reads the shipped page, it does not describe it
 *
 * Every figure below is parsed out of `frontend/src/config/v2Demo.ts` and
 * `frontend/src/pages/publicV2/DemoV2.tsx` at build time. An artifact that restates what a
 * page contains starts drifting the moment the page changes, and this one is making a
 * safety claim: that no customer data is reachable. A safety claim written from memory is
 * the exact thing nobody should trust.
 *
 * ## The acceptance criterion that is actually a property, not a promise
 *
 * "No real customer data reachable" is enforced by the module graph: the page imports no
 * API client, so it cannot reach the backend at all. `assertPageCannotReachTheBackend`
 * reads the import list from disk and fails if one appears. That is a different and much
 * stronger statement than "we checked and it looked fine".
 *
 * ## The two deliberate departures from the C4.4 storyboard
 *
 * The storyboard has seven real frames and one sample. Here every step is sample, because
 * there is no live tenant behind a public page and showing a real learner's project to the
 * open internet is not something we may do. And no figure from the narration appears: the
 * script cites counts that have no claim-registry row, so they are fine on a call where
 * Ali can date them and not on a public page.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CONFIG = path.join(ROOT, 'frontend', 'src', 'config', 'v2Demo.ts');
const PAGE = path.join(ROOT, 'frontend', 'src', 'pages', 'publicV2', 'DemoV2.tsx');

const AS_OF = '2026-10-22';
const PRODUCTION_URL = 'https://enterprise.colaberry.ai/demo';
const ROUTE = '/demo';

const read = (p) => fs.readFileSync(p, 'utf8');

/** Code with comments stripped, so a guard never matches its own documentation. */
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/* ── parsed from the shipped page ─────────────────────────────────────────── */

/** The steps, read out of the config rather than retyped. */
function steps() {
  const src = read(CONFIG);
  const out = [];
  // Each step is an object literal carrying n, label, screen and meaning.
  const re = /n:\s*(\d+),\s*[\s\S]*?label:\s*'([^']+)',\s*[\s\S]*?screen:\s*'([^']+)',/g;
  let m = re.exec(src);
  while (m) {
    out.push({ n: Number(m[1]), label: m[2], screen: m[3] });
    m = re.exec(src);
  }
  return out.sort((a, b) => a.n - b.n);
}

/** The one sample record the whole walkthrough follows. */
function record() {
  const src = read(CONFIG);
  const pick = (f) => {
    const m = new RegExp(`${f}:\\s*'([^']*)'`).exec(src);
    return m ? m[1] : null;
  };
  const num = (f) => {
    const m = new RegExp(`${f}:\\s*(\\d+)`).exec(src);
    return m ? Number(m[1]) : null;
  };
  return {
    storyRef: pick('storyRef'),
    title: pick('title'),
    commitSha: pick('commitSha'),
    criteriaMet: num('criteriaMet'),
    criteriaTotal: num('criteriaTotal'),
  };
}

/** The limits the page states about itself. */
function limits() {
  const src = read(CONFIG);
  const block = /DEMO_LIMITS[^=]*=\s*\[([\s\S]*?)\];/.exec(src);
  if (!block) return [];
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const DEPARTURES = [
  {
    from: 'The C4.4 storyboard uses seven real frames and one sample.',
    here: 'Every step is sample.',
    why: 'There is no live tenant behind a public page, and showing a real learner\'s '
      + 'project to the open internet is not something we may do. The storyboard\'s own '
      + 'rule survives the change: every screen says what it is.',
  },
  {
    from: 'The storyboard narration quotes counts of stories and projects.',
    here: 'No figures appear at all.',
    why: 'Those counts have no row in the C0.6 claim registry. They are true of our '
      + 'database and fine on a call where Ali can date them. On a public page an '
      + 'unregistered number is a claim we cannot stand behind.',
  },
  {
    from: 'A product demo usually mocks the product interface.',
    here: 'The sample record renders as plainly marked text in a dashed frame.',
    why: 'A faithful fake board is the exact defect the sample-data badge was written '
      + 'against, where sample and live differ only by a badge string.',
  },
];

/* ── assertions ───────────────────────────────────────────────────────────── */

/**
 * The safety claim, enforced by the import list rather than asserted in prose.
 *
 * If the page ever imports an API client, "no customer data is reachable" stops being
 * true and this build stops producing the artifact that says it.
 */
function assertPageCannotReachTheBackend() {
  const code = codeOnly(read(PAGE));
  const imports = [...code.matchAll(/^\s*import\s+[\s\S]*?from\s+'([^']+)';/gm)]
    .map((m) => m[1]);
  const forbidden = imports.filter((i) =>
    /services\/|api|axios|fetchClient|httpClient/i.test(i));
  if (forbidden.length) {
    throw new Error(`C5.9: the demo page imports ${forbidden.join(', ')}. "No real `
      + 'customer data reachable" is a property of the module graph, and that property '
      + 'has just been broken.');
  }
  return imports.length;
}

/**
 * Sample data must be labeled on EVERY step, not once at the top.
 *
 * A single banner scrolls away, and a screenshot of step four would then be
 * indistinguishable from a customer's real board. The criterion is per-screen.
 */
function assertEveryStepIsLabeled() {
  const code = codeOnly(read(PAGE));
  const n = steps().length;

  // COUNTING OCCURRENCES IS THE WRONG CHECK and the first version of this guard did it,
  // then failed on a page that is correct. The badge lives INSIDE the per-step component
  // and is rendered once per step by a map, so it appears once in source and eight times
  // on screen. The structural question is the real one: is the badge inside the unit that
  // repeats?
  // Sliced by index rather than matched with a multiline regex, which is both clearer
  // and immune to the escaping that broke the first attempt at this guard.
  const start = code.indexOf('function Step');
  if (start < 0) {
    throw new Error('C5.9: cannot find the per-step component, so per-step labeling '
      + 'cannot be verified structurally.');
  }
  const next = code.indexOf('\nfunction ', start + 1);
  const stepComponent = code.slice(start, next > 0 ? next : code.length);

  if (!/SampleBadge/.test(stepComponent)) {
    throw new Error('C5.9: the per-step component renders no SampleBadge. The criterion is '
      + 'labeled on EVERY screen, because one banner at the top scrolls away and a '
      + 'screenshot of step four would then be indistinguishable from a real board.');
  }
  if (!/DEMO_STEPS\.map\([\s\S]{0,80}Step/.test(code)) {
    throw new Error('C5.9: the page does not render the Step component across DEMO_STEPS, '
      + 'so the badge inside it is not guaranteed to appear per step.');
  }
  // The standing notice at page level is additional, not a substitute.
  const pageLevel = /SampleBadge/g;
  const total = (code.match(pageLevel) || []).length;
  return { steps: n, badgeInsideStepComponent: true, sampleBadgeUsages: total };
}

/** No unregistered figure may appear. */
function assertNoUnregisteredFigures() {
  // Comments stripped FIRST. The config's own header explains why these counts are
  // excluded, and quotes them in order to do it, so a scan of the raw file flags the
  // documentation that proves the rule is being obeyed. Only shipped strings count.
  const src = codeOnly(read(CONFIG));
  const banned = [/\b345\b/, /\b29 projects\b/i, /\b345 stories\b/i];
  for (const b of banned) {
    if (b.test(src)) {
      throw new Error(`C5.9: the page carries a figure matching ${b} that has no claim-`
        + 'registry row. It is fine on a call and not on a public page.');
    }
  }
  return banned.length;
}

/** The walkthrough must follow one record end to end, or it is a tour. */
function assertOneRecordThroughout() {
  const r = record();
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === '') throw new Error(`C5.9: the sample record has no ${k}`);
  }
  if (r.criteriaMet !== r.criteriaTotal) {
    throw new Error('C5.9: the record ends with criteria unmet, so the walkthrough never '
      + 'reaches the verified state it exists to show.');
  }
  // COUNT REFERENCES, NOT LITERALS. The steps interpolate DEMO_RECORD rather than
  // repeating "STORY-1042", so the literal appears exactly once no matter how many steps
  // use it. Counting the literal measured the weaker pattern and would have passed a page
  // that hard-coded the same string eight times while failing the page that does it right.
  const src = codeOnly(read(CONFIG));
  const refs = (src.match(/DEMO_RECORD\.\w+/g) || []).length;
  if (refs < 8) {
    throw new Error(`C5.9: the sample record is referenced only ${refs} times across the `
      + 'steps. The walkthrough is meant to follow ONE record end to end, which is what '
      + 'makes it an argument rather than a tour.');
  }
  // And the literal must appear once, in the definition, not scattered through the steps.
  const literals = (src.match(new RegExp(r.storyRef, 'g')) || []).length;
  if (literals > 1) {
    throw new Error(`C5.9: "${r.storyRef}" is hard-coded ${literals} times. It should be `
      + 'defined once and referenced, or the steps will drift from the record.');
  }
  return { record: r, refs, literals };
}

/** The page must state its own limits rather than leave them to be discovered. */
function assertLimitsAreStated() {
  const l = limits();
  if (l.length < 3) {
    throw new Error(`C5.9: only ${l.length} limits stated. A demo that does not say what `
      + 'it is not is how a prospect forms an expectation we then fail.');
  }
  if (!l.some((x) => /not screenshots|illustrations/i.test(x))) {
    throw new Error('C5.9: the limits do not say these are illustrations rather than '
      + 'screenshots of a running tenant.');
  }
  if (!l.some((x) => /invented/i.test(x))) {
    throw new Error('C5.9: the limits do not say the sample values are invented.');
  }
  return l;
}

module.exports = {
  AS_OF, PRODUCTION_URL, ROUTE, CONFIG, PAGE,
  steps, record, limits, DEPARTURES,
  assertPageCannotReachTheBackend, assertEveryStepIsLabeled, assertNoUnregisteredFigures,
  assertOneRecordThroughout, assertLimitsAreStated,
};
