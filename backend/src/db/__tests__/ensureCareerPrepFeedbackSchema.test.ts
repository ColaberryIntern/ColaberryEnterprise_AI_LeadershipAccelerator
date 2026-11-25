jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
import { ensureCareerPrepFeedbackSchema, PREP_FEEDBACK_STATEMENTS, resetCareerPrepFeedbackSchema } from '../ensureCareerPrepFeedbackSchema';

beforeEach(() => resetCareerPrepFeedbackSchema());

it('only creates, never alters or drops', () => {
  for (const s of PREP_FEEDBACK_STATEMENTS) {
    expect(s).toMatch(/IF NOT EXISTS/);
    expect(s).not.toMatch(/\b(DROP|ALTER|TRUNCATE)\b/i);
  }
});
it('runs once per process, and tries again after a failure', async () => {
  const run = jest.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue(undefined);
  await expect(ensureCareerPrepFeedbackSchema(run)).rejects.toThrow('db');
  await ensureCareerPrepFeedbackSchema(run);
  await ensureCareerPrepFeedbackSchema(run);
  expect(run).toHaveBeenCalledTimes(1 + PREP_FEEDBACK_STATEMENTS.length);
});
