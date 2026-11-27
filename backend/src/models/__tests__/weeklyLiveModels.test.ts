import { WeeklyLiveContentPiece, WeeklyLiveDemand, WeeklyLiveMoment, WeeklyLivePlan, WeeklyLiveSignal, WeeklyLiveTopic } from '../WeeklyLive';

/**
 * Every model sends every column it declares (2026-11-27: a column definition shared by several columns
 * kept only the first, so a topic save left out viral, convert and topic_score, and signals lost
 * fits_weeks). This runs without a database: it checks what Sequelize would put in an INSERT.
 */
type Attrs = Readonly<Record<string, object>>;
/** Each model's attributes, read once per model so the union of model types never reaches getAttributes. */
const MODELS: Record<string, () => Attrs> = {
  WeeklyLivePlan: () => WeeklyLivePlan.getAttributes(), WeeklyLiveSignal: () => WeeklyLiveSignal.getAttributes(), WeeklyLiveDemand: () => WeeklyLiveDemand.getAttributes(),
  WeeklyLiveTopic: () => WeeklyLiveTopic.getAttributes(), WeeklyLiveContentPiece: () => WeeklyLiveContentPiece.getAttributes(), WeeklyLiveMoment: () => WeeklyLiveMoment.getAttributes(),
};

it.each(Object.entries(MODELS))('%s: every attribute is its own column with its own name', (_name, read) => {
  const attrs = read();
  for (const [key, a] of Object.entries(attrs)) expect([key, (a as { fieldName?: string }).fieldName]).toEqual([key, key]);
  const objects = Object.values(attrs);
  expect(new Set(objects).size).toBe(objects.length);
});

it('a topic build carries all four scores and a signal carries its weeks', () => {
  const t = WeeklyLiveTopic.build({ plan_id: 'p', rank: 1, week: 3, title: 'T', teach: 88, viral: 85, convert: 91, topic_score: 87.4, factors: [1] });
  expect(Object.keys(t.get({ plain: true }))).toEqual(expect.arrayContaining(['teach', 'viral', 'convert', 'topic_score', 'factors']));
  const s = WeeklyLiveSignal.build({ plan_id: 'p', headline: 'h', url: 'u', factors: [1], fits_weeks: [3, 8] });
  expect(s.get('fits_weeks')).toEqual([3, 8]);
});
