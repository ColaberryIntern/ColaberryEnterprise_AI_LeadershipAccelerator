import {
  ACTION_TYPES,
  contentQuerySchema,
  decisionParamsSchema,
  decisionsQuerySchema,
  DEFAULT_LIMIT,
  distributionQuerySchema,
  isoDaySchema,
  learnerParamsSchema,
  learnerSeriesQuerySchema,
  learnersQuerySchema,
  MAX_LIMIT,
  OVERLAYS,
  PRIMARY_STATES,
  shadowQuerySchema,
} from '../explorerGrowthSchema';

/**
 * The Command Center's input contracts.
 *
 * The rule under test throughout is REJECT, DO NOT COERCE. Most of these
 * assertions are therefore about what the schema REFUSES, because every one of
 * these inputs has a plausible "helpful" repair that would produce a confidently
 * wrong answer instead of an error.
 *
 * Zod 4 exposes failures on `error.issues` (not `.errors`), so that is what the
 * message assertions read.
 */

/** Convenience: the first failure message, or '' if the parse unexpectedly passed. */
function whyRejected(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? '' : (result.error?.issues[0]?.message ?? '');
}

describe('limit is rejected above the cap, never clamped', () => {
  it('REJECTS limit=500 — the assertion this task exists for', () => {
    // Clamping to 200 would answer a different question than the caller asked,
    // and nothing in the response would say so: they would conclude there are
    // only 200 learners. An error is the honest answer.
    const r = learnersQuerySchema.safeParse({ limit: '500' });
    expect(r.success).toBe(false);
    expect(whyRejected(r)).toContain('at most 200');
  });

  it('accepts the cap exactly', () => {
    const r = learnersQuerySchema.safeParse({ limit: String(MAX_LIMIT) });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(MAX_LIMIT);
  });

  it('REJECTS limit=0 rather than raising it to 1', () => {
    expect(learnersQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('defaults to 50 when absent, without inventing an offset either', () => {
    const r = learnersQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(DEFAULT_LIMIT);
      expect(r.data.offset).toBe(0);
    }
  });

  it('parses a well-formed numeric string into a number', () => {
    const r = learnersQuerySchema.safeParse({ limit: '25', offset: '100' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(25);
      expect(r.data.offset).toBe(100);
    }
  });

  it.each(['', 'abc', '50.5', '-1', ' 50', '1e3', 'null'])(
    'REJECTS limit=%p instead of repairing it',
    (bad) => {
      // Each of these has a tempting repair. `z.coerce.number()` would turn ''
      // into 0 and '50.5' into 50.5; parseInt would turn '50.5' into 50 and
      // '1e3' into 1. All of them are silent substitutions.
      expect(learnersQuerySchema.safeParse({ limit: bad }).success).toBe(false);
    },
  );
});

describe('identifiers are rejected, not passed through to a query', () => {
  it('accepts a real uuid', () => {
    const id = '3f7c1e90-2b4a-4d55-9a1e-6c8b0d2f4a71';
    const r = learnerParamsSchema.safeParse({ enrollmentId: id });
    expect(r.success).toBe(true);
  });

  it.each(['garbage', '', '123', "'; DROP TABLE enrollments; --", '3f7c1e90-2b4a-4d55-9a1e'])(
    'REJECTS learner id %p',
    (bad) => {
      // Left unchecked this reaches `WHERE enrollment_id = <bad>`, returns no
      // rows, and the route reports 404 — which reads as "no such learner"
      // rather than "that is not a learner id".
      expect(learnerParamsSchema.safeParse({ enrollmentId: bad }).success).toBe(false);
    },
  );

  it('keeps the decision id separate from the learner id', () => {
    // /decisions/:id takes a DECISION id. Same format, different entity — the
    // message has to name the right one or it sends the reader to the wrong table.
    const r = decisionParamsSchema.safeParse({ id: 'nope' });
    expect(r.success).toBe(false);
    expect(whyRejected(r)).toContain('decision');
  });
});

describe('the date must be a real calendar day', () => {
  it('accepts a real day', () => {
    expect(isoDaySchema.safeParse('2026-09-02').success).toBe(true);
  });

  it('REJECTS 2026-02-30, which passes the shape check', () => {
    // The regex alone accepts this. Without the round-trip it becomes a Date
    // that rolls forward to March 2nd and silently queries the wrong day.
    const r = isoDaySchema.safeParse('2026-02-30');
    expect(r.success).toBe(false);
    expect(whyRejected(r)).toContain('real calendar day');
  });

  it.each(['2026-13-01', '2026-00-10', '26-09-02', '2026-9-2', '2026/09/02', 'today', ''])(
    'REJECTS %p',
    (bad) => {
      expect(isoDaySchema.safeParse(bad).success).toBe(false);
    },
  );

  it('rejects a full timestamp — this filter is a DAY', () => {
    expect(isoDaySchema.safeParse('2026-09-02T00:00:00Z').success).toBe(false);
  });
});

describe('enum filters accept only real members', () => {
  it.each(PRIMARY_STATES)('accepts state %s', (state) => {
    expect(learnersQuerySchema.safeParse({ state }).success).toBe(true);
  });

  it.each(OVERLAYS)('accepts overlay %s', (overlay) => {
    expect(learnersQuerySchema.safeParse({ overlay }).success).toBe(true);
  });

  it.each(ACTION_TYPES)('accepts action %s', (action) => {
    expect(decisionsQuerySchema.safeParse({ action }).success).toBe(true);
  });

  it.each(['ACTIVE', 'active_learner', 'CONVERTED_LEARNER', ''])(
    'REJECTS state %p',
    (bad) => {
      // Case matters: the column stores the uppercase form, so 'active_learner'
      // would match nothing and read as "no learners in that state".
      expect(learnersQuerySchema.safeParse({ state: bad }).success).toBe(false);
    },
  );

  it('REJECTS an overlay that is really a state', () => {
    expect(learnersQuerySchema.safeParse({ overlay: 'CONVERTED' }).success).toBe(false);
  });
});

describe('booleans are parsed, not truth-tested', () => {
  it('reads "false" as false', () => {
    // `Boolean("false")` is true. That single mistake inverts the filter and
    // shows executed decisions to someone who asked for the un-executed ones.
    const r = decisionsQuerySchema.safeParse({ executed: 'false' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.executed).toBe(false);
  });

  it('reads "true" as true', () => {
    const r = decisionsQuerySchema.safeParse({ executed: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.executed).toBe(true);
  });

  it.each(['1', '0', 'yes', 'TRUE', ''])('REJECTS executed=%p', (bad) => {
    expect(decisionsQuerySchema.safeParse({ executed: bad }).success).toBe(false);
  });
});

describe('score bands stay inside 0-100 and in the right order', () => {
  it.each(['101', '-1', '1.5'])('REJECTS e_min=%p', (bad) => {
    expect(learnersQuerySchema.safeParse({ e_min: bad }).success).toBe(false);
  });

  it('accepts the boundaries', () => {
    expect(learnersQuerySchema.safeParse({ e_min: '0', e_max: '100' }).success).toBe(true);
  });

  it('REJECTS an inverted range rather than returning nothing', () => {
    // e_min=80 with e_max=20 matches no learner. Silently returning an empty
    // list looks identical to "no learners are that engaged" — a false finding
    // rather than a visible mistake.
    const r = learnersQuerySchema.safeParse({ e_min: '80', e_max: '20' });
    expect(r.success).toBe(false);
    expect(whyRejected(r)).toContain('cannot exceed');
  });

  it('allows an equal range', () => {
    expect(learnersQuerySchema.safeParse({ e_min: '50', e_max: '50' }).success).toBe(true);
  });
});

describe('search is bounded', () => {
  it('trims and accepts a normal term', () => {
    const r = learnersQuerySchema.safeParse({ search: '  ada  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.search).toBe('ada');
  });

  it('REJECTS a blank search and an over-long one', () => {
    expect(learnersQuerySchema.safeParse({ search: '   ' }).success).toBe(false);
    expect(learnersQuerySchema.safeParse({ search: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('unknown query keys are refused', () => {
  it.each([
    ['learners', learnersQuerySchema],
    ['decisions', decisionsQuerySchema],
    ['shadow', shadowQuerySchema],
    ['content', contentQuerySchema],
    ['distribution', distributionQuerySchema],
    ['series', learnerSeriesQuerySchema],
  ])('%s rejects an unrecognised parameter', (_name, schema) => {
    // A typo'd filter that is silently ignored returns an unfiltered list that
    // looks like a filtered one. Strict mode makes the typo visible.
    expect(schema.safeParse({ limitt: '10' }).success).toBe(false);
  });
});

describe('the trend windows have documented defaults and real bounds', () => {
  it('distribution defaults to 30 days and series to 90', () => {
    const d = distributionQuerySchema.safeParse({});
    const s = learnerSeriesQuerySchema.safeParse({});
    expect(d.success && d.data.days).toBe(30);
    expect(s.success && s.data.days).toBe(90);
  });

  it.each(['0', '366', 'abc'])('REJECTS days=%p', (bad) => {
    expect(distributionQuerySchema.safeParse({ days: bad }).success).toBe(false);
  });
});
