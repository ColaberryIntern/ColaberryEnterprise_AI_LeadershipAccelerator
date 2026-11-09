/**
 * l117Document — DOC 17's self-check, its generated Markdown, and the rendered PDF.
 *
 * THE CHECK THAT MATTERS MOST IS THE ASYMMETRY, ASSERTED IN BOTH DIRECTIONS:
 *
 *     CAPTURED   => names its evidence, and does NOT name what would settle it
 *     NOT_YET    => names what would settle it, and does NOT name a file
 *     BLOCKED    => same as NOT_YET
 *
 * Six of the sixteen captures need an event that has not happened. The failure mode for a source
 * pack is not omission — it is a heading with a plausible path under it, which a reader skimming
 * for evidence cannot distinguish from real evidence. DOC 11 learned this the expensive way: a
 * filename beside an unproven claim is how an unproven claim gets read as proven. So the pack
 * refuses to print a path it does not have, and refuses to print a "settled by" line for
 * something already captured.
 *
 * THE FABRICATED-QUOTE BAN IS DOCUMENT-WIDE, NOT SECTION-SCOPED. The bootstrap says
 * "quotes/feedback only when real", and nobody has watched a Colaberry Live class. An empty
 * Quotes section would satisfy that instruction while leaving a fabricated testimonial free to
 * appear under Metrics or Lessons. So the check scans the whole rendered document for a
 * quotation with an attribution and fails on any hit.
 *
 * THE TEST COUNT IS TAKEN FROM DISK, NOT TYPED. A case study's numbers are exactly what rots
 * first. The suite count is counted at build time and substituted into the prose, and a missing
 * test directory is an ERROR rather than a count of zero — a check that degrades to "found
 * nothing" when its input is absent is worse than no check, because its green is
 * indistinguishable from a real one.
 */
const fs = require('fs');
const path = require('path');
const D = require('./l117Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');
const TEST_DIR = 'backend/src/services/broadcast/__tests__';

/**
 * The capture set, pinned BY NAME as well as by count.
 *
 * ADDED BECAUSE A MUTATION SURVIVED. Pinning only `requiredCount` meant renaming a capture's key
 * changed nothing the check could see: the length still matched and the keys were still unique,
 * so `lessons` could become `lessonsX` silently. Only `quotes` was addressed by name, so only
 * `quotes` was protected. Counting the right number of things is not the same as having the right
 * things, and this list is the difference.
 */
const REQUIRED_KEYS = [
  'problem', 'before', 'decisions', 'screenshots', 'milestones', 'failed', 'defects',
  'security', 'tests', 'studio', 'firstTest', 'firstPublic', 'metrics', 'quotes',
  'diagrams', 'lessons',
];

