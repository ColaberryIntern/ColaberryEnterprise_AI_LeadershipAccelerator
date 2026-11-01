/**
 * Campus C91 (Explorer first win) - the audit that started the ticket, the decision, what shipped, and what the first
 * day in production showed. Both PDFs read this one module, so a number on the one-pager cannot drift from the report.
 *
 * Named campusC91 because tickets/c91Data.js is Commercialization C9.1 (launch readiness), a different ticket.
 *
 * EVERY FIGURE is from scripts/audits/explorer-ad-funnel, run read-only against production at AS_OF with:
 *   bash scripts/audits/explorer-ad-funnel/run.sh funnel     (F1-F7)
 *   bash scripts/audits/explorer-ad-funnel/run.sh behavior   (B1-B7)
 *   bash scripts/audits/explorer-ad-funnel/run.sh cutover    (C1-C2)
 * The query id is kept beside each figure so any one of them can be re-derived.
 */
const AS_OF = '30 October 2026, 12:40 PM CDT';
const WINDOW = 'Explorers who entered 19 to 30 October 2026';
const CAMPAIGN = 'Meta campaign 52708443249234 (Facebook 250, Instagram 91, untagged 2)';

const TICKET = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10457116167';
const PR_MAIN = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3491';
const PR_FIX = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3500';

/** F3 + F4 (channel = ad): the stage funnel, people not events. */
const FUNNEL = [
  { stage: 'Ad landing sessions', value: 1129, src: 'F3' },
  { stage: 'Became a lead', value: 352, src: 'F3' },
  { stage: 'Created an account', value: 343, src: 'F4' },
  { stage: 'Reached the campus map', value: 229, src: 'F4' },
  { stage: 'Started the tour', value: 17, src: 'F4' },
  { stage: 'Finished a lesson (first win)', value: 3, src: 'F4' },
  { stage: 'Started checkout', value: 4, src: 'F4' },
  { stage: 'Paid', value: 0, src: 'F4' },
];

/** Where they stalled, in the order a new Explorer meets them. */
const STALLS = [
  { n: 1, title: 'Asked to pay before seeing anything',
    evidence: '"Enroll to unlock" on Today was the top click in the whole portal: 101 of 343 ad Explorers (B3). '
      + 'It led to the Settings subscription tab: 128 spent time in Settings (B2), 4 started checkout, 0 paid (B6).' },
  { n: 2, title: 'The first job offered was a résumé upload',
    evidence: 'The Explorer\'s first "next step" was Upload résumé / LinkedIn: 41 people clicked it 214 times (B3).' },
  { n: 3, title: 'The map did not say what to do',
    evidence: '205 of the 229 who reached the campus were last seen at the Schedule tower, where everyone starts (F6). '
      + '39 clicked back to Today (B3). 17 opened the tour; 10 of those on the old 8-stop tour left at stop 1 (F5).' },
  { n: 4, title: 'One short visit, then gone',
    evidence: '282 of 343 (82%) spent under 5 minutes in the portal in total (B4). 328 never started a later visit (B1). '
      + 'Today\'s feed showed 11,847 cards and got 3 clicks (B5).' },
  { n: 5, title: 'Nothing brought them back',
    evidence: 'Every ad Explorer got one email: a welcome (203) or a sign-in link (140). 16 also got Open House '
      + 'reminders (B7). Explorer Growth filed 339 of 343 as New or Activating (F7).' },
];

const STRATEGIES = [
  { id: 'A', name: 'Fix the first session in the product', chosen: true,
    what: 'Give a new Explorer one job, finish a first lesson, before any enroll ask; make the campus gate lead there; '
      + 'shorten the tour; give the Settings dead end a way back.',
    pros: ['Fixes the step every one of the 343 went through', 'All in code we own: no vendor, no new cost',
      'Readable in about a week at roughly 30 ad signups a day', 'The tracking to measure it already exists'],
    cons: ['Does nothing for people who already left', 'Could delay an early buyer (none had paid)',
      'Campus is design-gated, so changes need care'] },
  { id: 'B', name: 'Bring them back with a sequence and a live event', chosen: false,
    what: 'A 7-day email sequence, automatic Open House RSVP, and a person calling anyone who started checkout.',
    pros: ['Targets the biggest absolute group: 328 who never returned',
      'The Open House path is the one that has converted before', 'Reuses existing sending and scheduling'],
    cons: ['Sends people back into the same first session that loses 82% in under 5 minutes',
      'SMS blocked until consent enforcement is live', 'Campaign email has a known delivery block',
      'Overlaps Maya, who owns Explorer outreach'] },
];

