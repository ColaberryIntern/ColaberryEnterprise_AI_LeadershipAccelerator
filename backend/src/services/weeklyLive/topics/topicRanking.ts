import type { CurriculumMap } from '../curriculumMap';
import type { TopicHook, TopicWarning } from '../../../models/WeeklyLive';
import { normalizeFactors, recommendPick, scoreTopic, scoreViral, TOPIC_GATE, type IdeaLines, type TopicScore } from '../scoring';
import type { CandidateTopic } from './topicSchema';

/**
 * Candidates to ranked topics (WL3.3), pure and deterministic. Three things the AI does not decide:
 * the demand line is the measured YouTube demand, the news line is limited by how old the cited news
 * is on the air date, and the viral factors are the factors of the signals the topic cites.
 */
export const TOPIC_COUNT = 5;
const PROOF_LINE = 4;
const FRESH_DAYS = 14;
const RECENT_DAYS = 90;

export interface SignalFact { id: string; ref: string; published_at: string | null; factors: number[]; }
export interface DemandFact { week: number; score: number | null; multiple: number | null; thin_median: boolean; }
export interface RankContext { airDate: string; proofGiven: boolean; signals: SignalFact[]; demand: DemandFact[]; map: CurriculumMap; }

export interface RankedTopic {
  week: number; title: string; spin: string; parody: string; hooks: TopicHook[]; package: CandidateTopic['package']; marketing: CandidateTopic['marketing'];
  signals_used: string[]; teach_lines: Record<string, { score: number; why: string }>;
  score: TopicScore; hasProof: boolean; warnings: TopicWarning[];
}

/** Weeks open to choose: a forced week alone, else the 12 minus those in the last four sessions. */
export function openWeeks(map: CurriculumMap, forced: number | 'auto'): number[] {
  if (forced !== 'auto') return [forced];
  return map.weeks.filter((w) => !w.coveredInLast4).map((w) => w.week);
}

const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The news line's ceiling: a story 14 days old or less on the air date can reach 5, 90 days 3, anything else 1. */
export function newsCeiling(ageDays: number | null): number {
  if (ageDays === null || ageDays > RECENT_DAYS) return 1;
  return ageDays <= FRESH_DAYS ? 5 : 3;
}

export function rankOne(c: CandidateTopic, ctx: RankContext): RankedTopic {
  const cited = [...new Set(c.signals)].flatMap((ref) => ctx.signals.find((s) => s.ref === ref) || []);
  const ages = cited.flatMap((s) => (s.published_at ? [daysFrom(s.published_at, ctx.airDate)] : []));
  const newest = ages.length ? Math.min(...ages) : null;
  const demand = ctx.demand.find((d) => d.week === c.week);
  const ceiling = newsCeiling(newest);
  const teach: Record<string, { score: number; why: string }> = {};
  for (const [k, v] of Object.entries(c.teach)) teach[k] = { ...v };
  teach.demand = demand && demand.score !== null
    ? { score: demand.score, why: demand.multiple === null ? 'Measured on YouTube; the channel has no usual view count to compare with' : `Measured: the best video ran ${demand.multiple}x its channel's usual views` }
    : { score: 1, why: 'No YouTube measurement for this week' };
  if (teach.news.score > ceiling) teach.news = { score: ceiling, why: `${teach.news.why} (held to ${ceiling}: ${newest === null ? 'no dated story' : `newest story is ${newest} days old on the air date`})`.slice(0, 400) };

  const lines = Object.fromEntries(Object.entries(teach).map(([k, v]) => [k, v.score])) as Partial<IdeaLines>;
  const score = scoreTopic({ teach: lines, viral: c.viral, convert: c.convert, factors: normalizeFactors(cited.flatMap((s) => s.factors)), proofGiven: ctx.proofGiven });
  for (const k of Object.keys(score.teach.lines) as (keyof IdeaLines)[]) teach[k].score = score.teach.lines[k];
  const hasProof = score.teach.lines.proof >= PROOF_LINE;

  const reached = ctx.map.weeks.filter((w) => w.timesCovered > 0).map((w) => w.week);
  const next = (reached.length ? Math.max(...reached) : 0) + 1;
  const warnings: TopicWarning[] = [];
  if (c.week > next) warnings.push({ code: 'jumps_ahead', message: `Week ${c.week} is ${c.week - next} ${c.week - next === 1 ? 'week' : 'weeks'} past the next one the class reaches (week ${next}).` });
  if (!hasProof) warnings.push({ code: 'no_proof', message: ctx.proofGiven ? 'The proof you gave does not show this topic yet.' : 'No proof was given, so the proof line is held to 2.' });
  if (newest === null) warnings.push({ code: 'no_dated_news', message: 'No dated news story supports this topic.' });
  else if (newest > FRESH_DAYS) warnings.push({ code: 'stale_news', message: `The newest story is ${newest} days old on the air date.` });
  if (demand?.thin_median) warnings.push({ code: 'thin_demand', message: 'The YouTube comparison rests on fewer than 10 uploads.' });
  if (!demand || demand.score === null) warnings.push({ code: 'no_demand', message: 'YouTube demand was not measured for this week.' });
  if (score.needsOverride) warnings.push({ code: 'few_factors', message: score.flags[0] });
  if (score.topicScore < TOPIC_GATE) warnings.push({ code: 'below_gate', message: `Scores ${score.topicScore}, under the ${TOPIC_GATE} needed to go ahead.` });

  return {
    week: c.week, title: c.title, spin: c.spin, parody: c.parody, package: c.package, marketing: c.marketing,
    hooks: c.hooks.map((h) => ({ text: h.text, viral: scoreViral(h.viral).total })).sort((a, b) => b.viral - a.viral || a.text.localeCompare(b.text)),
    signals_used: cited.map((s) => s.id), teach_lines: teach, score, hasProof, warnings,
  };
}

/** Best five first. Ties: viral, then the earlier week, then the title, so the same scores always give the same order. */
export function rankTopics(cands: CandidateTopic[], ctx: RankContext): { topics: RankedTopic[]; recommended: RankedTopic | null } {
  const seen = new Set<string>();
  const unique = cands.filter((c) => { const k = c.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const topics = unique.map((c) => rankOne(c, ctx))
    .sort((a, b) => b.score.topicScore - a.score.topicScore || b.score.viral.total - a.score.viral.total || a.week - b.week || a.title.localeCompare(b.title))
    .slice(0, TOPIC_COUNT);
  return { topics, recommended: recommendPick(topics) };
}
