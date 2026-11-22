import {
  NEVER_FACT_DIMENSIONS,
  type UnderstandingDimension,
  type UnderstandingItem,
} from '../delivery/projectUnderstanding';

/**
 * intakeTruth — a student's intake, as project truth. PURE.
 *
 * ## What this closes
 *
 * The Enterprise intake asks good questions and then throws the answers away.
 * They are POSTed to `startBuild` as `[{id, question, answer}]`, consumed by
 * plan generation, and never persisted as anything a later story could read.
 * A student answers "Priya signs off anything over 5k" once, and by the third
 * story nothing in the system knows it.
 *
 * `ProjectUnderstanding` already solves this for AI Flotation: dimensions, a
 * classification, a provenance, and the rule that only a human-sourced
 * statement can be a FACT. This maps the Enterprise intake onto that same
 * contract rather than inventing a second one.
 *
 * ## Two rules that shape every line here
 *
 * **A student's typed answer is `source_message`.** That provenance is
 * fact-bearing because it traces to something a person wrote. Nothing in this
 * module ever emits `ai_inferred`, and nothing here upgrades a guess: if we
 * cannot quote the student, we do not write an item.
 *
 * **The angle decides the dimension.** The alternative is reading the question
 * text and guessing, and a misfiled answer is worse than an unfiled one - it
 * puts a student's words under a heading they did not mean, where a later story
 * will read them as evidence of something else. An answer whose angle we do not
 * recognise is returned as unmapped, not filed somewhere plausible.
 */

/** One answer, as the wizard sends it back. */
export interface IntakeAnswer {
  id: string;
  question: string;
  answer: string;
  /** The angle the question came from. Absent on plans generated before angles. */
  angle?: string;
}

/** An angle the description already answered, with the phrase that answered it. */
export interface IntakeCovered {
  angle: string;
  evidence: string;
}

export interface IntakeTruthInput {
  /** The student's own description, verbatim. */
  idea: string;
  answers?: readonly IntakeAnswer[];
  covered?: readonly IntakeCovered[];
}

export interface IntakeTruthResult {
  items: UnderstandingItem[];
  /** Answers whose angle we do not recognise. Reported, never guessed at. */
  unmapped: IntakeAnswer[];
}

/**
 * The ten angles, and where each one's answer belongs.
 *
 * Fixed rather than computed. Each mapping is the dimension the answer is
 * ABOUT, not the dimension it might influence: "what would you check before it
 * goes out" is an approval point, even though it also tells you something about
 * the workflow. One answer, one home.
 */
export const ANGLE_TO_DIMENSION: Readonly<Record<string, UnderstandingDimension>> = {
  'THE GUARDRAIL': 'approval_points',
  'THE TOOLS': 'systems',
  'WHEN IT IS NOT SURE': 'human_only_decisions',
  'THE MEASURE': 'success_definition',
  'EARNING AUTONOMY': 'approval_points',
  'THE JUDGEMENT': 'human_only_decisions',
  'THE OPERATOR': 'actors',
  'TRIGGER AND RHYTHM': 'current_workflow',
  'THE STANDOUT AND THE CUT': 'desired_outcome',
  'THE JOB': 'problem',
};

/**
 * The guided outline's own labelled lines, and where each one belongs.
 *
 * The outline (`frontend/.../outlineModel.ts` `composeIdea`) writes every
 * answer as `<label>: <answer>` on its own line. The label says exactly what
 * the student was asked, so it decides the dimension; no model needs to guess.
 * Two guesses this replaces went wrong on the ShiftFill run (2026-11-20):
 * the "how it is today" line was quoted as the SUCCESS definition, so the
 * Command Center showed today's cost as the goal; and "the call I am handing
 * over" was filed as a HUMAN-ONLY decision, the opposite of what it says.
 *
 * Keep the labels in step with `composeIdea`. A label that drifts simply stops
 * matching, and the model's quotes take over again, which is the old behavior.
 */
