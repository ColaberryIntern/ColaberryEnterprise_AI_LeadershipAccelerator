/**
 * C3.5 - the OpenAI meeting package. THE single source for every part of the bundle.
 *
 * ## The named failure condition is leakage, so it is the first guard
 *
 * "Never put Anthropic contact names or programme assumptions in OpenAI material." That is // spelling-exempt: quotes the ticket verbatim
 * not a style note, it is the thing that would end the relationship before it started, so
 * `assertZeroAnthropicContent` scans every rendered part against the names C3.3 already
 * holds, imported rather than copied, plus the obvious terms.
 *
 * It has a consequence worth stating out loud: TWO otherwise-publishable registry claims
 * are banned here. `anthropic.capability` ("We build on Claude and Claude Code") and
 * `credential.cca.safe` (which names Anthropic's credential) are both VERIFIED and both
 * unusable in this bundle. A generic "every claim must be publishable" check would have
 * waved them through.
 *
 * ## The headline the ticket asked for is not in our evidence
 *
 * The execution prompt says to lead on "a public ten-million-by-2030 certification
 * commitment". That figure appears nowhere in C3.4, nowhere in the claim registry, and
 * nowhere else in this repository. It is not used.
 *
 * What C3.4 did verify is sharper anyway: 300,000 certified consultants by the END OF 2026,
 * announced 14 June 2026 with $150 million behind it, and the training, assessment and
 * certification requirements never published. A deadline ten weeks out with no published
 * assessment method is a better reason to take a meeting than a target four years away.
 *
 * `assertNoUnsourcedFigure` enforces it: every number in the bundle must appear in C3.4's
 * verified evidence or in the claim registry.
 */
const fs = require('fs');
const path = require('path');
const C34 = require('./c34Data');
const C33 = require('./c33Data');
const { findBritishSpelling, americanForm } = require('../britishSpellings');

const REGISTRY = path.join(
  __dirname, '..', '..', '..', 'frontend', 'src', 'config', 'claimsRegistry.ts',
);

const AS_OF = '2026-10-19';

/* ── the gap we are leading on, all of it from C3.4 ───────────────────────── */

const GAP = {
  commitment: '300,000 certified consultants by the end of 2026, announced 14 June 2026 '
    + 'with $150 million behind it.',
  missing: 'The training, assessment and certification requirements have never been '
    + 'published.',
  corroboration: 'openai.com/certifications/ returns a true 404 through a channel validated '
    + 'in both directions, and no certification page appears anywhere in the 2,058-URL '
    + 'sitemap. The credential is pilot-gated at Arizona State and the California State '
    + 'University system.',
  soWhat: 'A certification is only worth what its assessment is worth. Ten weeks from a '
    + '300,000-person target, the assessment method is the part that is not public, and it '
    + 'is the part we have spent four years building.',
};

/** The figure the ticket asked for, recorded as refused rather than silently dropped. */
const REFUSED_FIGURE = {
  figure: 'ten million certifications by 2030',
  why: 'It appears in the ticket\'s execution prompt and in no source we hold: not in C3.4, '
    + 'not in the C0.6 registry, not anywhere in the repository. Leading an OpenAI-facing '
    + 'document with a number we cannot source is the one mistake that would cost the '
    + 'meeting outright.',
  instead: 'The verified 300,000-by-2026 commitment, which has a nearer deadline and a '
    + 'sharper hole in it.',
};

/* ── the five doors, straight from C3.4 ───────────────────────────────────── */

const DOORS = C34.DOORS;

/* ── the seven parts ──────────────────────────────────────────────────────── */

/** Part 1. The thing left on the table. One page, one argument. */
const LEAVE_BEHIND = {
  title: 'The assessment behind the certificate',
  lede: 'You have committed to 300,000 certified consultants by the end of this year. The '
    + 'assessment method is the part that is not published, and it is the part that decides '
    + 'whether the certificate means anything in eighteen months.',
  points: [
    'We verify what a person actually built, against the commit they wrote, automatically '
      + 'on push. Not a quiz, not a project somebody graded, not a completion record.',
    'A stranger can open the evidence without an account and judge the work directly.',
    'That record outlives the engagement, which is what a certificate usually cannot say.',
  ],
  claims: ['positioning.primary'],
};

