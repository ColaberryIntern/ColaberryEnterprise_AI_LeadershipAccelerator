import { DraftRevisionInput } from '../../../services/certPrep/certQuestionBankService';
import { CCAR_F_SAMPLE_ITEMS } from '../ccarFoundationsItems';
import { D1_ITEMS } from './d1Architecture';
import { D2_ITEMS } from './d2ToolsAndMcp';
import { D3_ITEMS } from './d3ClaudeCode';
import { D4_ITEMS } from './d4PromptEngineering';
import { D5_ITEMS } from './d5ContextAndReliability';

/**
 * The whole authored CCAR-F bank.
 *
 * The original twenty items were written to prove the pipeline, not to run a
 * cohort, and it showed: D4 had none at all, D2 had one, and half the thirty
 * published objectives had no question against them. A full-length mock asks
 * for sixty items apportioned by exam weight and could fill twenty of them, so
 * every readiness figure was computed from two domains out of five.
 *
 * The bank is now sized to the exam rather than to the demo. Per-domain files
 * keep each domain's coverage visible: an empty objective is obvious in a short
 * file and invisible in a long one.
 *
 * THE TARGET DISTRIBUTION IS THE EXAM'S OWN WEIGHTING, not an even split:
 *
 *   D1  Agentic Architecture      27%  → 40
 *   D2  Tool Design & MCP         18%  → 27
 *   D3  Claude Code Config        20%  → 30
 *   D4  Prompt Engineering        20%  → 30
 *   D5  Context & Reliability     15%  → 23
 *                                       ───
 *                                       150
 *
 * Why 150 and not 60: sixty fills exactly one mock, and `REPEAT_LOOKBACK_SESSIONS`
 * means a student who sits three of them would see the same items each time.
 * A hundred and fifty supports repeated practice plus mocks without a student
 * meeting the same question three sittings running.
 *
 * `assertBankShape()` below is the guard against this file's own promise
 * rotting. It is asserted in a test, not merely documented.
 */
export const CCAR_F_ALL_ITEMS: DraftRevisionInput[] = [
  ...CCAR_F_SAMPLE_ITEMS,
  ...D1_ITEMS,
  ...D2_ITEMS,
  ...D3_ITEMS,
  ...D4_ITEMS,
  ...D5_ITEMS,
];

/** What a full-length mock needs from each domain, by exam weight (60 items). */
export const MOCK_DEMAND: Record<string, number> = { D1: 16, D2: 11, D3: 12, D4: 12, D5: 9 };

export interface BankShapeProblem { kind: string; detail: string }

/**
 * Structural checks a bank must pass to be worth serving. These are the failures
 * that produced a feature which looked complete and could not fill a sitting:
 * duplicate keys, an objective with no question, a domain that cannot supply its
 * share of a mock, and an item pointing at an objective that does not exist.
 */
export function assertBankShape(
  items: DraftRevisionInput[],
  objectivesByDomain: Record<string, string[]>,
): BankShapeProblem[] {
  const problems: BankShapeProblem[] = [];

  const seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.question_key)) problems.push({ kind: 'duplicate_key', detail: i.question_key });
    seen.add(i.question_key);
  }

  const byDomain: Record<string, number> = {};
  const objectivesCovered: Record<string, Set<string>> = {};
  for (const i of items) {
    byDomain[i.domain_id] = (byDomain[i.domain_id] ?? 0) + 1;
    if (i.objective_id) {
      (objectivesCovered[i.domain_id] ??= new Set()).add(i.objective_id);
    }
  }

  for (const [domain, need] of Object.entries(MOCK_DEMAND)) {
    const have = byDomain[domain] ?? 0;
    if (have < need) {
      problems.push({ kind: 'cannot_fill_mock', detail: `${domain} has ${have}, a 60-item mock needs ${need}` });
    }
  }

  for (const [domain, objectives] of Object.entries(objectivesByDomain)) {
    for (const objective of objectives) {
      if (!objectivesCovered[domain]?.has(objective)) {
        problems.push({ kind: 'objective_uncovered', detail: objective });
      }
    }
  }

  const valid = new Set(Object.values(objectivesByDomain).flat());
  for (const i of items) {
    if (i.objective_id && !valid.has(i.objective_id)) {
      problems.push({ kind: 'unknown_objective', detail: `${i.question_key} → ${i.objective_id}` });
    }
  }

  return problems;
}
