import { allWeeks } from '../../../data/canonicalCourse';
import { WeeklyLiveSignal, WeeklyLiveTopic, type PlanInputs } from '../../../models/WeeklyLive';
import { askAi, type AskAi } from '../aiCall';
import { reserveFor } from '../modelPrices';
import { BLUEPRINT_JSON_SCHEMA, blueprintIssues, parseBlueprint, type SessionBlueprint } from './deckBlueprint';
import { DECK_WRITER_SYSTEM, deckWriterPrompt, type DeckWriterInput } from './deckPrompts';
import { validateBlueprint } from './validateBlueprint';

/**
 * Write the session blueprint for a chosen topic (WL4.2): one strict-schema call, then at most one
 * repair round that hands the writer the validator's own sentences. Nothing is guessed: a plan that
 * still breaks a rule after the repair fails with those rules listed, and the caller stores the failure.
 *
 * Failure modes: the call times out or the budget is spent (thrown by askAi, the caller records it);
 * the answer is cut off or malformed (ContractViolation); it breaks a rule twice (BlueprintRejected).
 * Retries: none automatic beyond the one repair; Write again is the recovery path.
 */
export const DECK_MODEL = process.env.WEEKLY_LIVE_DECK_MODEL || 'gpt-6.2-sol';
const MAX_TOKENS = 24_000;
const ROUNDS = 2;

export class BlueprintRejected extends Error {
  constructor(readonly problems: string[]) { super(`The session plan broke ${problems.length} rule(s). First: ${problems[0]}`); this.name = 'BlueprintRejected'; }
}

/** Everything the writer is told, from the stored topic and plan. Pure apart from the reads. */
export async function writerInput(planId: string, topicId: string, inputs: PlanInputs): Promise<DeckWriterInput> {
  const topic = await WeeklyLiveTopic.findOne({ where: { id: topicId, plan_id: planId } });
  if (!topic) throw Object.assign(new Error('The chosen topic is no longer in this plan.'), { name: 'NotFound' });
  const signals = topic.signals_used.length ? await WeeklyLiveSignal.findAll({ where: { id: topic.signals_used, plan_id: planId } }) : [];
  const weeks = allWeeks();
  const def = weeks.find((w) => w.week_number === topic.week);
  const next = weeks.find((w) => w.week_number === topic.week + 1);
  return {
    topicTitle: topic.title, spin: topic.spin, parody: topic.parody, hooks: topic.hooks.map((h) => h.text), week: topic.week,
    weekTheme: def?.theme ?? '', intensive: def?.intensive.title ?? '', nextWeekTheme: next ? next.theme : null,
    proof: inputs.proof?.trim() || null, notes: inputs.notes?.trim() || null,
    signals: signals.map((s) => `${s.headline}${s.publisher ? ` (${s.publisher})` : ''}`),
  };
}

export async function writeBlueprint(planId: string, input: DeckWriterInput, ask: AskAi = askAi): Promise<SessionBlueprint> {
  let problems: string[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    const raw = await ask({
      planId, purpose: 'deck_write', model: DECK_MODEL, system: DECK_WRITER_SYSTEM, user: deckWriterPrompt(input, problems),
      schema: BLUEPRINT_JSON_SCHEMA, maxTokens: MAX_TOKENS, reserveUsd: reserveFor(DECK_MODEL, MAX_TOKENS, MAX_TOKENS),
    });
    const malformed = blueprintIssues(raw);
    if (malformed.length) { problems = malformed; continue; }
    const bp: SessionBlueprint = parseBlueprint(raw);
    problems = validateBlueprint(bp);
    if (!problems.length) return bp;
  }
  throw new BlueprintRejected(problems);
}
