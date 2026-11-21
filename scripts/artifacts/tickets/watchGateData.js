/**
 * The watch gate to-do (10533119961) — one source of truth for both PDFs.
 *
 * Every number here was measured rather than estimated, and the source of each is named in the
 * comment beside it. Two of them came from Swati Raman's production testing and two from reading
 * the running container, so nothing in these artifacts rests on what the code was supposed to do.
 */

const TICKET = '10533119961';
const TICKET_URL = 'https://app.basecamp.com/3945211/buckets/47502609/todos/10533119961';
const PROJECT = 'Platform Changes';
const AS_OF = '21 Nov 2026';

/**
 * The defects on this to-do, in the order they were found, with where each one actually is on the
 * shipping ladder. "Live" means read out of the running container, not inferred from a merge.
 */
const LADDER = [
  {
    n: 1,
    title: 'Watch time destroyed by the save loop',
    detail: 'The iframe effect depended on the callback identity, so every re-render tore it down '
      + 'and flushed. Those beats met an IP-keyed limiter and the rejected ones were discarded.',
    state: 'LIVE',
    note: 'PR #4246, 19 Nov',
  },
  {
    n: 2,
    title: 'Watch time inflated by cross-player messages',
    detail: 'The postMessage listener checked the origin but not the sender, so every YouTube '
      + 'player on the page fed every tracker. Each of two players counted the other.',
    state: 'LIVE',
    note: 'PR #4260, merged 44107070, proved live by A/B against the pre-fix image',
  },
  {
    n: 3,
    title: 'A failed beat retried on every sample',
    detail: 'Re-crediting a rejected beat restores the buffer above the flush threshold, which is '
      + 'the condition that triggers a send. One failure became roughly three requests a second.',
    state: 'IN REVIEW',
    note: 'PR #4276, blocked on review',
  },
  {
    n: 4,
    title: 'Three of four callers never got the 19 Nov protection',
    detail: 'Only TimelineCard returns its promise. The drawer, the workspace and ambient media '
      + 'catch and return undefined, so the re-credit is dead code and a failed save still loses time.',
    state: 'NOT STARTED',
    note: 'Ordered after #4276 on purpose: without the back-off it spreads the storm',
  },
  {
    n: 5,
    title: 'Which player owns a card\'s progress',
    detail: 'Three mounts can report for one card. Deciding which may save also decides whether '
      + 'time from a player the learner cannot see counts toward completion.',
    state: 'NEEDS ALI',
    note: 'Not a defect. A product call, and the only thing blocking the rest',
  },
];

/** Credited time against ground actually covered, before 18 Nov, by video length. */
const CREDIT_BY_LENGTH = [
  ['under 5 minutes', 0.98],
  ['5 to 10 minutes', 0.91],
  ['over 30 minutes', 0.70],
];

/** What the gate did to one learner's watch time, in each era. 1.0 is honest. */
const ERROR_DIRECTION = [
  { label: 'Before 19 Nov (long video)', value: 0.70, display: '0.70x  destroyed', bad: true },
  { label: 'After the loop fix, 20 Nov', value: 2.05, display: '2.05x  inflated', bad: true },
  { label: 'Drift between two players', value: 3.50, display: 'up to 3.50x', bad: true },
  { label: 'After #4260 (unmeasured)', value: 1.00, display: 'pending re-test', bad: false },
];

/** The three mounts that can each report for the same card. */
const MOUNTS = [
  ['CardDetailBody.tsx:309', 'the drawer'],
  ['TimelineCard.tsx:461', 'the classroom tile'],
  ['runtimeActivityPanels.tsx:36', 'the runtime workspace'],
];

/** The decision this artifact exists to support. */
const OPTIONS = [
  {
    key: 'A',
    title: 'First player to report wins',
    body: 'Any mount may save; whichever reports first owns the card. Simplest change, no '
      + 'coordination needed.',
    cost: 'Time can accrue from a player the learner cannot see, because the tile keeps playing '
      + 'behind an open drawer.',
  },
  {
    key: 'B',
    title: 'Only the foreground player counts',
    body: 'The drawer or workspace owns the card while open; the tile owns it otherwise. Credit '
      + 'follows what the learner is actually looking at.',
    cost: 'The mounts have to coordinate, and a learner who watches entirely in the tile preview '
      + 'while a drawer is open earns nothing for it.',
  },
  {
    key: 'C',
    title: 'Pause the hidden player instead',
    body: 'When the drawer opens over the tile, stop the tile. One playing player per card, so '
      + 'there is nothing to arbitrate.',
    cost: 'Touches playback rather than accounting, so it changes what a learner hears when they '
      + 'open a drawer over a playing tile.',
  },
];

const RECOMMENDATION = 'C';
const RECOMMENDATION_WHY = 'A and B both answer "whose seconds count" after the fact. C removes '
  + 'the question: two players for one card is the thing that is wrong, and a learner opening a '
  + 'drawer over a playing tile already expects the tile to stop. It is also the only option that '
  + 'cannot be got wrong quietly, because a second playing player becomes audible rather than '
  + 'arithmetic.';

/** Precedent, so the decision is not made in a vacuum. */
const PRECEDENT = [
  ['YouTube', 'counts hidden-tab playback toward watch time'],
  ['Loom', 'does not'],
  ['Wistia', 'does not'],
];

/** Measured facts quoted on both PDFs. */
const FACTS = {
  limiter: '30 requests / 60s per participant',
  healthy: '1 beat per 15s of play (4/min)',
  storm: 'about 3 requests per second',
  swatiOld: '20% saved at 96% played',
  swatiOver: '158s watched credited as 324s',
  callers: '1 of 4 callers returns its promise',
};

/** What these artifacts do NOT establish. Stated so nothing here is read as more than it is. */
const NOT_ESTABLISHED = [
  'That the over-counting is fixed. #4260 removed one of its two causes; the re-test that would '
    + 'show whether saves still arrive in pairs has not been posted.',
  'That any learner\'s stored progress was repaired. Every fix here changes what is recorded from '
    + 'now on. Rows already written during either era are untouched.',
  'That the back-off works in production. #4276 is mutation-checked in CI and is not merged.',
  'That 75% means the same thing on every surface. Until item 5 is decided, the drawer, the tile '
    + 'and the workspace can each answer differently.',
];

module.exports = {
  TICKET, TICKET_URL, PROJECT, AS_OF,
  LADDER, CREDIT_BY_LENGTH, ERROR_DIRECTION, MOUNTS,
  OPTIONS, RECOMMENDATION, RECOMMENDATION_WHY, PRECEDENT, FACTS, NOT_ESTABLISHED,
};
