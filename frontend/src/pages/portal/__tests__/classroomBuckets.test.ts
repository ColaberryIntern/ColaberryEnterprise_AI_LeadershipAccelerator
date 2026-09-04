/**
 * Grouping the week into the platform's own buckets.
 *
 * The behaviour worth guarding is not "does it group" — it is what happens at
 * the edges: a card with no bucket must not vanish, the feed's own ordering
 * must survive, and the section order must be the order a week runs rather than
 * whatever order the cards arrived in.
 */
import {
  groupIntoBuckets, BUCKET_ORDER, BUCKET_META, RAIL_VISIBLE, Bucket,
} from '../classroomBuckets';

const card = (id: string, bucket?: string) =>
  ({ id, bucket, title: id, type: 't', student_label: 't', render_band: 'b', status: 'available' } as any);

describe('groupIntoBuckets', () => {
  it('orders sections the way a week runs, not the order cards arrive in', () => {
    const { sections } = groupIntoBuckets([
      card('a', 'advance'), card('b', 'pre_class'), card('c', 'build'), card('d', 'learn'),
    ]);
    expect(sections.map((s) => s.bucket)).toEqual(['pre_class', 'learn', 'build', 'advance']);
  });

  it('keeps the feed’s own order WITHIN a section', () => {
    // The feed already ranks cards; regrouping must not quietly re-sort them.
    const { sections } = groupIntoBuckets([
      card('first', 'learn'), card('second', 'learn'), card('third', 'learn'),
    ]);
    expect(sections[0].cards.map((c) => c.id)).toEqual(['first', 'second', 'third']);
  });

  it('does NOT drop a card whose bucket is missing — it shows under Learn and is counted', () => {
    // Three of the 53 live types carry no bucket_default. Hiding a student's
    // assigned work because our taxonomy has a hole is the worst outcome here.
    const { sections, unbucketed } = groupIntoBuckets([card('orphan'), card('known', 'build')]);
    expect(unbucketed).toBe(1);
    const learn = sections.find((s) => s.bucket === 'learn');
    expect(learn?.cards.map((c) => c.id)).toEqual(['orphan']);
  });

  it('treats an unrecognised bucket the same way as a missing one', () => {
    const { sections, unbucketed } = groupIntoBuckets([card('weird', 'not_a_bucket')]);
    expect(unbucketed).toBe(1);
    expect(sections.find((s) => s.bucket === 'learn')?.cards).toHaveLength(1);
  });

  it('hides empty sections by default and shows them when asked', () => {
    const cards = [card('a', 'build')];
    expect(groupIntoBuckets(cards).sections.map((s) => s.bucket)).toEqual(['build']);
    expect(groupIntoBuckets(cards, { includeEmpty: true }).sections).toHaveLength(BUCKET_ORDER.length);
  });

  it('boundary: an empty week produces no sections and no error', () => {
    expect(groupIntoBuckets([])).toEqual({ sections: [], unbucketed: 0 });
  });

  it('never loses a card', () => {
    const cards = [
      card('1', 'learn'), card('2', 'build'), card('3'), card('4', 'share'),
      card('5', 'reflect'), card('6', 'advance'), card('7', 'practice'), card('8', 'pre_class'),
    ];
    const { sections } = groupIntoBuckets(cards);
    const total = sections.reduce((n, s) => n + s.cards.length, 0);
    expect(total).toBe(cards.length);
  });
});

describe('bucket metadata', () => {
  it('covers every bucket the backend model defines', () => {
    // TimelineBucket in models/TimelineCard.ts. A bucket with no metadata would
    // render as a section with no name.
    const backendBuckets: Bucket[] = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'];
    for (const b of backendBuckets) {
      expect(BUCKET_ORDER).toContain(b);
      expect(BUCKET_META[b]?.label).toBeTruthy();
      expect(BUCKET_META[b]?.question).toBeTruthy();
      expect(BUCKET_META[b]?.empty).toBeTruthy();
    }
    expect(BUCKET_ORDER).toHaveLength(backendBuckets.length);
  });

  it('rails are the browsing sections; decisions are never a rail', () => {
    // The rule is about what the card asks of the student, not how many there
    // are — build has four types and must still never scroll sideways.
    expect(BUCKET_META.learn.layout).toBe('rail');
    expect(BUCKET_META.practice.layout).toBe('rail');
    expect(BUCKET_META.reflect.layout).toBe('rail');
    expect(BUCKET_META.build.layout).toBe('stack');
    expect(BUCKET_META.share.layout).toBe('stack');
    expect(BUCKET_META.advance.layout).toBe('stack');
    expect(BUCKET_META.pre_class.layout).toBe('stack');
  });

  it('a rail caps what it shows, or it defeats its own purpose', () => {
    expect(RAIL_VISIBLE).toBeGreaterThan(0);
    expect(RAIL_VISIBLE).toBeLessThan(20);
  });
});
