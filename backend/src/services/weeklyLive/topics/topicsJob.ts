import { sequelize } from '../../../config/database';
import { WeeklyLiveSignal, WeeklyLiveTopic } from '../../../models/WeeklyLive';
import { askAi, reserveFor, type AskAi } from '../aiCall';
import { curriculumMap } from '../curriculumMap';
import { latestDemand } from '../demand/demandJob';
import { shiftDays } from '../signals/signalsJob';
import { judgePrompt, judgeSystem, writerPrompt, WRITER_SYSTEM, type TopicsInput } from './topicPrompts';
import { openWeeks, rankTopics, TOPIC_COUNT, type RankContext, type RankedTopic } from './topicRanking';
import { DRAFTS_JSON_SCHEMA, JUDGMENTS_JSON_SCHEMA, pairJudgments, parseDrafts, type CandidateTopic } from './topicSchema';

/**
 * The topic generator (WL3.3): signals, demand and the curriculum map in, exactly five ranked topics out.
 * Two separate AI calls, because a writer that scores itself inflates (a 16 point jump on 2026-11-25 from
 * prompt wording alone): the writer drafts, the judge scores blind. One more round only when fewer than
 * five usable topics came back.
 *
 * Failure modes: still fewer than five throws and keeps the previous topics; over the cap throws
 * BudgetExceeded. Rows are replaced in one transaction. Regenerating is the recovery path. Not handled:
 * whether a parody resembles a real person. The prompt forbids it; a person decides.
 */
export const WRITER_MODEL = process.env.WEEKLY_LIVE_TOPIC_MODEL || 'gpt-6.2-sol';
export const JUDGE_MODEL = process.env.WEEKLY_LIVE_JUDGE_MODEL || 'gpt-6.2-sol';
const MAX_TOKENS = 25_000;
const ROUNDS = 2;

export interface TopicsResult { topics: RankedTopic[]; recommendedRank: number | null; rejected: string[]; rounds: number; }

export async function runTopics(input: TopicsInput, ask: AskAi = askAi): Promise<TopicsResult> {
  const [rows, demandRows, map] = await Promise.all([
    WeeklyLiveSignal.findAll({ where: { plan_id: input.planId, dropped_reason: null }, order: [['published_at', 'DESC'], ['url', 'ASC']] }),
    latestDemand(), curriculumMap(shiftDays(input.airDate, -1)), // the class being planned has not been taught yet
  ]);
  const signals = rows.map((r, i) => ({ id: r.id, ref: `S${i + 1}`, published_at: r.published_at, factors: r.factors, text: `(${r.published_at || 'date unconfirmed'}; factors ${r.factors.join(',')}; fits weeks ${r.fits_weeks.join(',') || 'any'}) ${r.headline}. ${r.publisher || ''}` }));
  const demand = demandRows.map((d) => ({ week: d.week, score: d.score, multiple: d.multiple === null ? null : Number(d.multiple), thin_median: d.thin_median }));
  const ctx: RankContext = { airDate: input.airDate, proofGiven: Boolean(input.inputs.proof?.trim()), signals, demand, map };
  const weeks = openWeeks(map, input.inputs.week);

  const good: CandidateTopic[] = []; const rejected: string[] = [];
  const call = (purpose: string, model: string) => ({ planId: input.planId, purpose, model, maxTokens: MAX_TOKENS, reserveUsd: reserveFor(model, MAX_TOKENS, MAX_TOKENS) });
  let rounds = 0; let ranked = rankTopics(good, ctx);
  while (rounds < ROUNDS && ranked.topics.length < TOPIC_COUNT) {
    rounds += 1;
    const have = good.map((g) => ({ ...g, hooks: g.hooks.map((h) => h.text) }));
    const { drafts, rejected: bad } = parseDrafts(await ask({ ...call('topic_write', WRITER_MODEL), system: WRITER_SYSTEM, user: writerPrompt(input, weeks, ctx, signals, have), schema: DRAFTS_JSON_SCHEMA }), new Set(weeks));
    rejected.push(...bad);
    if (drafts.length) {
      drafts.sort((a, b) => a.title.localeCompare(b.title)); // the judge sees no ranking in the order
      const ids = drafts.map((_, i) => `T${i + 1}`);
      const judged = pairJudgments(drafts, ids, await ask({ ...call('topic_judge', JUDGE_MODEL), system: judgeSystem(), user: judgePrompt(drafts, ids, signals, input.inputs.proof), schema: JUDGMENTS_JSON_SCHEMA }));
      good.push(...judged.topics); rejected.push(...judged.rejected);
    }
    ranked = rankTopics(good, ctx);
  }
  if (ranked.topics.length < TOPIC_COUNT) {
    throw Object.assign(new Error(`Only ${ranked.topics.length} usable topics came back, and five are needed. First problem: ${rejected[0] || 'none reported'}.`), { name: 'ContractViolation' });
  }
  await sequelize.transaction(async (transaction) => {
    await WeeklyLiveTopic.destroy({ where: { plan_id: input.planId }, transaction });
    await WeeklyLiveTopic.bulkCreate(ranked.topics.map((t, i) => ({
      plan_id: input.planId, rank: i + 1, week: t.week, title: t.title, spin: t.spin, parody: t.parody, hooks: t.hooks, package: t.package, marketing: t.marketing,
      signals_used: t.signals_used, teach_lines: t.teach_lines, teach: t.score.teach.total, viral: t.score.viral.total, convert: t.score.convert.total,
      topic_score: t.score.topicScore, factors: t.score.factors, warnings: t.warnings,
    })), { transaction });
  });
  const at = ranked.recommended ? ranked.topics.indexOf(ranked.recommended) + 1 : null;
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'weekly_live.topics', outcome: 'success', context: { plan_id: input.planId, rounds, rejected: rejected.length, recommended_rank: at } }));
  return { topics: ranked.topics, recommendedRank: at, rejected, rounds };
}
