import type { TimelineFeedCard } from '../../components/timeline/TimelineCard';

/**
 * Grouping the classroom week into the sections the platform already has.
 *
 * The seven buckets are not invented here. `TimelineBucket` in the backend
 * model has been `pre_class | learn | practice | build | reflect | share |
 * advance` all along, every card type carries a `bucket`, the feed already
 * sends it on each card, and `TimelineFeed.buckets` even ships the list. What
 * was missing was anyone rendering it: the week arrived as one flat stream of
 * up to fifty cards in publication order.
 *
 * So this file adds NO data. It orders the buckets the way a week actually
 * runs, gives each one a student-facing name and the question it answers, and
 * decides which are read as a list and which are browsed sideways.
 *
 * WHY SOME SECTIONS SCROLL AND OTHERS DO NOT. `learn` carries seventeen card
 * types — five video formats, a podcast, a blog and nine intelligence formats —
 * against four in `build`. Stacked vertically, a fortnight of optional reading
 * buries the one required course. The rule is not "how many cards" but "what is
 * the card for": a section is a rail when the student is BROWSING and a stack
 * when the card asks for a DECISION. Build, share and advance always ask for a
 * decision, so they never become a rail however few cards they hold.
 */

export type Bucket = 'pre_class' | 'learn' | 'practice' | 'build' | 'reflect' | 'share' | 'advance';

/** The order a week runs in — not the order the buckets happen to be declared. */
export const BUCKET_ORDER: Bucket[] = [
  'pre_class', 'learn', 'practice', 'build', 'share', 'reflect', 'advance',
];

export interface BucketMeta {
  /** Student-facing name. The slug is for us, not for them. */
  label: string;
  /** The question this section answers. Shown beside the heading. */
  question: string;
  /**
   * `rail` scrolls horizontally; `stack` is the existing vertical feed.
   * See the note above — this is about what the card asks of the student.
   */
  layout: 'rail' | 'stack';
  /** What a student sees when the section is empty for this week. */
  empty: string;
}

export const BUCKET_META: Record<Bucket, BucketMeta> = {
  pre_class: {
    label: 'Before class',
    question: 'What do I need to know before we meet?',
    layout: 'stack',
    empty: 'Nothing to read before this week’s class.',
  },
  learn: {
    label: 'Learn',
    question: 'What am I meant to understand this week?',
    layout: 'rail',
    empty: 'No lessons published for this week yet.',
  },
  practice: {
    label: 'Practice',
    question: 'Where do I get reps before it counts?',
    layout: 'rail',
    empty: 'No labs this week — practice is optional and repeatable.',
  },
  build: {
    label: 'Build',
    question: 'What am I shipping into my own project?',
    layout: 'stack',
    empty: 'No build for this week.',
  },
  share: {
    label: 'Share',
    question: 'Who am I doing this with, and what can I show?',
    layout: 'stack',
    empty: 'Nothing waiting on you from your cohort.',
  },
  reflect: {
    label: 'Reflect',
    question: 'What did I actually learn, and what did my cohort do?',
    layout: 'rail',
    empty: 'No reflections this week.',
  },
  advance: {
    label: 'Advance',
    question: 'Am I measurably closer to the credential?',
    layout: 'stack',
    empty: 'Nothing to advance this week.',
  },
};

export interface BucketSection {
  bucket: Bucket;
  meta: BucketMeta;
  cards: TimelineFeedCard[];
}

const isBucket = (value: unknown): value is Bucket =>
  typeof value === 'string' && (BUCKET_ORDER as string[]).includes(value);

/**
 * Group a week's cards into ordered sections.
 *
 * Cards keep the order the feed gave them WITHIN a section — the feed already
 * ranks them and this must not re-sort behind its back.
 *
 * A card whose bucket is missing or unrecognised is NOT dropped. Three of the
 * fifty-three live types have no `bucket_default`, and silently hiding a card
 * because our taxonomy has a hole is the worst available outcome: the student
 * loses work they were assigned and nothing anywhere says so. They fall into
 * `learn`, which is where an unclassified piece of curriculum most likely
 * belongs, and `unbucketed` reports how many did so, so the gap is countable
 * rather than invisible.
 */
export function groupIntoBuckets(
  cards: TimelineFeedCard[],
  opts: { includeEmpty?: boolean } = {},
): { sections: BucketSection[]; unbucketed: number } {
  const byBucket = new Map<Bucket, TimelineFeedCard[]>();
  let unbucketed = 0;

  for (const card of cards) {
    const raw = (card as { bucket?: unknown }).bucket;
    let bucket: Bucket;
    if (isBucket(raw)) {
      bucket = raw;
    } else {
      bucket = 'learn';
      unbucketed += 1;
    }
    const list = byBucket.get(bucket);
    if (list) list.push(card); else byBucket.set(bucket, [card]);
  }

  const sections = BUCKET_ORDER
    .map((bucket) => ({ bucket, meta: BUCKET_META[bucket], cards: byBucket.get(bucket) ?? [] }))
    .filter((s) => (opts.includeEmpty ? true : s.cards.length > 0));

  return { sections, unbucketed };
}

/**
 * How many cards a rail shows before "see all". Rails exist to stop a section
 * burying the week, so an unbounded rail defeats its own purpose.
 */
export const RAIL_VISIBLE = 8;
