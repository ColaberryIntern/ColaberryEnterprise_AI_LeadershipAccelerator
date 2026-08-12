/**
 * deriveLegacyScope — map the generated interview back onto the three fixed
 * scoping fields the pipeline still speaks.
 *
 * The wizard used to ask exactly three questions ("who uses it?", "what data
 * sources?", "what does done look like?") so those fields filled themselves.
 * The interview is now generated from the student's own idea, so the questions
 * differ every time — but `users`, `data_sources` and `done_definition` are
 * still read by the local fallback plan and are named in FR-003's acceptance
 * (the requirements document must reference all three at least once). Leaving
 * them empty would quietly weaken both.
 *
 * This is deliberately a keyword match, not a model call: it runs inline on
 * Confirm, and a wrong guess here costs a slightly less specific document,
 * while a model call would cost the student a wait. Anything unmatched still
 * reaches the server in full via the `answers` array, so nothing is lost —
 * this only decides which answer ALSO gets copied into a legacy field.
 */

export interface InterviewAnswer { id: string; question: string; answer: string }

export interface LegacyScope {
  users?: string;
  dataSources?: string;
  done?: string;
}

/** First answer whose question mentions any of these words. */
function firstMatch(answers: InterviewAnswer[], words: string[], used: Set<string>): string | undefined {
  const hit = answers.find((a) => {
    if (used.has(a.id) || !a.answer.trim()) return false;
    const q = a.question.toLowerCase();
    return words.some((w) => q.includes(w));
  });
  if (!hit) return undefined;
  used.add(hit.id);
  return hit.answer.trim();
}

export function deriveLegacyScope(answers: InterviewAnswer[] | undefined): LegacyScope {
  const list = (answers || []).filter((a) => a && a.answer && a.answer.trim().length > 0);
  if (list.length === 0) return {};

  // Each field claims at most one answer, most-specific wording first, so a
  // single question cannot fill all three and leave the others empty.
  const used = new Set<string>();
  const users = firstMatch(list, ['who ', 'who\'', 'user', 'audience', 'for whom', 'team', 'customer'], used);
  const dataSources = firstMatch(list, ['data', 'source', 'connect', 'integrat', 'api', 'system', 'tool', 'platform'], used);
  const done = firstMatch(list, ['done', 'success', 'guardrail', 'safe', 'never', 'must not', 'approv', 'complete'], used);

  // A field that matched nothing borrows an unclaimed answer, in order, so we
  // send the student's own words rather than an empty field. Written as plain
  // statements: an object literal would depend on property evaluation order.
  const remainder = list.filter((a) => !used.has(a.id)).map((a) => a.answer.trim());
  let next = 0;
  const borrow = (): string | undefined => (next < remainder.length ? remainder[next++] : undefined);

  const scope: LegacyScope = {};
  scope.users = users || borrow();
  scope.dataSources = dataSources || borrow();
  scope.done = done || borrow();
  return scope;
}