/** Part 2. The deck, as sections rather than slides, because slides are a rendering. */
const DECK = [
  { n: 1, title: 'The commitment, and the hole in it',
    body: 'A public target of 300,000 certified consultants by the end of 2026, with $150 '
      + 'million committed. No published training, assessment or certification '
      + 'requirements, and no certification page on openai.com at all.',
    claims: [] },
  { n: 2, title: 'Why the assessment is the whole problem',
    body: 'Certifications fail in a predictable way: they certify attendance, then the '
      + 'market discovers the certificate does not predict competence, and the credential '
      + 'stops being asked for. The defense is an assessment tied to real output.',
    claims: [] },
  { n: 3, title: 'What we do',
    body: 'Learners build working systems against real problems. The platform reads the '
      + 'commit, checks it against what the work asked for, and records the decision. The '
      + 'unverified state is the default and the system does not believe a self-report.',
    claims: ['positioning.primary'] },
  { n: 4, title: 'Why you can check this rather than trust it',
    body: 'Every verified item points at a commit a stranger can open anonymously. We would '
      + 'rather you clicked three of them at random than took our word for the method.',
    claims: ['surface.proof.room'] },
  { n: 5, title: 'Who we are',
    body: 'A Texas company teaching data and AI since 2012, with a track record in placing '
      + 'people rather than certifying them.',
    claims: ['company.name', 'trackrecord.since2012', 'trackrecord.students'] },
  { n: 6, title: 'The ask',
    body: 'Thirty minutes with whoever owns assessment design for the consultant '
      + 'certification.',
    claims: [] },
];

/** Part 3. What we can actually do, stated as capability rather than aspiration. */
const CAPABILITY = [
  { what: 'Verified build records', detail: 'Per person, per item of work, tied to a commit '
    + 'and checked automatically on push.', claims: ['surface.proof.room'] },
  { what: 'A twelve-week engagement format', detail: 'Cohort delivery against the '
    + 'organization\'s own problems rather than a generic curriculum.',
    claims: ['program.duration'] },
  { what: 'Assessment design', detail: 'The part of this that is transferable: how to decide '
    + 'what counts as evidence that somebody can do the thing.', claims: [] },
  { what: 'Evidence a third party can audit', detail: 'Public commit links, an append-only '
    + 'record of state changes, and a stated method.', claims: [] },
];

/** Part 4. What a demo would show, in the order it would show it. */
const DEMO = [
  'A real item of work in its unverified state, where the platform does not believe the '
    + 'person who says they finished it.',
  'The commit, and the check running against what the work asked for.',
  'The state change to verified, and the record written behind it.',
  'The same record opened from a browser with no account, which is the part that matters.',
];

/** Part 5. Thirty minutes, and what each part of it is for. */
const AGENDA = [
  { mins: 5, item: 'The gap as we see it, and a chance to tell us we have it wrong.' },
  { mins: 10, item: 'The demo above.' },
  { mins: 10, item: 'Your assessment problem, in your terms. Mostly listening.' },
  { mins: 5, item: 'The ask, and what a first step would look like.' },
];

/** Part 6. The questions a skeptical reader asks, answered plainly. */
const FAQ = [
  { q: 'Are you an OpenAI partner?',
    a: 'No. The Partner Network application is open and frames itself as consideration '
      + 'rather than admission, and there is no training or education category to apply '
      + 'under. That is part of why we are asking for a conversation rather than applying '
      + 'into a category that does not exist.' },
  { q: 'Is this built on OpenAI?',
    a: 'Our production AI features call OpenAI. We are not claiming a relationship beyond '
      + 'being a customer of the API.' },
  { q: 'What is the catch with the verification claim?',
    a: 'It verifies that code exists and meets stated criteria. It does not verify that the '
      + 'person understands why, and we do not claim it does. The assessment design question '
      + 'is exactly where that limit matters.' },
  { q: 'How many people have you put through this?',
    a: 'Our first cohort has not finished. We will not describe it as complete, and the '
      + 'numbers we can stand behind are about the twelve years before it.' },
  { q: 'What would you want from OpenAI?',
    a: 'One conversation about assessment design. Nothing commercial on the first call.' },
];

