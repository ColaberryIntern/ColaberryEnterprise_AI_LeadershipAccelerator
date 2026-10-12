/**
 * Covers request §5 P2-07's named cases — repeated run converges, partial failure resumes,
 * mapping stable, no auto-publication of old private recordings — plus the rule the request
 * states as a principle: quarantine ambiguity rather than guessing by title.
 */
import { planBackfill, renderPlan, type BackfillCandidate } from '../broadcastBackfillPlanner';

const BATCH = 'bf-2026-10-02-001';

const liveSession = (id: string, over: Partial<BackfillCandidate> = {}): BackfillCandidate => ({
  sourceType: 'live_session', sourceId: id,
  sessionDate: '2026-07-23', rawStartTime: '18:30',
  title: 'Build Day', ...over,
});

describe('convergence and stability', () => {
  it('a source that is already linked is SKIPPED, so a re-run is a no-op', () => {
    const plan = planBackfill([liveSession('s1', { existingOccurrenceId: 'occ-1' })], BATCH);
    expect(plan.counts).toMatchObject({ link: 0, skip: 1, quarantine: 0 });
    expect(plan.decisions[0].reason).toBe('already_linked');
  });

  it('running twice produces the same plan — deterministic, so a dry run means something', () => {
    const rows = [liveSession('s1'), liveSession('s2', { sessionDate: '2026-07-30' })];
    expect(JSON.stringify(planBackfill(rows, BATCH))).toBe(JSON.stringify(planBackfill(rows, BATCH)));
  });

  it('a partial run resumes: the rows written last time skip, the rest still link', () => {
    // Simulates a crash after s1 was written. No special resume mode is needed — the
    // existing mapping IS the resume cursor.
    const second = planBackfill([
      liveSession('s1', { existingOccurrenceId: 'occ-1' }),
      liveSession('s2', { sessionDate: '2026-07-30' }),
    ], BATCH);
    expect(second.counts).toMatchObject({ link: 1, skip: 1, quarantine: 0 });
  });

  it('the occurrence key is stable across runs for the same source and instant', () => {
    const a = planBackfill([liveSession('s1')], 'batch-a').decisions[0].occurrenceKey;
    const b = planBackfill([liveSession('s1')], 'batch-b').decisions[0].occurrenceKey;
    expect(a).toBe(b);
  });
});

describe('ambiguity is quarantined, never guessed', () => {
  it('quarantines a row whose start instant could not be derived', () => {
    // convertTo24h would hand back a fabricated 10:00; a backfill must not freeze that into
    // a permanent identity.
    const plan = planBackfill([liveSession('s-bad', { rawStartTime: 'sometime after lunch' })], BATCH);
    expect(plan.decisions[0]).toMatchObject({ action: 'quarantine', reason: 'undetermined_start' });
  });

  it('quarantines a row with no start time at all', () => {
    const plan = planBackfill([liveSession('s-none', { rawStartTime: null })], BATCH);
    expect(plan.decisions[0].action).toBe('quarantine');
  });

  it('quarantines an unknown source type rather than inventing a mapping', () => {
    const plan = planBackfill([{ sourceType: 'mystery' as any, sourceId: 'x' }], BATCH);
    expect(plan.decisions[0]).toMatchObject({ action: 'quarantine', reason: 'unknown_source_type' });
  });

  it('DEDUPES the same source appearing twice with sub-minute jitter', () => {
    // Not an ambiguity — both rows mean the same airing, and the key floors to the minute.
    // Planning two links here would collide on uq_broadcast_occurrence_key at write time.
    const rows: BackfillCandidate[] = [
      { sourceType: 'community_event', sourceId: 'a', startsAt: new Date('2026-07-23T23:30:00Z') },
      { sourceType: 'community_event', sourceId: 'a', startsAt: new Date('2026-07-23T23:30:30Z') },
    ];
    const plan = planBackfill(rows, BATCH);
    expect(plan.counts).toMatchObject({ link: 1, skip: 1, quarantine: 0 });
  });

  it('two different sources sharing an instant are NOT a collision', () => {
    // Worth pinning: occurrenceKeyFor embeds source_type and source_id, so a shared instant
    // alone never collapses two sources. That is also why the planner has no cross-source
    // collision branch - it would be unreachable code.
    const rows: BackfillCandidate[] = [
      { sourceType: 'community_event', sourceId: 'dup', startsAt: new Date('2026-07-23T23:30:00Z') },
      { sourceType: 'community_event', sourceId: 'dup-other', startsAt: new Date('2026-07-23T23:30:00Z') },
    ];
    const plan = planBackfill(rows, BATCH);
    expect(plan.counts.link).toBe(2);
    expect(plan.decisions[0].occurrenceKey).not.toBe(plan.decisions[1].occurrenceKey);
  });

  it('IDENTICAL TITLES ARE IRRELEVANT — two different sources never collapse', () => {
    // The rule the request states: never guess by title. Here the titles are identical and
    // the instants are identical; only the source id differs, and that is enough.
    const rows: BackfillCandidate[] = [
      { sourceType: 'community_event', sourceId: 'evt-1', title: 'Office Hours', startsAt: new Date('2026-07-23T23:30:00Z') },
      { sourceType: 'community_event', sourceId: 'evt-2', title: 'Office Hours', startsAt: new Date('2026-07-23T23:30:00Z') },
    ];
    const plan = planBackfill(rows, BATCH);
    expect(plan.counts.link).toBe(2);
    expect(plan.decisions[0].occurrenceKey).not.toBe(plan.decisions[1].occurrenceKey);
  });

  it('a recurring series under one reused source id stays distinct per episode', () => {
    const rows: BackfillCandidate[] = [
      { sourceType: 'room_booking', sourceId: 'zoom-999', startsAt: new Date('2026-07-23T23:30:00Z') },
      { sourceType: 'room_booking', sourceId: 'zoom-999', startsAt: new Date('2026-07-30T23:30:00Z') },
    ];
    const plan = planBackfill(rows, BATCH);
    expect(plan.counts.link).toBe(2);
  });
});

describe('nothing is published by a backfill', () => {
  it('every linked row is born private and unpublished', () => {
    const plan = planBackfill([
      liveSession('s1'),
      { sourceType: 'open_house_event', sourceId: 'oh-1', startsAt: new Date('2026-07-23T23:30:00Z') },
    ], BATCH);
    for (const d of plan.decisions.filter((x) => x.action === 'link')) {
      expect(d.proposed).toEqual({ access_mode: 'private', editorial_state: 'ended' });
    }
  });

  it('NEVER proposes replay_ready or a public access mode — the retroactive-publication guard', () => {
    // A backfill that defaulted to free+replay_ready would publish years of private cohort
    // sessions to everyone in one command.
    const plan = planBackfill([liveSession('s1'), liveSession('s2', { sessionDate: '2026-08-01' })], BATCH);
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain('replay_ready');
    expect(serialized).not.toContain('"free"');
    expect(serialized).not.toContain('"preview"');
  });
});

describe('renderPlan', () => {
  it('surfaces quarantine reasons rather than only a success count', () => {
    const plan = planBackfill([
      liveSession('s1'),
      liveSession('s-bad', { rawStartTime: 'whenever' }),
      liveSession('s-linked', { existingOccurrenceId: 'occ-9' }),
    ], BATCH);
    const text = renderPlan(plan);
    expect(text).toContain('link:       1');
    expect(text).toContain('undetermined_start: 1');
    expect(text).toContain('Nothing is published by this operation.');
  });

  it('states the batch id, which is how a bad run is reversed', () => {
    expect(renderPlan(planBackfill([], BATCH))).toContain(BATCH);
  });
});