export const OUTLINE_LABEL_TO_DIMENSION: ReadonlyArray<readonly [string, UnderstandingDimension]> = [
  ['What it should produce, and for whom', 'problem'],
  ['Who uses it, and how comfortable they are with tools like this', 'actors'],
  ['What makes it start', 'current_workflow'],
  ['How many, in a normal week and on the busiest', 'current_workflow'],
  ['Tools it needs to read from or write to', 'systems'],
  // The judgement the student is HANDING to the agent. Not human-only.
  ['The call I am handing over, and what I look at to make it', 'ai_opportunities'],
  ['What I want to look at myself before it goes out', 'approval_points'],
  ["When it isn't sure, it should", 'exceptions'],
  ["Before I'd let it run on its own, I'd need it to", 'approval_points'],
  // The baseline. Today's cost is a pain point, never the success definition.
  ['How long it takes today, or how often it goes wrong', 'pain_points'],
  ['What good would look like', 'success_definition'],
  ['What would make someone say "I didn\'t know it could do that"', 'desired_outcome'],
  ["What I'd drop to get it", 'constraints'],
];

/**
 * Which interview angles a guided outline has ALREADY answered, and with what.
 *
 * An angle counts only when every line it asks about is filled: THE MEASURE
 * needs both "today" and "good", so a student who gave one is still asked.
 * The ShiftFill v3 run (2026-11-20) was asked "how long does it take today,
 * and what would good look like?" right after typing both, and the reply was
 * filed by the model's angle, so today's cost landed under success again.
 */
export const ANGLE_OUTLINE_LABELS: Readonly<Record<string, readonly string[]>> = {
  'THE JOB': ['What it should produce, and for whom'],
  'THE OPERATOR': ['Who uses it, and how comfortable they are with tools like this'],
  'TRIGGER AND RHYTHM': ['What makes it start', 'How many, in a normal week and on the busiest'],
  'THE TOOLS': ['Tools it needs to read from or write to'],
  'THE JUDGEMENT': ['The call I am handing over, and what I look at to make it'],
  'THE GUARDRAIL': ['What I want to look at myself before it goes out'],
  'WHEN IT IS NOT SURE': ["When it isn't sure, it should"],
  'EARNING AUTONOMY': ["Before I'd let it run on its own, I'd need it to"],
  'THE MEASURE': ['How long it takes today, or how often it goes wrong', 'What good would look like'],
  'THE STANDOUT AND THE CUT': ['What would make someone say "I didn\'t know it could do that"', "What I'd drop to get it"],
};

export function outlineAnsweredAngles(idea: string): Map<string, string> {
  const lines = outlineLines(idea);
  const out = new Map<string, string>();
  for (const [angle, labels] of Object.entries(ANGLE_OUTLINE_LABELS)) {
    const found = labels.map((l) => lines.find((o) => o.line.startsWith(`${l}:`)));
    if (found.every(Boolean)) out.set(angle, found.map((f) => f!.line).join('\n'));
  }
  return out;
}

/**
 * A picked button, said as the sentence the student meant.
 *
 * ShiftFill v5 (2026-11-21): the outline's buttons ("Something arrives", "Flag
 * it for me", "Send me a summary at the end of the day") were stored bare, so
 * the Command Center quoted them as if the student had typed a placeholder.
 * The label is the other half of the sentence; put it back. Free text the
 * student typed is already a sentence and is left exactly as written.
 */
const TRIGGER_SENTENCE: Readonly<Record<string, string>> = {
  'Someone asks': 'It starts when someone asks for it.',
  'Something arrives': 'It starts when something arrives.',
  'A time of day': 'It runs at a set time of day.',
};
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const SENTENCE_LABELS = new Set(["When it isn't sure, it should", "Before I'd let it run on its own, I'd need it to"]);

export function outlineStatement(label: string, text: string): string {
  if (label === 'What makes it start') return TRIGGER_SENTENCE[text] ?? text;
  if (!SENTENCE_LABELS.has(label)) return text;
  const parts = text.split(/;\s*/).map((p) => lowerFirst(p.trim().replace(/\.$/, ''))).filter(Boolean);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `${label} ${joined}.`;
}

