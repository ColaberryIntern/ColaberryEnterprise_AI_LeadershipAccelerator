import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { allWeeks } from '../../../data/canonicalCourse';
import { WeeklyLiveTopic } from '../../../models/WeeklyLive';
import { askAi, type AskAi } from '../aiCall';
import { reserveFor } from '../modelPrices';
import { label, promotionSlots } from './briefCalendar';
import { BRIEF_WRITER_SYSTEM, briefWriterPrompt } from './briefPrompts';
import { BRIEF_JSON_SCHEMA, BriefCopySchema, briefIssues, type BriefCopy } from './briefSchema';

/**
 * Write the brief's copy (WL4.4): one strict-schema call plus one repair round that hands back every
 * problem. Throws BriefRejected (with the problems) when the repair still breaks a rule; askAi's own
 * failures (timeout, budget) pass through for the caller to record.
 */
export const BRIEF_MODEL = process.env.WEEKLY_LIVE_BRIEF_MODEL || 'gpt-6.2-sol';
const MAX_TOKENS = 8_000;

export interface WriterCtx { planId: string; topicId: string; airDate: string; }

export async function writeCopy(c: WriterCtx, writtenOn: string, ask: AskAi = askAi): Promise<BriefCopy> {
  const topic = await WeeklyLiveTopic.findOne({ where: { id: c.topicId, plan_id: c.planId } });
  if (!topic) throw Object.assign(new Error('The chosen topic is no longer in this plan.'), { name: 'NotFound' });
  const [bp] = await sequelize.query<{ promise: string | null }>("SELECT blueprint->>'promise' AS promise FROM weekly_live_blueprints WHERE plan_id = :p AND topic_id = :t AND status = 'ready'",
    { replacements: { p: c.planId, t: c.topicId }, type: QueryTypes.SELECT });
  const slots = promotionSlots(writtenOn, c.airDate);
  const ids = slots.filter((s) => s.who === 'Jackie').map((s) => s.id);
  const input = {
    title: topic.title, airLabel: label(c.airDate), week: topic.week, weekTheme: allWeeks().find((w) => w.week_number === topic.week)?.theme ?? '',
    spin: topic.spin, promise: bp?.promise ?? null, hooks: topic.hooks.map((h) => h.text), parody: topic.parody, slots,
  };
  let problems: string[] = [];
  for (let round = 1; round <= 2; round++) {
    const raw = await ask({ planId: c.planId, purpose: 'brief_write', model: BRIEF_MODEL, system: BRIEF_WRITER_SYSTEM, user: briefWriterPrompt(input, problems), schema: BRIEF_JSON_SCHEMA, maxTokens: MAX_TOKENS, reserveUsd: reserveFor(BRIEF_MODEL, MAX_TOKENS, MAX_TOKENS) });
    problems = briefIssues(raw, ids);
    if (!problems.length) return BriefCopySchema.parse(raw);
  }
  throw Object.assign(new Error(`The brief broke ${problems.length} rule(s). First: ${problems[0]}`), { name: 'BriefRejected', problems });
}