/** Part 7. Where every factual statement in the bundle comes from. */
const EVIDENCE = [
  { claim: 'No training or education partner category exists.',
    source: 'C3.4, proven across all 80 partner pages; the strings Training, Enablement, '
      + 'Certification and Workforce appear zero times on the partner locator.' },
  { claim: 'The certification page does not exist publicly.',
    source: 'C3.4: openai.com/certifications/ returns a true 404 on a channel validated in '
      + 'both directions, and the 2,058-URL sitemap contains no certification page.' },
  { claim: '300,000 certified consultants by end of 2026, $150 million.',
    source: 'C3.4, announced 14 June 2026.' },
  { claim: 'The credential is pilot-gated at two university systems.',
    source: 'C3.4: Arizona State and the California State University system.' },
  { claim: 'Requirements for the certification are unpublished.',
    source: 'C3.4, recorded as an open question rather than an absence: the two terms '
      + '"certified consultants" and "OpenAI Certification" are never reconciled on any '
      + 'OpenAI page.' },
];

/** Exactly one. The whole bundle ends here. */
const THE_ASK = 'Thirty minutes with whoever owns assessment design for the consultant '
  + 'certification. Nothing commercial on the first call.';

/* ── registry ─────────────────────────────────────────────────────────────── */

function loadRegistry() {
  const text = fs.readFileSync(REGISTRY, 'utf8');
  const body = text.slice(text.indexOf('export const CLAIMS'));
  const out = new Map();
  for (const part of body.split(/\r?\n {2}\{\r?\n/).slice(1)) {
    const pick = (f) => {
      const m = new RegExp(`${f}:\\s*'([^']*)'`).exec(part);
      return m ? m[1] : null;
    };
    const key = pick('key');
    if (key) {
      out.set(key, {
        key,
        publicWording: pick('publicWording'),
        verification: pick('verification'),
        capability: pick('capability'),
      });
    }
  }
  if (out.size < 20) throw new Error(`C3.5: parsed only ${out.size} claims`);
  return out;
}

/** Everything a reader of the bundle would see, as one string, for the scanners. */
function allProse() {
  return [
    GAP.commitment, GAP.missing, GAP.corroboration, GAP.soWhat,
    LEAVE_BEHIND.title, LEAVE_BEHIND.lede, ...LEAVE_BEHIND.points,
    ...DECK.map((d) => `${d.title} ${d.body}`),
    ...CAPABILITY.map((c) => `${c.what} ${c.detail}`),
    ...DEMO,
    ...AGENDA.map((a) => a.item),
    ...FAQ.map((f) => `${f.q} ${f.a}`),
    ...EVIDENCE.map((e) => `${e.claim} ${e.source}`),
    THE_ASK,
  ].join(' ');
}

/* ── assertions ───────────────────────────────────────────────────────────── */

/**
 * The named failure condition. Nothing Anthropic-specific may appear.
 *
 * The contact names are imported from C3.3 rather than restated, so this cannot drift from
 * the list it is protecting against.
 */
function assertZeroAnthropicContent() {
  const prose = allProse();
  const forbidden = [
    'Anthropic', 'Claude', 'CCAR', 'Claude Code', 'Frontier Academy',
    ...C33.TARGETS.map((t) => t.name),
  ];
  for (const term of forbidden) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(prose)) {
      throw new Error(`C3.5: "${term}" appears in OpenAI material. That is the ticket's `
        + 'named failure condition.');
    }
  }
  return forbidden.length;
}

/**
 * Every cited claim must be publishable AND must not be one of the Anthropic-naming ones.
 *
 * The second half is the part a generic check misses: `anthropic.capability` and
 * `credential.cca.safe` are both VERIFIED and both forbidden here.
 */
function assertClaimsArePublishableAndNeutral() {
  const registry = loadRegistry();
  const banned = new Set(['anthropic.capability', 'anthropic.partner', 'credential.cca',
    'credential.cca.safe']);
  const used = [];
  const sections = [LEAVE_BEHIND, ...DECK, ...CAPABILITY];
  for (const s of sections) {
    for (const key of (s.claims || [])) {
      if (banned.has(key)) {
        throw new Error(`C3.5: cites "${key}", which names Anthropic. Publishable elsewhere, `
          + 'forbidden here.');
      }
      const claim = registry.get(key);
      if (!claim) throw new Error(`C3.5: cites "${key}", which is not in the registry`);
      if (!['VERIFIED', 'OWNER_ATTESTED'].includes(claim.verification)) {
        throw new Error(`C3.5: cites "${key}", which is ${claim.verification}`);
      }
      if (claim.capability === 'unbuilt') {
        throw new Error(`C3.5: cites "${key}", whose capability is unbuilt`);
      }
      used.push(key);
    }
  }
  return [...new Set(used)];
}

