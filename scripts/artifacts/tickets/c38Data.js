/**
 * C3.8 - the partner conversation tracker. THE single source for both PDFs and the CSV.
 *
 * ## Why this is not seeded only from the target maps
 *
 * The ticket says to seed from C3.3 and C3.6. Those are maps of people we have NOT contacted.
 * The ticket's own comment thread carries five logged conversations that are already running,
 * and a tracker that omitted them would be a plan rather than a record. So every row is either
 * a live conversation with a real last-touch date, or a mapped target with no contact yet, and
 * the two are visibly different states.
 *
 * ## The row that is not like the others
 *
 * One row is an unsupplied message text on a sequence that has already sent and is scheduled to
 * send again. It is flagged as a RISK rather than an action because the exposure is not that
 * something will be missed; it is that something has already gone out that we cannot see and
 * may not be allowed to say.
 */

const ACCESS = '16 October 2026';
const TODAY = '2026-10-16';

const STATE = {
  LIVE: { k: 'LIVE', color: '#2f7d32' },
  WAITING: { k: 'WAITING ON THEM', color: '#b26a00' },
  STALLED: { k: 'STALLED', color: '#b3261e' },
  MAPPED: { k: 'MAPPED, NOT CONTACTED', color: '#555f6d' },
  CLOSED: { k: 'CLOSED', color: '#8a8f98' },
};

const HEADLINE = 'A sequence is sending to Anthropic on our behalf with text nobody has seen, '
  + 'and the one message we did see said something the claim registry forbids.';

const SO_WHAT = [
  'Six Anthropic targets are on a six-touch LinkedIn InMail cadence run by Nishant. First touch '
  + '7 October, connection request 9 October, second 12 October, third 15 October, fourth 19 '
  + 'October. The third has already passed and the fourth is three days away.',
  'The message text has never been supplied for any of them. The three texts we were shown on 8 '
  + 'October each carried "our first cohort of 30 Claude-certified AI Architects". CLM-026 is '
  + 'explicit that we prepare people and issue nothing, so that sentence is not ours to say, and '
  + 'it was said to the one audience on earth that can check it.',
  'LinkedIn InMail cannot be copied to anyone, so there is no way to read a message after it '
  + 'goes. The only control available is asking for the text before it sends, and 18 more '
  + 'scheduled touches sit behind that gap.',
];

/* ------------------------------------------------------------------ *
 * THE TRACKER
 * ------------------------------------------------------------------ */

