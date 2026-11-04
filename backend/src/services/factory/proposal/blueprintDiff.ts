/**
 * blueprintDiff — PURE comparison of two proposal blueprints, so reanalyze can show what changed between the
 * previous reading of the solicitation and the new one (a new rule appeared, a page limit changed, a form flipped
 * from needs_input to required). No I/O, never throws; a null `prev` (the first blueprint) reports everything as new.
 */
import type { ProposalBlueprint } from './proposalBlueprintTypes';

export interface BlueprintDiff {
  rulesAdded: string[];
  rulesRemoved: string[];
  rulesChanged: Array<{ key: string; from: string; to: string }>;
  formsChanged: Array<{ key: string; from: string; to: string }>;
  scoringChanged: boolean;
  summary: string[];
}

const ruleMap = (bp: ProposalBlueprint | null): Map<string, string> =>
  new Map((bp?.rules ?? []).map((r) => [r.key, `${r.value}|${r.severity}`]));
const formMap = (bp: ProposalBlueprint | null): Map<string, string> =>
  new Map((bp?.forms ?? []).map((f) => [f.key, f.disposition]));

export function diffBlueprints(prev: ProposalBlueprint | null, next: ProposalBlueprint): BlueprintDiff {
  const prevRules = ruleMap(prev);
  const nextRules = ruleMap(next);
  const rulesAdded: string[] = [];
  const rulesRemoved: string[] = [];
  const rulesChanged: Array<{ key: string; from: string; to: string }> = [];
  for (const [key, v] of nextRules) {
    if (!prevRules.has(key)) rulesAdded.push(key);
    else if (prevRules.get(key) !== v) rulesChanged.push({ key, from: prevRules.get(key)!, to: v });
  }
  for (const key of prevRules.keys()) if (!nextRules.has(key)) rulesRemoved.push(key);

  const prevForms = formMap(prev);
  const nextForms = formMap(next);
  const formsChanged: Array<{ key: string; from: string; to: string }> = [];
  for (const [key, disp] of nextForms) {
    const before = prevForms.get(key);
    if (before !== undefined && before !== disp) formsChanged.push({ key, from: before, to: disp });
  }

  const scoringChanged = JSON.stringify(prev?.scoring ?? null) !== JSON.stringify(next.scoring);

  const summary: string[] = [];
  if (!prev) summary.push(`First blueprint: ${next.rules.length} rules, ${next.forms.filter((f) => f.disposition !== 'not_required').length} applicable forms.`);
  if (rulesAdded.length) summary.push(`${rulesAdded.length} rule(s) added: ${rulesAdded.join(', ')}.`);
  if (rulesRemoved.length) summary.push(`${rulesRemoved.length} rule(s) removed: ${rulesRemoved.join(', ')}.`);
  if (rulesChanged.length) summary.push(`${rulesChanged.length} rule(s) changed: ${rulesChanged.map((c) => c.key).join(', ')}.`);
  if (formsChanged.length) summary.push(`${formsChanged.length} form disposition(s) changed: ${formsChanged.map((c) => `${c.key} ${c.from}→${c.to}`).join(', ')}.`);
  if (scoringChanged) summary.push('Scoring changed.');
  if (summary.length === 0) summary.push('No changes from the previous blueprint.');

  return { rulesAdded, rulesRemoved, rulesChanged, formsChanged, scoringChanged, summary };
}
