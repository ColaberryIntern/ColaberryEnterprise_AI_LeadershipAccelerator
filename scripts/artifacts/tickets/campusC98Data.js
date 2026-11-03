/**
 * Campus C98 (Today's feed for a brand-new Explorer) - the feed evidence. Both PDFs read this one module, so a number
 * on the one-pager cannot drift from the report.
 *
 * EVERY FIGURE is from scripts/audits/explorer-ad-funnel, run read-only against production at AS_OF with:
 *   bash scripts/audits/explorer-ad-funnel/run.sh feed   (F1-F9)
 * The query id is kept beside each figure so any one of them can be re-derived.
 *
 * What the source can and cannot say: today_feed_impressions holds one row per item the server GENERATED for a
 * learner, not per item seen, and only "open" from the feed sets interacted_at. So "generated" overcounts what was
 * seen and "opened" undercounts engagement. The report uses those words, never "shown" or "clicked".
 */
const AS_OF = '2 November 2026, 9:10 PM CST';
const WINDOW = 'ad Explorers who entered 19 October to 2 November 2026';

const TICKET = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10461462229';
const C91_TICKET = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10457116167';

/** F1: totals. First session = rows served within 60 minutes of the learner's first feed row. */
const TOTALS = {
  people: 405, generatedAllTime: 14149, openedAllTime: 3, generatedFirstSession: 14049, openedFirstSession: 3,
};

/** F2: items generated per person in the first session. */
const DEPTH = [{ items: '21-40', people: 400 }, { items: '41 or more', people: 5 }];

/** F3: first session, by item type. kind: anchored = class cards; ambient = variety items between them. */
const TYPES = [
  { kind: 'anchored', type: 'video', generated: 6890, people: 405, opened: 2, best: 4 },
  { kind: 'ambient', type: 'blog', generated: 1729, people: 405, opened: 0, best: 2 },
  { kind: 'ambient', type: 'testimonial', generated: 1700, people: 405, opened: 0, best: 5 },
  { kind: 'ambient', type: 'podcast', generated: 1300, people: 405, opened: 0, best: 6 },
  { kind: 'anchored', type: 'knowledge_check', generated: 405, people: 405, opened: 0, best: 1 },
  { kind: 'anchored', type: 'warmup', generated: 405, people: 405, opened: 0, best: 3 },
  { kind: 'anchored', type: 'announcement', generated: 405, people: 405, opened: 0, best: 0 },
  { kind: 'anchored', type: 'architect_mindset', generated: 405, people: 405, opened: 0, best: 11 },
  { kind: 'anchored', type: 'deep_dive', generated: 405, people: 405, opened: 0, best: 6 },
  { kind: 'anchored', type: 'claude_studio', generated: 404, people: 404, opened: 1, best: 33 },
  { kind: 'anchored', type: 'community_discussion', generated: 1, people: 1, opened: 0, best: 3 },
];

/** F4: first session, beginner fit. */
const FIT = [
  { fit: 'Week 0 class cards', surface: 'class', generated: 8914, opened: 3 },
  { fit: 'No week (evergreen and variety items)', surface: 'today', generated: 4729, opened: 0 },
  { fit: 'Week 0 Today items', surface: 'today', generated: 405, opened: 0 },
  { fit: 'No week (community)', surface: 'community', generated: 1, opened: 0 },
];

/** F5: all time, by feed position. */
const POSITIONS = [
  { pos: '1 to 3', generated: 1620, opened: 0 },
  { pos: '4 to 10', generated: 2835, opened: 1 },
  { pos: '11 to 30', generated: 8100, opened: 1 },
  { pos: '31 and below', generated: 1594, opened: 1 },
];

/** F6: every opened item, all time. Times UTC. */
const OPENS = [
  { served: '26 Oct 19:37', opened: '26 Oct 19:39', position: 16, type: 'video' },
  { served: '28 Oct 05:31', opened: '28 Oct 05:48', position: 33, type: 'claude_studio' },
  { served: '28 Oct 05:31', opened: '28 Oct 05:48', position: 10, type: 'video' },
];

/** F7: people who opened any card page at all, and how many of them did it from the feed. */
const ANY_CARD = { people: 25, viaFeed: 1 };

/** F8: first hour on Today, and whether the page was scrolled at all. */
const SCROLL = { onToday: 325, scrolled: 53 };

/** F9: control. The same open logging for learners who are not Explorers. */
const CONTROL = { generated: 25537, opened: 1018, pct: 4.0 };