const ROWS = [
  { id: 'A1', track: 'Anthropic', who: 'Partner support desk', owner: 'Ali',
    state: STATE.STALLED, last: '2026-08-21',
    what: 'Ali replied to their AI agent\'s contradiction, quoting the March email verbatim '
      + 'and asking plainly how to register.',
    next: 'Reply on the same thread with ONE closed question: is Colaberry Registered in the '
      + 'partner record, or not listed. Not "what are the requirements", which was answered at '
      + 'length without answering us.', due: '2026-10-17', src: 'C3.1, C3.3' },

  { id: 'A2', track: 'Anthropic', who: 'Nishant InMail sequence, six targets', owner: 'Nishant',
    state: STATE.LIVE, last: '2026-10-15',
    what: 'Karl Kadon, Daniel Rosenthal, Phil Samenuk, Steve Corfield, Hayley Waikart, and one '
      + 'handle we hold no name for. Six touches planned each; four scheduled, two columns empty.',
    next: 'ASK FOR THE TEXT BEFORE THE 19 OCTOBER TOUCH SENDS. See the risk below; this is the '
      + 'most time-critical row in the tracker.', due: '2026-10-18', src: 'Logged 8 and 12 Oct' },

  { id: 'A3', track: 'Anthropic', who: 'Rich O\'Connell, Head of Alliances', owner: 'Ali',
    state: STATE.MAPPED, last: null,
    what: 'Closest individual fit: owns the services track we would sit in, and his public '
      + 'language is nearly a description of what we do.',
    next: 'Hold until A1 is answered or has clearly gone unanswered. Approaching him while an '
      + 'unanswered question sits on the desk thread looks like going around them.',
    due: '2026-10-24', src: 'C3.3' },

  { id: 'A4', track: 'Anthropic', who: 'The three Select-tier counts', owner: 'Ali',
    state: STATE.LIVE, last: '2026-10-16',
    what: 'Ten certified individuals, two production joint customers, one public customer story. '
      + 'We stand at zero on all three, and the exams are sold only to admitted organizations.',
    next: 'The only one movable before admission is the public customer story. Fold it into the '
      + 'CSUSB conversation as a named reference.', due: '2026-11-14', src: 'C3.1' },

  { id: 'O1', track: 'OpenAI', who: 'Inland Empire SBDC at CSUSB', owner: 'Ali',
    state: STATE.MAPPED, last: null,
    what: 'OpenAI announced a partnership with America\'s SBDC on 30 September 2026 running '
      + 'through the Community Trainer Program. It needs advisor training and workshop delivery. '
      + 'CSUSB hosts this SBDC and C6.3 already ranks CSUSB our best account.',
    next: 'Approach about delivery capacity, referencing the 30 September announcement. '
      + 'First-wave states are unpublished, so the window may still be open and only asking will '
      + 'tell us.', due: '2026-10-20', src: 'C3.6' },

  { id: 'O2', track: 'OpenAI', who: 'CSUSB College of Extended and Global Education',
    owner: 'Ali', state: STATE.MAPPED, last: null,
    what: 'The C2.5 beachhead exactly: higher education through the self-funded continuing '
      + 'education unit. Already sells AI courses. Worth approaching whether or not OpenAI opens.',
    next: 'A continuing education conversation on commit-verified training, independent of any '
      + 'partnership.', due: '2026-10-20', src: 'C3.6, C6.3' },

  { id: 'O3', track: 'OpenAI', who: 'Nishant OpenAI sheet', owner: 'Nishant',
    state: STATE.STALLED, last: '2026-10-12',
    what: 'Two names and almost no process. No dates recorded.',
    next: 'Decide whether this runs at all. C3.4 recommends the OpenAI partner track sequences '
      + 'behind Anthropic; the SBDC route in O1 is the better use of the same effort.',
    due: '2026-10-20', src: 'Logged 12 Oct' },

  { id: 'X1', track: 'XPRIZE', who: 'Heeseung Kim, XPRIZE Alumni Network', owner: 'Ali',
    state: STATE.WAITING, last: '2026-10-14',
    what: 'Primary ask, an introduction to Anthropic or OpenAI, was declined three times in his '
      + 'own words. Materials sent 14 October. He proposed the process himself: review, short '
      + 'list, feelers across the ecosystem, report back either way.',
    next: 'Follow up if nothing by 21 October. He asked for exactly one thing in return, that we '
      + 'keep him posted, so the follow-up should carry news rather than only a chase.',
    due: '2026-10-21', src: 'Logged 13 and 14 Oct' },

  { id: 'X2', track: 'XPRIZE', who: 'Renaissance Philanthropy', owner: 'Ali',
    state: STATE.WAITING, last: '2026-10-14',
    what: 'A named lead that did not exist before the 13 October call. Heeseung offered '
      + 'unprompted to reach out to his contacts there. Funded by Eric and Wendy Schmidt, active '
      + 'in AI and education.',
    next: 'Depends on X1. The gap is that they are a FUNDER and both our documents are commercial '
      + 'capability sheets, so neither tells an impact story. C4.13 is the ticket for that.',
    due: '2026-10-21', src: 'Logged 14 Oct' },

  { id: 'K1', track: 'Knimbus', who: 'Knimbus MVP and distribution', owner: 'Rammohan',
    state: STATE.LIVE, last: '2026-10-09',
    what: 'Ram\'s framing on the 9 October call: "Nimbus is primarily an SSO handoff to us... '
      + 'It is acting as a distribution partner." Materially narrower than the Vision deck. '
      + 'Go-to-market and revenue share sit with Rammohan, scheduled separately.',
    next: 'Two platform findings were raised on that call and not closed: no federated SSO and '
      + 'no institutional tenancy. C3.11 and C3.12 carry the gap analysis and integration.',
    due: '2026-10-20', src: 'Logged 9 Oct' },

  { id: 'K2', track: 'Knimbus', who: 'Sharath Dodda, MVP document', owner: 'Sharath',
    state: STATE.LIVE, last: '2026-10-09',
    what: 'The MVP spec was written without ever having seen the platform. In his own words, "it '
      + 'is an assumption, I do not have the complete visibility on the Colaberry platform". '
      + 'Access was being granted on the call.',
    next: 'Re-read the MVP document now that access exists. Everything in it was a thoughtful '
      + 'spec written without sight of the product.', due: '2026-10-20', src: 'Logged 9 Oct' },
];