/**
 * The outline's labelled lines found in a description, in the order written.
 * `text` is the raw answer (for matching quotes); `statement` is what gets shown.
 */
export function outlineLines(idea: string): Array<{ dimension: UnderstandingDimension; text: string; statement: string; line: string }> {
  const out: Array<{ dimension: UnderstandingDimension; text: string; statement: string; line: string }> = [];
  for (const raw of idea.split(/\r?\n/)) {
    const line = raw.trim();
    for (const [label, dimension] of OUTLINE_LABEL_TO_DIMENSION) {
      if (!line.startsWith(`${label}:`)) continue;
      const text = line.slice(label.length + 1).trim();
      if (text) out.push({ dimension, text, statement: outlineStatement(label, text), line });
      break;
    }
  }
  return out;
}

/** Longest quote we keep. A whole pasted document is not a quote. */
const MAX_QUOTE = 600;

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');
const quote = (s: string): string => (s.length <= MAX_QUOTE ? s : `${s.slice(0, MAX_QUOTE - 3)}...`);

/** The angle name, normalised. Models vary on case and surrounding punctuation. */
export function normaliseAngle(raw: unknown): string {
  return clean(raw).toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fact(
  dimension: UnderstandingDimension,
  value: string,
  sourceQuote: string,
): UnderstandingItem {
  return {
    dimension,
    value,
    // FACT, because a person wrote it. `source_message` is in
    // FACT_BEARING_PROVENANCES for exactly this reason.
    classification: 'FACT',
    provenance: 'source_message',
    source_quote: quote(sourceQuote),
  };
}

/**
 * Turn one intake into truth items.
 *
 * Deliberately conservative. An empty answer produces nothing, an unrecognised
 * angle produces nothing but is reported, and a dimension that can never hold a
 * fact is refused outright even if a mapping tried to send one there.
 */
export function itemsFromIntake(input: IntakeTruthInput): IntakeTruthResult {
  const items: UnderstandingItem[] = [];
  const unmapped: IntakeAnswer[] = [];

  const idea = clean(input.idea);
  const outline = idea ? outlineLines(idea) : [];
  if (outline.length) {
    // A guided outline: every line already says what it answers.
    for (const o of outline) items.push(fact(o.dimension, o.statement, o.line));
  } else if (idea) {
    // The description is the one thing every intake has, and it is the
    // student's own words about what they are building.
    items.push(fact('problem', idea.length <= MAX_QUOTE ? idea : quote(idea), idea));
  }
  // A model quote that is (part of) an outline line is that line again, and its
  // angle may file it somewhere the label contradicts. The label wins.
  const fromOutline = (evidence: string): boolean =>
    outline.some((o) => o.text.includes(evidence) || evidence.includes(o.text));

  for (const answer of input.answers ?? []) {
    const text = clean(answer.answer);
    if (!text) continue; // a skipped question is not a fact about anything
    // Repeating an outline line: the line, filed by its label, already says it.
    if (fromOutline(text)) continue;

    const dimension = ANGLE_TO_DIMENSION[normaliseAngle(answer.angle)];
    if (!dimension) { unmapped.push(answer); continue; }
    if (NEVER_FACT_DIMENSIONS.includes(dimension)) continue;

    items.push(fact(dimension, text, text));
  }

  for (const c of input.covered ?? []) {
    const evidence = clean(c.evidence);
    const dimension = ANGLE_TO_DIMENSION[normaliseAngle(c.angle)];
    // A covered angle with no quotable evidence is not evidence. The intake
    // service already drops these; this is the second gate, because this module
    // is also reachable from a stored plan written before that gate existed.
    if (!evidence || !dimension) continue;
    if (NEVER_FACT_DIMENSIONS.includes(dimension)) continue;
    if (fromOutline(evidence)) continue;

    items.push(fact(dimension, evidence, evidence));
  }

  return { items, unmapped };
}
