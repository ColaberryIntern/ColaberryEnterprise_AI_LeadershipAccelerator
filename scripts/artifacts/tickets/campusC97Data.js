/**
 * Campus C97 (why ad Explorers never come back) - the return-path evidence. Both PDFs read this one module, so a
 * number on the one-pager cannot drift from the report.
 *
 * EVERY FIGURE is from scripts/audits/explorer-ad-funnel, run read-only against production at AS_OF with:
 *   bash scripts/audits/explorer-ad-funnel/run.sh returnpath   (R1-R7)
 * The query id is kept beside each figure so any one of them can be re-derived.
 */
const AS_OF = '1 November 2026, 10:20 AM CST';
const WINDOW = 'ad Explorers who entered 19 October to 1 November 2026';

const TICKET = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10461462187';
const C91_TICKET = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10457116167';

/** R1: people, by entry week. A return = a session starting 6+ hours after entering. */
const WEEKS = [
  { week: '19 Oct', explorers: 196, cameBack: 24, within7d: 21, had7d: 181 },
  { week: '26 Oct', explorers: 192, cameBack: 14, within7d: 14, had7d: 0 },
];

/** R2: return sessions, each in exactly one of the first four buckets. */
const SESSIONS = {
  total: 77, straightIn: 44, stoppedAtSignIn: 0, signInThenIn: 0, neverReachedPortal: 33, afterSessionEnds: 5,
};

/** R3: returning people. */
const RETURNERS = { total: 38, reachedPortal: 25, sawSignIn: 0, hadVisitNeverReachedPortal: 17 };

/** R4: the return sessions that never reached the portal. */
const NEVER_IN = [
  { landed: '/lp/colaberry-training/ai-learning-platform', viaAd: true, device: 'mobile', sessions: 20, people: 14 },
  { landed: '/lp/colaberry-training/ai-learning-platform', viaAd: true, device: 'desktop', sessions: 12, people: 2 },
  { landed: 'a public system page', viaAd: false, device: 'desktop', sessions: 1, people: 1 },
];

/** R5: control. The tracker records /portal/login and /portal/today, and never /portal/verify. */
const CONTROL = { loginEvents: 15, loginSessions: 7, todayEvents: 2716, todaySessions: 487, verifyEvents: 0 };

/** R6: every message logged to an ad Explorer after entering. */
const MESSAGES = [
  { subject: 'Welcome to Colaberry: your AI journey starts now', people: 248, first: '21 Oct', last: '1 Nov',
    note: '1 on 21 Oct; the rest from 24 Oct' },
  { subject: 'Your Colaberry sign-in link', people: 140, first: '24 Oct', last: '24 Oct',
    note: 'one batch on 24 Oct, mostly to people who entered days earlier' },
];

/** R7: the 24 Oct sign-in link batch, people who entered before 24 Oct. */
const BATCH = { recipients: 119, visitedWithin48h: 6 };

const SESSION_RULES = [
  'A portal session lasts 7 days on the same browser (participantService signParticipantJwt, expiresIn 7d).',
  'A sign-in link lasts 24 hours and can be reused inside that window.',
  '/portal/signup shows the signup form even to someone already signed in; it never sends them to Today.',
  'Since C103 (1 Nov), an existing email typed into the signup form gets a sign-in link by email, not a session.',
];

const RECOMMENDATIONS = [
  { n: 1, title: 'Recognize a returning Explorer on the ad landing page and on /portal/signup',
    why: '32 of the 33 return visits that never reached the portal were people clicking the ad again and landing on '
      + 'the ad page, 16 people, 14 of them on a phone. The page pitched them "Start for $0" as strangers. Their '
      + 'session is in the same browser, so the page can see it.',
    what: 'If a live portal session exists, the landing page and /portal/signup show "Welcome back" and one button to '
      + 'Today instead of the signup pitch. No session: unchanged. In-product, no new sends.' },
  { n: 2, title: 'Stop paying to show the ad to people who already signed up',
    why: 'Those 32 visits were paid clicks from existing Explorers. An ad audience exclusion is a setting in the ad '
      + 'account, not code; it needs whoever runs the Meta campaign.',
    what: 'Exclude existing Explorers (a customer list or the signup conversion) from the prospecting audience.' },
  { n: 3, title: 'Record sign-in link use on the server',
    why: 'Whether anyone ever used a sign-in link cannot be measured today: the verify page redirects before the '
      + 'tracker records it, and the request log is lost on each deploy.',
    what: 'Write one row when /api/portal/verify succeeds or fails, so the link path is a number, not a guess.' },
];

const NOT_ESTABLISHED = [
  'Whether anyone used a sign-in link. Zero /portal/verify page events exist for any visitor, and the backend '
    + 'request log does not survive a container recreate, so link use is unmeasured, not zero.',
  'Returns on another device or with tracking blocked. A return is only seen when it is on a browser we already '
    + 'know; a person who signs up on a phone and returns on a laptop is missed until they sign in.',
  'Why 350 of 388 never came back. The data shows that they did not return, not why; no one was asked.',
  'That fixing the landing page raises returns. 16 people is the size of the problem it addresses; the bigger '
    + 'group never returns at all, which is the first-session problem C91 works on.',
  'The 24 Oct batch effect. 6 of 119 visited within 48 hours, but with one person not emailed there is no '
    + 'comparison group, so this is a count, not a measured lift.',
];

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

function totals() {
  const explorers = WEEKS.reduce((s, w) => s + w.explorers, 0);
  const cameBack = WEEKS.reduce((s, w) => s + w.cameBack, 0);
  return { explorers, cameBack, neverBack: explorers - cameBack };
}

/** R1, R2, R3, R4 and R6 come from separate statements; they must agree, or the documents disagree with each other. */
function assertConsistent() {
  const t = totals();
  if (t.cameBack !== RETURNERS.total) throw new Error(`C97: R1 returners ${t.cameBack} != R3 ${RETURNERS.total}`);
  const parts = SESSIONS.straightIn + SESSIONS.stoppedAtSignIn + SESSIONS.signInThenIn + SESSIONS.neverReachedPortal;
  if (parts !== SESSIONS.total) throw new Error(`C97: R2 buckets ${parts} != ${SESSIONS.total} return sessions`);
  const never = NEVER_IN.reduce((s, r) => s + r.sessions, 0);
  if (never !== SESSIONS.neverReachedPortal) throw new Error(`C97: R4 ${never} != R2 ${SESSIONS.neverReachedPortal}`);
  const messaged = MESSAGES.reduce((s, m) => s + m.people, 0);
  if (messaged !== t.explorers) throw new Error(`C97: R6 messaged ${messaged} != ${t.explorers} ad Explorers`);
  if ((RETURNERS.sawSignIn === 0) !== (SESSIONS.stoppedAtSignIn + SESSIONS.signInThenIn === 0)) {
    throw new Error('C97: R2 and R3 disagree on whether anyone saw the sign-in page');
  }
  return t;
}

module.exports = {
  AS_OF, WINDOW, TICKET, C91_TICKET, WEEKS, SESSIONS, RETURNERS, NEVER_IN, CONTROL, MESSAGES, BATCH, SESSION_RULES,
  RECOMMENDATIONS, NOT_ESTABLISHED, pct, totals, assertConsistent,
};
