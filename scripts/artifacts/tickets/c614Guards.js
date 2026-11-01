/**
 * C6.14 - the acceptance criteria as assertions over the rendered letters.
 *
 * The ticket's criteria are checkable, so they are checked. "No variant uses the word free,
 * claims a certification, or quotes an unregistered figure" is a build failure here when it is
 * false, rather than a sentence in a review comment that nobody re-runs.
 *
 * ## The guard that earns its keep
 *
 * `assertNoUnregisteredFigure` pulls every numeral out of every letter and demands that each one
 * be either a measured figure whose registry row is not null, or an allowlisted non-claim number
 * such as a source date. That is the mechanical form of CLM-029, and it is what catches the
 * failure this ticket was most likely to ship: the 30-day execution figure is MEASURED and TRUE
 * and still has no row, because CLM-006 is defined on seven days. A guard that only looked for
 * made-up numbers would have passed it.
 *
 * ## The guard that exists because a decision aged badly
 *
 * `assertDisqualifiedCompanyGetsNoLetter`. All ten companies were enrolled on 27 October. Ali
 * disqualified CNO Financial Group on 28 October, the day after. Nobody unenrolled it, so
 * production still holds lead 25373 as enrolled and active. The copy must not quietly include a
 * company he removed, and the gap in the campaign record is reported rather than patched.
 */
const D = require('./c614Data');
const C = require('./c614Copy');
const { findAllBritishSpellings } = require('../britishSpellings');

/** Numbers a letter may carry that are not claims: source dates, years, and nothing else. */
const NON_CLAIM_NUMBERS = new Set([
  '1',    // 1 November, the measurement date
  '27',   // 27 October, the day every careers board was read
  '24',   // 24 February, Commerce Bancshares shareholder letter
  '22',   // 22 January, Cass results release; 22 April, Eleos announcement
  '19',   // 19 February, Employers Holdings results release
  '14',   // 14 April, Tennant and Brain Corp announcement
  '15',   // 15 June, Pearl announcement
  '10',   // Form 10-K
  '3',    // Q3 FY2026
  '2025', '2026', // fiscal years named in the sources
  '200', '75075', // the signature's street address
]);

/** Every letter that will be built, as flat text, with a label for the error message. */
function allLetters() {
  const out = [];
  for (const v of C.VARIANTS) {
    const names = Object.keys(C.COMPANIES)
      .filter((n) => (v.id === 'A' ? !!C.COMPANIES[n].req : true));
    for (const n of names) {
      const l = C.letter(v, n);
      out.push({ label: `variant ${v.id} / ${n}`, variant: v, company: n,
        subject: l.subject, body: l.paragraphs.join('\n\n') });
    }
  }
  return out;
}

/** CLM-029, mechanically. Every numeral traces to a registry-backed figure or a source date. */
function assertNoUnregisteredFigure() {
  const allowed = new Set(NON_CLAIM_NUMBERS);
  const registered = [];
  for (const [key, m] of Object.entries(D.MEASURED)) {
    if (!m.clm) continue;                       // measured but unusable: deliberately NOT allowed
    allowed.add(String(m.value));
    allowed.add(m.value.toLocaleString('en-US'));
    registered.push(`${key}=${m.value} (${m.clm})`);
  }
  for (const l of allLetters()) {
    const nums = (l.subject + ' ' + l.body).match(/\d[\d,]*/g) || [];
    for (const n of nums) {
      if (!allowed.has(n)) {
        throw new Error(`${l.label} carries the figure "${n}", which no registry row authorizes. `
          + `Registry-backed figures are: ${registered.join(', ')}. If this figure is right, it `
          + 'needs a registry row before it can leave the building (CLM-029).');
      }
    }
  }
  return registered.length;
}

