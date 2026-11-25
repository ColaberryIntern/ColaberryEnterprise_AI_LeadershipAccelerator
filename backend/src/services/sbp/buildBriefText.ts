/**
 * buildBriefText - the brief the decomposer treats as ground truth. PURE.
 *
 * Split out of sbpOrchestrator.ts, which is past the CLAUDE.md hard ceiling (the rule is that the
 * next change splits before adding). The input is the structural subset it reads, not the
 * orchestrator's StartBuildInput, so this module depends on nothing and no import cycle forms.
 */

export interface BriefInput {
  idea: string;
  users?: string;
  dataSources?: string;
  doneDefinition?: string;
  targetWeeks?: number;
  answers?: Array<{ question: string; answer: string }>;
}

/**
 * The brief the decomposer treats as ground truth. Assembled from the wizard's
 * answers rather than the idea alone, because the sharpening questions are
 * exactly the detail the pilot dropped.
 */
export function buildBriefText(input: BriefInput): string {
  const parts = [input.idea.trim()];
  // The adaptive interview, when the client ran one. Each answer is carried
  // with the question that produced it, so the decomposer reads the exchange
  // rather than a bare value whose meaning lived in a label it never sees.
  const answered = (input.answers ?? []).filter((a) => a.answer && a.answer.trim());
  if (answered.length) {
    parts.push(
      ['THE STUDENT ANSWERED THESE QUESTIONS ABOUT THEIR OWN PROJECT:', ...answered.map(
        (a) => `Q: ${a.question.trim()}\nA: ${a.answer.trim()}`,
      )].join('\n\n'),
    );
  }
  // Legacy fixed fields — still honoured when present so an older client works.
  if (input.users) parts.push(`WHO USES IT: ${input.users}`);
  if (input.dataSources) parts.push(`DATA SOURCES IT MUST CONNECT TO: ${input.dataSources}`);
  if (input.doneDefinition) parts.push(`WHAT DONE LOOKS LIKE (the guardrail): ${input.doneDefinition}`);
  // Scheduling context only. Phrased so it shapes release week ranges without
  // becoming a requirement — the first live run turned "TIMELINE: 6 weeks" into
  // REQ-016 "The system must be deployed within 6 weeks", which no story can
  // fulfil and which the coverage rule then flagged as an uncovered must-have.
  if (input.targetWeeks) {
    parts.push(
      `SCHEDULE (context for release planning, NOT a requirement — do not emit a requirement about the timeline): ` +
      `fit the releases into ${input.targetWeeks} weeks.`,
    );
  }
  return parts.join('\n\n');
}
