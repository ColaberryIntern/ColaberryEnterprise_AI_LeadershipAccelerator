import {
  ensureTodayCardEventsSchema, TODAY_CARD_EVENT_STATEMENTS, __resetTodayCardEventsSchemaForTests,
} from '../ensureTodayCardEventsSchema';

beforeEach(() => __resetTodayCardEventsSchemaForTests());

it('creates the table and index once per process, every statement idempotent', async () => {
  const run = jest.fn().mockResolvedValue(undefined);
  await Promise.all([ensureTodayCardEventsSchema(run), ensureTodayCardEventsSchema(run)]);
  await ensureTodayCardEventsSchema(run);
  expect(run).toHaveBeenCalledTimes(TODAY_CARD_EVENT_STATEMENTS.length);
  for (const s of TODAY_CARD_EVENT_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
});

it('keeps one row per learner, card, event and source, and only the two known events and doors', () => {
  const create = TODAY_CARD_EVENT_STATEMENTS[0];
  expect(create).toContain('UNIQUE (enrollment_id, ref, event, source)');
  expect(create).toContain("CHECK (event IN ('seen', 'open'))");
  expect(create).toContain("CHECK (source IN ('feed', 'banner'))");
});

it('retries on the next call after a failed run', async () => {
  const run = jest.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
  await expect(ensureTodayCardEventsSchema(run)).rejects.toThrow('db down');
  await expect(ensureTodayCardEventsSchema(run)).resolves.toBeUndefined();
  expect(run).toHaveBeenCalledTimes(1 + TODAY_CARD_EVENT_STATEMENTS.length);
});