/** The three explicit prohibitions in the ticket's own acceptance criteria. */
function assertProhibitedWordingAbsent() {
  for (const l of allLetters()) {
    const text = (l.subject + ' ' + l.body).toLowerCase();
    if (/\bfree\b/.test(text)) {
      throw new Error(`${l.label} uses the word "free". CLM-027 prohibits it outright and 40 TAC `
        + '807.172(d) is the reason.');
    }
    // The allowed sentence is REMOVED before the check rather than used to excuse the whole
    // letter. Testing "contains certif AND NOT the allowed phrase" reads correctly and is
    // useless: every letter carries the allowed phrase, so the condition can never fire and any
    // other certification claim passes. A mutation test caught that; reading it did not.
    const other = text.replace(/rather than by issuing a\s+certificate/g, '');
    if (/certif/.test(other)) {
      throw new Error(`${l.label} mentions certification in a form other than the no-issuance `
        + 'denial. Colaberry prepares people and verifies what they build; the credential is '
        + 'not ours to award (CLM-026), and naming the programs triggers CLM-025.');
    }
  }
}

/** mandrillPreflight.js hard-fails on each of these, so the copy is written to pass it. */
function assertSendPreflightWouldPass() {
  for (const l of allLetters()) {
    const text = l.subject + ' ' + l.body;
    if (/[—–]/.test(text)) {
      throw new Error(`${l.label} contains an em dash or en dash. validateBeforeSend() hard-fails `
        + 'on both; use a comma, a colon, a spaced hyphen or "and".');
    }
    if (/Ali Muwwakkil/.test(l.body)) {
      throw new Error(`${l.label} names Ali in the body. Only the branded signature may name `
        + 'him; the preflight rejects a duplicate.');
    }
    if (/\n\s*(Best|Thanks|Regards|Sincerely|Cheers)\b/i.test(l.body)) {
      throw new Error(`${l.label} ends with an informal closer. The branded signature is `
        + 'appended at send time and the preflight rejects a double sign-off.');
    }
  }
}

/** The claim C6.13 proved unverifiable from outside. No letter may imply requisition age. */
function assertNoRequisitionAgeClaim() {
  const age = /(open|posted|unfilled|sitting|vacant)[^.]{0,40}(since|for \w+ (days|weeks|months)|\d+ days)/i;
  for (const l of allLetters()) {
    if (age.test(l.body)) {
      throw new Error(`${l.label} implies how long a requisition has been open. Career sites `
        + 'refresh the displayed date: the same Tennant posting read two different dates hours '
        + 'apart. Only the date WE read it is sayable.');
    }
  }
}

/** Lindsay's AI-leadership check came back WATCH, not CLEAR. The sentence is forbidden there. */
function assertWatchVerdictIsRespected() {
  for (const l of allLetters()) {
    if (!/no AI leader in post/.test(l.body)) continue;
    if (!C.COMPANIES[l.company].noAiLeader) {
      throw new Error(`${l.label} asserts no AI leader is in post, but that company's check came `
        + 'back WATCH rather than CLEAR, so the claim is not evidenced.');
    }
  }
}

/**
 * A letter may not tell a company something about itself that its own source does not say.
 * Avista's artifact is a risk-factor disclosure with no target, no budget and no scope, and
 * Lindsay's CEO said in his own words that they are in "very early innings". The default middle
 * paragraph opens "Deciding is the part your company has already done", which is false for
 * both, and the fastest way to lose a reader is to be wrong about their own filing.
 */
function assertNoSourceIsOverstated() {
  for (const l of allLetters()) {
    const over = /already done|you have committed|your commitment/i.test(l.body);
    if (l.company === 'Avista Corporation') {
      if (over) {
        throw new Error('Avista: a risk-factor disclosure is being described as a decision or a '
          + 'commitment. C6.13 records that it must never be called one.');
      }
      if (!/risk disclosure is not a plan/.test(l.body) && l.variant.id === 'B') {
        throw new Error('Avista variant B must name what its source actually is.');
      }
    }
    if (l.company === 'Lindsay Corporation' && over) {
      throw new Error('Lindsay: the CEO said "very early innings". The letter must not tell him '
        + 'the deciding is done.');
    }
  }
}