/* ------------------------------------------------------------------ *
 * RISKS, which are not just late actions
 * ------------------------------------------------------------------ */

const RISKS = [
  { id: 'R1', sev: 'HIGH', row: 'A2',
    r: 'A sequence is sending to Anthropic in our name with text nobody has reviewed, and the '
      + 'one text we saw was not ours to say.',
    d: 'Three InMail texts shown on 8 October each claimed "our first cohort of 30 '
      + 'Claude-certified AI Architects". CLM-026 states we prepare people for Anthropic\'s '
      + 'certification and award nothing. This was said to Anthropic, who can verify it against '
      + 'their own records in seconds. InMail cannot be CC\'d, so nothing is visible after it '
      + 'sends, and 18 further touches are scheduled.',
    fix: 'Ask Nishant for the text of every remaining touch BEFORE 19 October, and for what was '
      + 'actually sent on 12 and 15 October. If the credential claim went out, the correction is '
      + 'cheap now and expensive after a partner conversation starts.' },

  { id: 'R2', sev: 'MEDIUM', row: 'A2',
    r: 'We hold no name for one of the six people being contacted on our behalf.',
    d: 'The handle siddiqzaman carries the same 7 October first-touch date as the other five but '
      + 'was not in what was reported on 8 October. Either they were added later and the date '
      + 'backfilled, or the original report was incomplete. The name is deliberately not inferred '
      + 'from the handle.',
    fix: 'One question to Nishant. Do not guess.' },

  { id: 'R3', sev: 'MEDIUM', row: 'X1',
    r: 'The XPRIZE warm path to the labs does not exist, and two tickets assume it does.',
    d: 'Heeseung declined three times, including "Unfortunately, I don\'t think we\'re '
      + 'able to make any direct connections to Anthropic or OpenAI." C3.9 and C3.10 are built on '
      + 'that premise. Separately, C3.6 found XPRIZE\'s current frontier-AI partner is '
      + 'Google, so leading with the affiliation in front of Anthropic may argue against us.',
    fix: 'Re-scope C3.9 and C3.10 around what XPRIZE actually offered, which is ecosystem feelers '
      + 'and the Renaissance Philanthropy introduction.' },

  { id: 'R4', sev: 'LOW', row: 'all',
    r: 'Two meeting summaries in this workstream have had the wrong attendee list.',
    d: 'The Otter summary for the 9 October Knimbus session listed three attendees when five were '
      + 'present, and the 13 October XPRIZE summary listed five when three were. Both were caught '
      + 'only by reading the transcript.',
    fix: 'Treat the automated attendee header as unreliable by default and take attendance from '
      + 'the transcript speaker list.' },
];

/* ------------------------------------------------------------------ *
 * DERIVED
 * ------------------------------------------------------------------ */

const daysLate = (due) => Math.round((Date.parse(TODAY) - Date.parse(due)) / 86400000);
const overdue = () => ROWS.filter((r) => r.due && r.due < TODAY);
const byTrack = () => {
  const t = {};
  for (const r of ROWS) (t[r.track] = t[r.track] || []).push(r);
  return t;
};

/* ------------------------------------------------------------------ *
 * THE GATE
 * ------------------------------------------------------------------ */

/** Acceptance criterion: every row has a next action and a date. */
function assertEveryRowActionable() {
  const bad = ROWS.filter((r) => !r.next || !r.due || !r.owner || !r.state);
  if (bad.length) {
    throw new Error('rows missing a next action, date, owner or state: '
      + bad.map((r) => r.id).join(', '));
  }
  return { rows: ROWS.length, tracks: Object.keys(byTrack()).length };
}

/** Acceptance criterion: seeded from BOTH target maps, and from the live log. */
function assertSeededFromBoth() {
  const srcs = ROWS.map((r) => r.src).join(' ');
  for (const need of ['C3.3', 'C3.6']) {
    if (!srcs.includes(need)) throw new Error('tracker not seeded from ' + need);
  }
  if (!/Logged/.test(srcs)) {
    throw new Error('tracker carries no live logged conversation, so it is a plan not a record');
  }
  return true;
}

module.exports = {
  ACCESS, TODAY, STATE, HEADLINE, SO_WHAT, ROWS, RISKS,
  daysLate, overdue, byTrack, assertEveryRowActionable, assertSeededFromBoth,
};
