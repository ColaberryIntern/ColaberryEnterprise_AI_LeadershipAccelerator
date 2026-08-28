const queryMock = jest.fn();
jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import {
  syncTimelineCards,
  retireMissingCards,
  stageTagForWeek,
  priorityForBucket,
} from '../syncTimelineCards';

/**
 * EPIC 5 T003.
 *
 * WHAT THESE TESTS DO NOT PROVE. A mock cannot tell you whether the SQL is
 * valid, whether `ON CONFLICT` infers the partial index, or whether the upsert
 * is actually idempotent — four defects this programme has already paid for came
 * from a mock encoding an assumption about the driver rather than the driver's
 * behaviour. Those properties were verified by running the exact statements
 * against production inside a rolled-back transaction:
 *
 *   projection  -> 585 rows, 0 without a title, 47 activation / 206 learning / 332 evergreen
 *   upsert x2   -> 1 row, second run updated the title, created_at unchanged
 *   no predicate-> ERROR 42P10, so the naive form cannot ship silently
 *
 * What follows tests the mapping logic and the refusals, which is what a mock
 * can honestly speak to.
 */

const card = (over: Record<string, unknown> = {}) => ({
  id: 'card-1',
  title: 'Welcome to Your Free AI Preview',
  subtitle: 'Start here',
  description: 'A much longer rendered description',
  week: 0,
  bucket: 'pre_class',
  priority: 10,
  release_date: null,
  type_tags: ['self-study', 'foundations'],
  type_category: 'Announce',
  ...over,
});

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

/** First call is the SELECT; every later call is an upsert. */
function givenCards(rows: unknown[]) {
  queryMock.mockImplementation((sql: string) => {
    if (String(sql).includes('SELECT')) return Promise.resolve(rows);
    return Promise.resolve([[], 1]);
  });
}

describe('week becomes a stage tag', () => {
  it.each([
    [0, 'activation'],
    [1, 'activation'],
    [2, 'learning'],
    [12, 'learning'],
  ])('week %p -> %s', (week, tag) => {
    expect(stageTagForWeek(week as number)).toBe(tag);
  });

  it('treats an undated card as evergreen, not as week zero', () => {
    // 332 of 585 published cards have no week. Defaulting them to `activation`
    // would flood the first-step purpose with unrelated material; defaulting to
    // `learning` would hide them from newcomers. Undated means it travels.
    expect(stageTagForWeek(null)).toBe('evergreen');
    expect(stageTagForWeek(undefined as unknown as null)).toBe('evergreen');
  });
});

describe('a card becomes a pointer, not a copy', () => {
  it('writes a portal URL rather than any message body', () => {
    // The registry has no body column, by design: the campaign engine renders
    // copy at send time. This asset points AT content; it does not contain it.
    givenCards([card()]);
    return syncTimelineCards().then(() => {
      const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'));
      expect(upsert![1].replacements.url).toBe('/portal/runtime/card-1');
    });
  });

  it('prefers the subtitle over the long description for the summary', async () => {
    givenCards([card()]);
    await syncTimelineCards();
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'));
    expect(upsert![1].replacements.summary).toBe('Start here');
  });

  it('falls back to a truncated description when there is no subtitle', async () => {
    givenCards([card({ subtitle: null, description: 'x'.repeat(900) })]);
    await syncTimelineCards();
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'));
    expect(upsert![1].replacements.summary).toHaveLength(500);
  });

  it('carries provenance on every row', async () => {
    // source_system + source_id are what make the rollback precise and the
    // projection auditable back to the real record.
    givenCards([card()]);
    await syncTimelineCards();
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'));
    expect(upsert![1].replacements.source_system).toBe('timeline_cards');
    expect(upsert![1].replacements.source_id).toBe('card-1');
  });

  it('builds topic tags from the type, lowercasing the category', async () => {
    givenCards([card()]);
    await syncTimelineCards();
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'));
    expect(upsert![1].replacements.topic_tags).toBe('{"self-study","foundations","announce"}');
  });

  it('survives a type with no tags at all', async () => {
    // Most types have `[]`. An empty tag list is a missing topic signal, not an
    // error, and the resolver treats absent affinity as no preference.
    givenCards([card({ type_tags: [], type_category: null })]);
    await syncTimelineCards();
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'));
    expect(upsert![1].replacements.topic_tags).toBe('{}');
  });
});

describe('what it refuses to write', () => {
  it('skips a card with no title, and says why', async () => {
    // `title` is NOT NULL. Writing "Untitled" would create a row that can be
    // selected and cited — a placeholder is worse than an absence here.
    givenCards([card({ title: '   ' })]);
    const result = await syncTimelineCards();
    expect(result.written).toBe(0);
    expect(result.skipped).toEqual([{ source_id: 'card-1', reason: 'no title' }]);
  });

  it('reports skips rather than swallowing them', async () => {
    givenCards([card(), card({ id: 'card-2', title: '' })]);
    const result = await syncTimelineCards();
    expect(result.scanned).toBe(2);
    expect(result.written).toBe(1);
    expect(result.skipped).toHaveLength(1);
  });
});