/** A quotation long enough to be a testimonial, followed by an attribution. */
const ATTRIBUTED_QUOTE = /["“][^"“”]{20,}["”]\s*[—–-]\s*[A-Z][a-z]+/;

/** Counted, never typed. An absent directory throws rather than returning zero. */
function countTestSuites() {
  const dir = path.join(ROOT, TEST_DIR);
  if (!fs.existsSync(dir)) {
    throw new Error(`${TEST_DIR} does not exist, so the suite count cannot be taken. A count of `
      + 'zero would read as a real measurement.');
  }
  const n = fs.readdirSync(dir).filter((f) => /\.test\.(ts|js)$/.test(f)).length;
  if (n === 0) {
    throw new Error(`${TEST_DIR} contains no test files, which contradicts the pack's own `
      + 'claim to hold test evidence');
  }
  return n;
}

function noteFor(c, suites) {
  return c.note.split(D.TEST_COUNT_TOKEN).join(String(suites));
}

function stateBadge(state) {
  if (state === 'CAPTURED') return '**Captured**';
  if (state === 'BLOCKED') return '**Blocked**';
  return '**Not captured yet**';
}

function markdown() {
  const suites = countTestSuites();
  const T = D.TOTALS;
  const L = [];

  L.push(`# ${D.META.title}`);
  L.push('');
  L.push(`${D.META.doc}, ticket ${D.META.ticket}. Generated from `
    + `\`scripts/artifacts/tickets/l117Data.js\` on ${D.META.built} — do not hand-edit, the `
    + 'build compares this file against the data.');
  L.push('');
  L.push('## What this is, and what it is not');
  L.push('');
  L.push(`This is the **source pack**, not the case study. Of the ${T.required} things the `
    + `commissioning document says to capture, **${T.captured} are captured today, `
    + `${T.notYet} need an event that has not happened, and ${T.blocked} is blocked** on `
    + 'something no document can supply.');
  L.push('');
  L.push('A source pack whose gaps are visible is worth more than one that reads as complete, '
    + 'because the gaps are the shooting list for the day the first class airs. The headings '
    + 'below are therefore kept in the commissioning order even where they are empty, and an '
    + 'empty one says what would fill it.');
  L.push('');
  L.push('**This pack names a file only where the evidence exists.** An uncaptured item names '
    + 'what would settle it and deliberately names no path, because a filename under a heading '
    + 'reads as proof to anyone skimming.');
  L.push('');
  L.push(`It feeds ${D.META.feeds}`);
  L.push('');
  L.push('### Status at a glance');
  L.push('');
  L.push('| # | Capture | Status |');
  L.push('|---|---|---|');
  D.CAPTURES.forEach((c, i) => {
    L.push(`| ${i + 1} | ${c.match} | ${stateBadge(c.state)} |`);
  });
  L.push('');
  L.push('---');
  L.push('');

  D.CAPTURES.forEach((c) => {
    L.push(`## ${c.match}`);
    L.push('');
    L.push(`${stateBadge(c.state)} — ${D.STATES[c.state]}`);
    L.push('');
    L.push(noteFor(c, suites));
    L.push('');
    if (c.state === 'CAPTURED') {
      L.push('**Evidence:**');
      c.evidence.forEach((e) => L.push(`- \`${e}\``));
    } else {
      L.push(`**What would settle it:** ${c.settledBy}`);
    }
    L.push('');
  });

  L.push('---');
  L.push('');
  L.push(`*State claims checked on ${D.META.stateCheckedOn}. An airing is an event version `
    + 'control cannot show, so the absence of a record is reported as what was checked rather '
    + 'than as proof that nothing aired.*');
  L.push('');
  return L.join('\n');
}

function selfCheck() {
  // STRUCTURE IS VALIDATED BEFORE ANYTHING IS RENDERED, DELIBERATELY. An earlier version called
  // markdown() on the first line, so malformed data died inside the renderer with "cannot read
  // properties of undefined" — three separate mutations were "caught" that way, which stops the
  // build but says nothing useful. Nothing renders until the shape is sound.

  // 1. THE CONTRACT, AS TRANSCRIBED FROM THE BOOTSTRAP: the right number, and the right ones.
  if (D.CAPTURES.length !== D.requiredCount) {
    throw new Error(`${D.CAPTURES.length} captures, the bootstrap list has ${D.requiredCount}. `
      + 'A dropped bullet must fail the build, not shrink the contract.');
  }
  const keys = D.CAPTURES.map((c) => c.key);
  if (new Set(keys).size !== keys.length) throw new Error('duplicate capture key');
  REQUIRED_KEYS.forEach((k) => {
    if (!keys.includes(k)) {
      throw new Error(`capture "${k}" is missing from the pack. The bootstrap list is pinned by `
        + 'name, not only by count, because the right number of captures is not the same as the '
        + 'right captures.');
    }
  });
  keys.forEach((k) => {
    if (!REQUIRED_KEYS.includes(k)) {
      throw new Error(`capture "${k}" is not one the bootstrap asks for, so the pack and its `
        + 'contract have come apart');
    }
  });

  D.CAPTURES.forEach((c) => {
    if (!D.STATES[c.state]) throw new Error(`capture "${c.key}" has unknown state ${c.state}`);
    if (!c.bullet || !c.bullet.trim()) throw new Error(`capture ${c.key} lost its source text`);
    if (!c.note || c.note.length < 120) {
      throw new Error(`capture "${c.key}" has no substantive note (${(c.note || '').length} `
        + 'chars). A heading with nothing under it reads as addressed.');
    }

    // 2. THE ASYMMETRY, BOTH WAYS.
    const hasEvidence = Array.isArray(c.evidence) && c.evidence.length > 0;
    const hasSettled = typeof c.settledBy === 'string' && c.settledBy.length > 0;

    if (c.state === 'CAPTURED') {
      if (!hasEvidence) {
        throw new Error(`capture "${c.key}" is CAPTURED but names no evidence`);
      }
      if (hasSettled) {
        throw new Error(`capture "${c.key}" is CAPTURED yet also says what would settle it, `
          + 'which means its state and its content disagree');
      }
    } else {
      if (!hasSettled || c.settledBy.length < 40) {
        throw new Error(`capture "${c.key}" is ${c.state} but does not say what would settle it`);
      }
      if (hasEvidence) {
        throw new Error(`capture "${c.key}" is ${c.state} yet names ${c.evidence.length} `
          + 'evidence path(s). An uncaptured item must not name a file — that is exactly how an '
          + 'unproven claim gets read as a proven one.');
      }
    }
  });

  // 3. EVERY EVIDENCE PATH EXISTS.
  let checked = 0;
  D.CAPTURES.forEach((c) => {
    (c.evidence || []).forEach((p) => {
      if (!fs.existsSync(path.join(ROOT, p))) {
        throw new Error(`capture "${c.key}" cites a path that does not exist: ${p}`);
      }
      checked += 1;
    });
  });
  if (checked !== D.TOTALS.evidencePaths) {
    throw new Error(`stat'ed ${checked} evidence paths, data declares ${D.TOTALS.evidencePaths}`);
  }

  // 4. THE PACK MUST SHOW CONTRAST. All-captured or all-empty both mean the states are not real.
  if (D.TOTALS.captured === 0) throw new Error('nothing is captured, so this is not a source pack');
  if (D.TOTALS.notYet + D.TOTALS.blocked === 0) {
    throw new Error('every capture is marked captured. Six of these require an event that has '
      + 'not happened, so a clean sheet means the states stopped being measured.');
  }

  // The shape is sound, so rendering is safe from here on.
  const md = markdown();
  const suites = countTestSuites();
  D.CAPTURES.forEach((c) => {
    if (!md.includes(`## ${c.match}`)) {
      throw new Error(`bootstrap bullet "${c.bullet}" has no heading in the document`);
    }
  });

  // 5. QUOTES: EMPTY BY INSTRUCTION, AND NOT SMUGGLED IN ELSEWHERE.
  const quotes = D.CAPTURES.find((c) => c.key === 'quotes');
  if (!quotes) throw new Error('the quotes capture is missing');
  if (quotes.state === 'CAPTURED') {
    throw new Error('the quotes capture is marked CAPTURED. The bootstrap says "only when '
      + 'real", and no one has watched a Colaberry Live class — a real quote requires a real '
      + 'viewer, so this would be fabricated.');
  }
  const q = md.match(ATTRIBUTED_QUOTE);
  if (q) {
    throw new Error(`the document contains an attributed quotation (${q[0].slice(0, 60)}...). `
      + 'Quotes are permitted only when real, and nobody has watched a class yet.');
  }

  // 6. THE COUNTED FIGURE IS SUBSTITUTED AND PRESENT.
  if (md.includes(D.TEST_COUNT_TOKEN)) {
    throw new Error('the test-count token was not substituted, so the pack ships a placeholder');
  }
  if (!md.includes(`${suites} broadcast test suites`)) {
    throw new Error(`the counted suite total (${suites}) does not appear in the document, so `
      + 'the figure is no longer tied to what is on disk');
  }

  // 7. THE HEADLINE COUNTS ARE THE DERIVED ONES.
  const T = D.TOTALS;
  if (T.captured + T.notYet + T.blocked !== T.required) {
    throw new Error('the state totals do not add up to the required count');
  }
  if (!md.includes(`**${T.captured} are captured today`)) {
    throw new Error('the summary does not carry the derived captured count');
  }

  // 8. GENERATED, NOT HAND-WRITTEN.
  const onDisk = path.join(ROOT, D.META.file);
  if (fs.existsSync(onDisk)) {
    const actual = fs.readFileSync(onDisk, 'utf8').replace(/\r\n/g, '\n');
    if (actual.trim() !== md.trim()) {
      throw new Error(`${D.META.file} differs from what l117Data.js renders. The document is `
        + 'generated; edit the data module, not the file.');
    }
  }

  return {
    required: T.required,
    captured: T.captured,
    notYet: T.notYet,
    blocked: T.blocked,
    evidencePaths: checked,
    testSuites: suites,
    bytes: Buffer.byteLength(md, 'utf8'),
  };
}

function html() {
  const suites = countTestSuites();
  const T = D.TOTALS;

  const rows = D.CAPTURES.map((c, i) => {
    const cls = c.state === 'CAPTURED' ? 'ok' : (c.state === 'BLOCKED' ? 'bad' : 'warn');
    return `<tr><td>${i + 1}</td><td>${esc(c.match)}</td>`
      + `<td class="${cls}">${esc(D.STATES[c.state])}</td></tr>`;
  }).join('');

  const sections = D.CAPTURES.map((c) => {
    const body = esc(noteFor(c, suites))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>');
    const tail = c.state === 'CAPTURED'
      ? `<p class="ev"><strong>Evidence:</strong> ${c.evidence.map((e) => `<code>${esc(e)}</code>`).join(' · ')}</p>`
      : `<p class="ev"><strong>What would settle it:</strong> ${esc(c.settledBy)}</p>`;
    const cls = c.state === 'CAPTURED' ? 'ok' : (c.state === 'BLOCKED' ? 'bad' : 'warn');
    return `<h2>${esc(c.match)} <span class="tag ${cls}">${esc(c.state)}</span></h2>`
      + `<p>${body}</p>${tail}`;
  }).join('\n');

  const body = `
    <h1>${esc(D.META.title)}</h1>
    <p class="meta">${esc(D.META.doc)} · ticket ${esc(D.META.ticket)} · ${esc(D.META.built)}</p>
    <div class="callout"><strong>This is the source pack, not the case study.</strong>
      ${T.captured} of ${T.required} captures are in the repository today; ${T.notYet} need an
      event that has not happened and ${T.blocked} is blocked. An uncaptured item names what
      would settle it and deliberately names no file.</div>
    <h2>Status at a glance</h2>
    <table><tr><th>#</th><th>Capture</th><th>Status</th></tr>${rows}</table>
    ${sections}
    <p class="meta">State claims checked on ${esc(D.META.stateCheckedOn)}.</p>`;

  const css = `${baseCss}
    .callout{border:1px solid ${TOKENS.border};border-left:4px solid ${TOKENS.accent};
      background:#fbfcfe;padding:12px 16px;margin:0 0 18px;border-radius:4px}
    .meta{color:${TOKENS.muted};font-size:12px}
    table{border-collapse:collapse;width:100%;margin:12px 0}
    th,td{border:1px solid ${TOKENS.border};padding:5px 8px;text-align:left;font-size:12px}
    code{background:#f3f5f9;padding:1px 4px;border-radius:3px;font-size:11px}
    .ev{font-size:12px;color:${TOKENS.muted}}
    .tag{font-size:10px;padding:2px 6px;border-radius:3px;vertical-align:middle}
    .ok{color:#2f7d32}.warn{color:#8a5200}.bad{color:#b3261e}
    h2{margin-top:20px}`;

  return htmlDoc({ title: D.META.title, css, body });
}

function write() {
  const out = path.join(ROOT, D.META.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${markdown()}\n`, 'utf8');
  return out;
}

module.exports = { markdown, selfCheck, html, write, countTestSuites };
