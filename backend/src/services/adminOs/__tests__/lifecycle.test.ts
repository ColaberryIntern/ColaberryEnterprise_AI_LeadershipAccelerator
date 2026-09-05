import {
  LIFECYCLE,
  LIFECYCLE_ORDER,
  LIFECYCLE_STAGES,
  joinableStages,
  unjoinableStages,
} from '../lifecycle';

describe('lifecycle vocabulary', () => {
  it('defines every declared stage exactly once', () => {
    expect(Object.keys(LIFECYCLE).sort()).toEqual([...LIFECYCLE_STAGES].sort());
    expect(new Set(LIFECYCLE_STAGES).size).toBe(LIFECYCLE_STAGES.length);
  });

  it('keys each definition to its own stage', () => {
    // A copy-paste slip here would silently mislabel a funnel step.
    for (const [key, def] of Object.entries(LIFECYCLE)) {
      expect(def.stage).toBe(key);
    }
  });

  it('gives every stage the record that proves it', () => {
    // The whole point of the module: a stage is evidenced, not asserted. The
    // chat_conversations.status defect — 'active' on 100% of rows because nothing
    // maintained it — is what an unevidenced stage looks like in production.
    for (const def of Object.values(LIFECYCLE)) {
      expect(def.evidence.trim().length).toBeGreaterThan(0);
      expect(def.definition.trim().length).toBeGreaterThan(0);
    }
  });

  it('requires a documented gap wherever a stage cannot be joined today', () => {
    for (const def of Object.values(LIFECYCLE)) {
      if (!def.joinable_today) {
        expect(def.gap && def.gap.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('records that enrolment cannot yet be joined to acquisition', () => {
    // This is a fact about the schema, not a preference. enrollments carries no
    // lead/visitor/person foreign key. If someone adds one and flips this flag,
    // this test should be updated deliberately — not discovered by a wrong chart.
    expect(LIFECYCLE.enrolled_student.joinable_today).toBe(false);
    expect(LIFECYCLE.active_learner.joinable_today).toBe(false);
  });

  it('partitions stages into joinable and unjoinable with nothing lost', () => {
    const joinable = joinableStages();
    const unjoinable = unjoinableStages().map((u) => u.stage);
    expect([...joinable, ...unjoinable].sort()).toEqual([...LIFECYCLE_STAGES].sort());
    expect(joinable.filter((s) => unjoinable.includes(s))).toEqual([]);
  });

  it('orders the funnel from anonymous through returning customer', () => {
    expect(LIFECYCLE_ORDER[0]).toBe('anonymous_visitor');
    expect(LIFECYCLE_ORDER[LIFECYCLE_ORDER.length - 1]).toBe('returning_customer');
    // Lead must precede enrolment, or a ribbon renders the funnel backwards.
    expect(LIFECYCLE_ORDER.indexOf('lead')).toBeLessThan(
      LIFECYCLE_ORDER.indexOf('enrolled_student'),
    );
  });
});