describe('the projection query only reaches publishable content', () => {
  it('filters on card visibility AND the type being feed-eligible', async () => {
    givenCards([]);
    await syncTimelineCards();
    const select = String(queryMock.mock.calls[0][0]);
    expect(select).toContain("tc.visibility = 'published'");
    expect(select).toContain("tc.status = 'active'");
    expect(select).toContain('ctd.today_eligible = true');
    expect(select).toContain('ctd.is_active = true');
  });

  it('restates the partial-index predicate in the upsert', async () => {
    // Without `WHERE source_id IS NOT NULL` Postgres raises 42P10 — verified
    // against production. This assertion is what stops the predicate being
    // "tidied away" by someone who does not know the index is partial.
    givenCards([card()]);
    await syncTimelineCards();
    const upsert = String(queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'))![0]);
    expect(upsert).toContain('ON CONFLICT (source_system, source_id) WHERE source_id IS NOT NULL');
  });

  it('does not touch created_at when a row already exists', async () => {
    givenCards([card()]);
    await syncTimelineCards();
    const upsert = String(queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'))![0]);
    const doUpdate = upsert.slice(upsert.indexOf('DO UPDATE'));
    expect(doUpdate).not.toContain('created_at');
  });
});

describe('retiring is deactivation, and it cannot run away', () => {
  it('refuses to retire anything when the scan returned nothing', async () => {
    // An empty scan means the sync failed to reach the source, not that all 585
    // cards were unpublished. Retiring on that reading would empty the registry.
    const n = await retireMissingCards([]);
    expect(n).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('deactivates rather than deletes, and only rows this sync owns', async () => {
    queryMock.mockResolvedValue([[], 3]);
    await retireMissingCards(['a', 'b']);
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('SET active = false');
    expect(sql).not.toContain('DELETE');
    expect(sql).toContain('source_system = :source_system');
  });

  it('never touches human-seeded rows', async () => {
    // Those carry a null source_id and are exempt by design; a sync that
    // deleted them would destroy work nobody could recover.
    queryMock.mockResolvedValue([[], 0]);
    await retireMissingCards(['a']);
    expect(String(queryMock.mock.calls[0][0])).toContain('source_id IS NOT NULL');
  });
});

describe('bucket decides priority, because nothing else can', () => {
  it('ranks pre_class above learn — the whole point of this change', () => {
    // The first production run resolved activation_first_step to "Session 1
    // Evaluation" for 134 dormant learners. Every published card has
    // priority 0, so ORDER BY priority DESC was inert and an evaluation form
    // won the slot meant for someone who has never engaged.
    expect(priorityForBucket('pre_class')).toBeGreaterThan(priorityForBucket('learn'));
  });

  it('orders the buckets the way a learner meets them', () => {
    const order = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'];
    const values = order.map(priorityForBucket);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(new Set(values).size).toBe(order.length); // no accidental ties
  });

  it('gives an unknown bucket no opinion rather than the front of the queue', () => {
    // 50 is the column default. Below learn, above reflect: a bucket nobody has
    // ranked is unremarkable, not promoted and not buried.
    expect(priorityForBucket('some_new_bucket')).toBe(50);
    expect(priorityForBucket('some_new_bucket')).toBeLessThan(priorityForBucket('learn'));
    expect(priorityForBucket('some_new_bucket')).toBeGreaterThan(priorityForBucket('reflect'));
  });

  it('survives a null bucket without crashing the whole sync', () => {
    expect(priorityForBucket(null)).toBe(50);
    expect(priorityForBucket(undefined)).toBe(50);
  });

  it('writes the derived priority, NOT the one stored on the card', async () => {
    // timeline_cards.priority is 0 on all 585 published cards, so it carries no
    // signal. The fixture sets 10 to prove that value is ignored.
    givenCards([card({ bucket: 'pre_class', priority: 10 })]);
    await syncTimelineCards();
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT'));
    expect(upsert![1].replacements.priority).toBe(90);
  });

  it('reads the bucket in the projection query', async () => {
    givenCards([]);
    await syncTimelineCards();
    expect(String(queryMock.mock.calls[0][0])).toContain('tc.bucket');
  });

  it('would now pick a pre_class card over a learn card of the same stage', async () => {
    // The regression, expressed as the ranking it produces.
    const welcome = priorityForBucket('pre_class');
    const evaluation = priorityForBucket('learn');
    expect(welcome).toBeGreaterThan(evaluation);
  });
});