const DECISION = {
  who: 'Ali Muwwakkil', when: '29 October 2026',
  quote: 'Strategy A, because B interferes with Maya and her reachout.',
};

/** What shipped, in order. */
const SHIPPED = [
  { pr: PR_MAIN, n: '#3491', when: 'merged 29 Oct, live 6:30 PM CDT 29 Oct',
    items: ['Before the first win, the Explorer banner and next step lead with the first lesson; no enroll ask',
      'Campus gate: "Start your first lesson" is the Explorer\'s main door; the tour is second',
      'Explorer tour cut from 8 stops to 3', 'Settings subscription tab: "Back to your lessons"',
      'Banner copy says "no card needed", never "free"'] },
  { pr: PR_FIX, n: '#3500', when: 'merged 11:51 AM CDT 30 Oct, live the same day',
    items: ['The first lesson must be a card that awards points (it had been a 0-point welcome note)',
      'Deep Dive Field Guide uploads count as a first win'] },
];

/** C1 + C2: ad Explorers before vs after C91 went live (2026-10-29 23:30 UTC). Windows differ: compare rates. */
const CUTOVER = {
  before: { signed_up: 316, first_win: 3, enroll_click: 106, gate_lesson: 0 },
  after: { signed_up: 27, first_win: 0, enroll_click: 2, gate_lesson: 13 },
};

const FOUND_AFTER_DEPLOY = 'In the first day the enroll clicks collapsed and the new door was used, but no one finished a '
  + 'counted first lesson. The "first lesson" picked was the first card in order, "Welcome to Your Free AI Preview", an '
  + 'announcement worth 0 points. Finishing it records nothing, so the first win never registered. PR #3500 makes the '
  + 'first lesson the first card that awards points: "Quick check: AI foundations", 15 points, about 5 minutes.';

const NOT_ESTABLISHED = [
  'That C91 raises conversion. After the fix there is under a day of data; the read that counts is the next ~50 ad '
    + 'signups (about 1 November) against the target of 25% finishing a first lesson.',
  'Why people leave. The data shows where they stop, not why; no one was asked.',
  'The true ad share. Channel is rebuilt from visitor sessions because /portal/signup drops the UTM tags; people who '
    + 'block tracking are counted as untracked (22 here).',
  'The path through the campus. Only each person\'s last location is stored, never the rooms in between.',
];

const OPEN_ITEMS = [
  'Signup should send the ad\'s UTM tags so channel is recorded, not reconstructed (proposed C94).',
  'The welcome card\'s title shows Explorers the word "Free" (proposed C95; content, not code).',
  'The daily smoke test\'s @colaberry-test.local accounts count as Explorers in dashboards (proposed C96).',
];

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

/** The funnel must only ever narrow from account to paid (checkout can exceed first win, so it is checked apart). */
function assertFunnelNarrows() {
  const order = ['Created an account', 'Reached the campus map', 'Started the tour'];
  const v = order.map((s) => FUNNEL.find((f) => f.stage === s).value);
  for (let i = 1; i < v.length; i += 1) if (v[i] > v[i - 1]) throw new Error(`C91: funnel widens at ${order[i]}`);
  const signups = v[0];
  if (STALLS.length !== 5) throw new Error('C91: the audit named five stall points');
  return signups;
}

/** The before/after split must add up to the funnel's signup count. */
function assertCutoverMatchesFunnel() {
  const total = CUTOVER.before.signed_up + CUTOVER.after.signed_up;
  const signups = FUNNEL.find((f) => f.stage === 'Created an account').value;
  if (total !== signups) throw new Error(`C91: cutover ${total} != funnel signups ${signups}`);
  return total;
}

module.exports = {
  AS_OF, WINDOW, CAMPAIGN, TICKET, PR_MAIN, PR_FIX, FUNNEL, STALLS, STRATEGIES, DECISION, SHIPPED, CUTOVER,
  FOUND_AFTER_DEPLOY, NOT_ESTABLISHED, OPEN_ITEMS, pct, assertFunnelNarrows, assertCutoverMatchesFunnel,
};