const RECOMMENDATIONS = [
  { n: 1, title: 'Before the first lesson, the feed holds five items, not thirty-five',
    why: 'The server generated 21 to 40 items for 400 of 405 new Explorers in their first hour, about 17 of them '
      + 'videos, and nobody opened anything in positions 1 to 3. Volume is not buying attention: 3 opens in 14,049.',
    what: 'Until the first win, an Explorer\'s feed is capped at five beginner-safe items: the first lesson, the Week 0 '
      + 'warmup, one short video, one testimonial and one blog post. No paging, no variety stream. After the first win '
      + 'the current feed returns unchanged.' },
  { n: 2, title: 'Put the next step where people already look, not below the fold',
    why: 'Only 53 of 325 Explorers on Today scrolled the page at all in their first hour. Of 25 people who opened a '
      + 'card, 24 did it from somewhere other than the feed (mostly the first-lesson button added in C91).',
    what: 'After the first lesson, the banner that held "Start your first lesson" offers the single next card, the same '
      + 'way. The feed stays below it for those who scroll.' },
  { n: 3, title: 'Measure what is seen, not what is generated',
    why: 'Today a row is written when the server builds an item, including items the page filters out and items '
      + 'never scrolled to, and only an open from the feed counts. The next audit cannot tell "not seen" from "seen '
      + 'and skipped".',
    what: 'Record an impression when a card scrolls into view (the feed already watches the bottom of the list), and '
      + 'record opens that come from the banner, so both doors count the same way.' },
];

const NOT_ESTABLISHED = [
  'That fewer items would be opened more. The data shows the current feed is ignored, not what a smaller one would do; '
    + 'recommendation 1 is a test to run, with this query as the baseline.',
  'What anyone actually saw. "Generated" counts rows the server wrote, including items below the screen and items '
    + 'the page filtered out; a scroll event is the only sign of attention below the fold.',
  'Why people do not scroll. No one was asked, and device is not split here.',
  'Engagement other than opening. Only an open from the feed is logged; reading a card\'s preview, liking or '
    + 'collecting it does not touch the impression row.',
];

function pct(n, d, places = 0) {
  if (!d) return 0;
  const f = 10 ** places;
  return Math.round((n / d) * 100 * f) / f;
}

/** F1, F3 and F4 are separate statements over the same first-session rows: they must agree. */
function assertConsistent() {
  const f3 = TYPES.reduce((s, r) => s + r.generated, 0);
  if (f3 !== TOTALS.generatedFirstSession) throw new Error(`C98: F3 sum ${f3} != F1 first session ${TOTALS.generatedFirstSession}`);
  const f4 = FIT.reduce((s, r) => s + r.generated, 0);
  if (f4 !== TOTALS.generatedFirstSession) throw new Error(`C98: F4 sum ${f4} != F1 first session ${TOTALS.generatedFirstSession}`);
  const opened3 = TYPES.reduce((s, r) => s + r.opened, 0);
  const opened4 = FIT.reduce((s, r) => s + r.opened, 0);
  if (opened3 !== TOTALS.openedFirstSession || opened4 !== TOTALS.openedFirstSession) {
    throw new Error(`C98: opens disagree, F3 ${opened3} / F4 ${opened4} / F1 ${TOTALS.openedFirstSession}`);
  }
  const f5 = POSITIONS.reduce((s, r) => s + r.generated, 0);
  if (f5 !== TOTALS.generatedAllTime) throw new Error(`C98: F5 sum ${f5} != F1 all time ${TOTALS.generatedAllTime}`);
  if (OPENS.length !== TOTALS.openedAllTime) throw new Error(`C98: F6 lists ${OPENS.length} opens, F1 says ${TOTALS.openedAllTime}`);
  const depth = DEPTH.reduce((s, r) => s + r.people, 0);
  if (depth !== TOTALS.people) throw new Error(`C98: F2 people ${depth} != F1 ${TOTALS.people}`);
  return { perPerson: Math.round(TOTALS.generatedFirstSession / TOTALS.people),
    videosPerPerson: Math.round(TYPES[0].generated / TYPES[0].people) };
}

module.exports = {
  AS_OF, WINDOW, TICKET, C91_TICKET, TOTALS, DEPTH, TYPES, FIT, POSITIONS, OPENS, ANY_CARD, SCROLL, CONTROL,
  RECOMMENDATIONS, NOT_ESTABLISHED, pct, assertConsistent,
};