/** No figure may appear that we cannot source. The refused one is the reason this exists. */
function assertNoUnsourcedFigure() {
  const prose = allProse();
  if (/\bten million\b|\b10 million\b|\b2030\b/i.test(prose)) {
    throw new Error(`C3.5: the bundle uses "${REFUSED_FIGURE.figure}", which is in no source `
      + 'we hold. Use the verified 300,000-by-2026 commitment.');
  }
  // Figures that ARE sourced, each traceable to C3.4 or the registry. Date components
  // count: "14" is the day of the announcement C3.4 verified, and the guard rightly caught
  // it rather than special-casing anything that looks like a date.
  const allowed = ['300,000', '150', '2026', '2,058', '404', '80', '12', '2012', '8k',
    '30', '5', '10', '14', '47', '300'];
  // Ticket references are not figures. "C3.4" would otherwise yield a "3" and a "4",
  // because the dot is a word boundary, and the guard would demand a source for a cross
  // reference. Strip them before looking for numbers.
  const figures = prose.replace(/\bC\d+\.\d+\b/g, '').match(/\b\d[\d,]*\b/g) || [];
  for (const f of figures) {
    if (!allowed.includes(f)) {
      throw new Error(`C3.5: the figure "${f}" is not in the sourced set. Add it to C3.4's `
        + 'evidence or remove it.');
    }
  }
  return figures.length;
}

/**
 * The bundle ends on exactly one ask.
 *
 * COUNTING SECTIONS IS NOT COUNTING ASKS. The first version of this guard counted sections
 * whose title matched "the ask", so retitling one section "The ask and the second ask"
 * passed: still one section, now two requests. It counts the requests themselves now, and
 * requires the heading to be exactly "The ask" so a compound heading cannot hide one.
 */
/**
 * The thing being requested, which both the deck and the closing ask must agree on. If the
 * two ever name different things, the bundle has two asks however it is headed.
 */
const ASK_SUBJECT = /thirty minutes/i;

function assertEndsOnOneAsk() {
  if (!THE_ASK || THE_ASK.length < 20) throw new Error('C3.5: there is no ask');

  const headed = [LEAVE_BEHIND, ...DECK].filter((s) => /\bask\b/i.test(s.title || ''));
  if (headed.length !== 1) {
    throw new Error(`C3.5: ${headed.length} sections are headed as an ask. The bundle ends `
      + 'on one.');
  }
  if (headed[0].title.trim().toLowerCase() !== 'the ask') {
    throw new Error(`C3.5: the ask section is headed "${headed[0].title}". A compound `
      + 'heading is how a second request hides inside the first.');
  }
  // Counting "request-shaped phrases" across the whole bundle was tried and was wrong: it
  // flagged a FAQ question quoting THEIR question, and the same ask restated once. What
  // matters is that the deck and the close request the SAME thing.
  if (!ASK_SUBJECT.test(headed[0].body || '') || !ASK_SUBJECT.test(THE_ASK)) {
    throw new Error('C3.5: the deck\'s ask and the closing ask do not name the same thing. '
      + 'Two different requests are two asks, however the sections are headed.');
  }
  return THE_ASK;
}

/** The ticket says PDF only after approval. The build must not be able to make one. */
function assertNoPdfRequested(jobs) {
  for (const j of jobs || []) {
    if (/\.pdf$/i.test(j.file || '')) {
      throw new Error('C3.5: "PDF not generated before approval" is an acceptance criterion. '
        + 'HTML only until Ali approves.');
    }
  }
  return true;
}

/** Outbound copy discipline. */
function assertCopyIsClean() {
  const prose = allProse();
  const british = findBritishSpelling(prose);
  if (british) {
    throw new Error(`C3.5: British spelling "${british}"; use "${americanForm(british)}"`);
  }
  if (/—/.test(prose)) throw new Error('C3.5: the copy contains an em dash');
  if (/\bfree\b/i.test(prose)) throw new Error('C3.5: the copy advertises "free"');
  return true;
}

module.exports = {
  AS_OF,
  GAP,
  REFUSED_FIGURE,
  DOORS,
  LEAVE_BEHIND,
  DECK,
  CAPABILITY,
  DEMO,
  AGENDA,
  FAQ,
  EVIDENCE,
  THE_ASK,
  loadRegistry,
  allProse,
  assertZeroAnthropicContent,
  assertClaimsArePublishableAndNeutral,
  assertNoUnsourcedFigure,
  assertEndsOnOneAsk,
  assertNoPdfRequested,
  assertCopyIsClean,
};