/** A company Ali removed must not reappear in the copy, however convenient it would be. */
function assertDisqualifiedCompanyGetsNoLetter() {
  for (const name of Object.keys(C.EXCLUDED)) {
    if (C.COMPANIES[name]) {
      throw new Error(`${name} was disqualified on 2026-10-28 and must not carry a letter.`);
    }
  }
  return Object.keys(C.EXCLUDED).length;
}

/** The disclosure is the point of the whole play, so it cannot be optional. */
function assertConflictDisclosureIsPresent() {
  const sig = C.SIGNATURE.join(' ');
  if (!/Colaberry/.test(sig) || !/Managing Director/.test(sig)) {
    throw new Error('The signature must name Colaberry and the role: that is what puts the '
      + 'ownership on the record in the first contact.');
  }
  const c = allLetters().find((l) => l.variant.id === 'C');
  if (!/I\s+own Colaberry/.test(c.body) || !/recused/.test(c.body)) {
    throw new Error('Variant C asks a third party to spend their own credibility. It must state '
      + 'the ownership and the recusal in the body, before it asks for anything.');
  }
}

/** Only Ali can set the two gates. This file proves nothing here pretends to. */
function assertNoAttestationWasWritten() {
  const g = D.CAMPAIGN.activationGate;
  if (g.claims_approved !== false || g.dry_run_reviewed !== false) {
    throw new Error('Both activation gates must still read false. They are Ali\'s to set and '
      + 'this artifact must never write them on his behalf.');
  }
}

/** Memory rule: American spelling, and there is tooling for it rather than a hand-made list. */
function assertAmericanSpelling() {
  for (const l of allLetters()) {
    const hits = findAllBritishSpellings(l.subject + ' ' + l.body);
    if (hits.length) {
      throw new Error(`${l.label} uses British spelling: ${JSON.stringify(hits.slice(0, 5))}`);
    }
  }
}

/** The ticket's five acceptance criteria, scored rather than asserted, for the document. */
function criteria() {
  const letters = allLetters();
  const figures = assertNoUnregisteredFigure();
  return [
    { n: 1, text: 'Each of the three variants is approved or rewritten, in writing',
      verdict: 'PENDING ALI',
      evidence: 'All three are written and rendered in full below, with every per-company '
        + 'opener. They did not previously exist, so there was nothing to approve: '
        + `${letters.length} finished letters are presented for approval or rewrite.` },
    { n: 2, text: 'Every claim in the approved copy traces to a registry row or a measured '
        + 'personal fact', verdict: 'MET',
      evidence: `${D.TRACEABILITY.length} claims traced, each to a CLM row or to a resume fact. `
        + `${figures} registry-backed figures are allowed into the copy; every numeral in every `
        + 'letter is checked against that set at build time.' },
    { n: 3, text: 'settings.activation_gate.claims_approved is attested true by Ali',
      verdict: 'NOT MET BY DESIGN',
      evidence: 'Still false in production, read 1 November. Only Ali can set it and this '
        + 'artifact deliberately does not.' },
    { n: 4, text: 'settings.activation_gate.dry_run_reviewed is attested true after a dry run '
        + 'is read', verdict: 'NOT MET BY DESIGN',
      evidence: 'Still false in production. The dry run is the rendered text in this document, '
        + 'which is what there is to read; the attestation remains his.' },
    { n: 5, text: 'No variant uses the word "free", claims a certification, or quotes an '
        + 'unregistered figure', verdict: 'MET',
      evidence: 'Enforced by assertion over all ' + letters.length + ' letters, not by reading '
        + 'them. The build fails on any one of the three.' },
  ];
}

function assertAllGuards() {
  assertNoUnregisteredFigure();
  assertProhibitedWordingAbsent();
  assertSendPreflightWouldPass();
  assertNoRequisitionAgeClaim();
  assertWatchVerdictIsRespected();
  assertNoSourceIsOverstated();
  assertDisqualifiedCompanyGetsNoLetter();
  assertConflictDisclosureIsPresent();
  assertNoAttestationWasWritten();
  assertAmericanSpelling();
  return allLetters().length;
}

module.exports = { allLetters, criteria, assertAllGuards, NON_CLAIM_NUMBERS };
