/**
 * tailorQuestions — rewrite the ten questions in the language of THIS idea.
 *
 * The spine in `sharpeningQuestions.ts` is fixed: ten slots, same order, same
 * downstream meaning, always. This adapts only the surface — the question
 * wording, the helper line, and the examples — so a dental clinic is asked
 * about patients and a warehouse about pallets.
 *
 * WHY THE SPLIT: a student answers a concrete question far better than an
 * abstract one. "What must never happen without a human saying yes?" is a
 * shrug; "What must never happen to a patient's appointment without the front
 * desk approving it?" gets a real answer. But letting a model invent the
 * QUESTIONS as well as the wording would make the brief's shape
 * non-deterministic, and the decomposer, the gate and the Architect all depend
 * on the same facts being present in every brief.
 *
 * FAILS OPEN, DELIBERATELY. Tailoring is a nicety; the generic questions work.
 * Every failure path here returns the untouched spine rather than throwing —
 * a student must never be blocked from starting a build because a cosmetic
 * model call timed out. That is the opposite of the traceability gate, which
 * fails closed, and the difference is intentional: the gate protects
 * correctness, this protects phrasing.
 */
import OpenAI from 'openai';
import { SHARPENING_QUESTIONS, QuestionSlot } from './sharpeningQuestions';

/** Short and cheap — this is one small completion in front of a 15-minute job. */
const REQUEST_TIMEOUT_MS = 45_000;

/** Only the mutable surface. `id`/`index`/`feeds`/`guards`/`required` are ours. */
const TAILORED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text', 'help', 'examples'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          help: { type: 'string' },
          examples: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You rewrite intake questions so they speak the language of one specific project.

You will be given a student's project idea and ten fixed questions. For each question, rewrite:
  - text: the question, asked about THEIR project in THEIR domain's words
  - help: one short line of guidance
  - examples: exactly 2 plausible answers a person building THIS project might give

HARD RULES:
- Return all ten, with their ids unchanged. Never add, drop, merge or reorder.
- NEVER change what a question is ASKING FOR. Each one feeds a specific part of a
  build plan. If the question asks what must never happen without human approval,
  the rewrite must still ask exactly that — in their words, about their domain.
- Examples are illustrations, not answers. Make them concrete and specific to the
  domain, but do not assume facts about their business you were not told.
- Keep text under 140 characters and help under 100. These render in a form field.
- Plain language. No jargon the operator described in the idea would not use.`;

export interface TailorDeps {
  client: Pick<OpenAI['chat']['completions'], 'create'>;
  model?: string;
  correlationId?: string;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'sbp-tailor-questions',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

/**
 * Merge a model rewrite over the spine, slot by slot.
 *
 * Every field the pipeline depends on is taken from OURS, never from the model:
 * `id`, `index`, `feeds`, `guards` and `required` are structural. A slot the
 * model omitted, renamed, or returned empty falls back to its original text —
 * so a partial rewrite degrades to a partly-generic form rather than a broken
 * one, and a hallucinated id is simply ignored.
 */
export function mergeTailored(
  tailored: Array<{ id: string; text?: string; help?: string; examples?: string[] }>,
): QuestionSlot[] {
  const byId = new Map(tailored.filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));

  return SHARPENING_QUESTIONS.map((slot) => {
    const t = byId.get(slot.id);
    if (!t) return { ...slot };

    const text = typeof t.text === 'string' && t.text.trim() ? t.text.trim() : slot.text;
    const help = typeof t.help === 'string' && t.help.trim() ? t.help.trim() : slot.help;
    const examples = Array.isArray(t.examples)
      ? t.examples.filter((e) => typeof e === 'string' && e.trim()).slice(0, 3)
      : [];

    return {
      ...slot,                                   // id, index, feeds, guards, required — never the model's
      text,
      help,
      examples: examples.length ? examples : slot.examples,
    };
  });
}

/**
 * Tailor the ten questions to an idea. Never throws; returns the generic spine
 * on any failure, with the reason logged.
 */
export async function tailorQuestions(idea: string, deps: TailorDeps): Promise<{
  questions: QuestionSlot[];
  tailored: boolean;
  reason?: string;
}> {
  const trimmed = (idea ?? '').trim();
  // Below this there is nothing to tailor AGAINST — a three-word idea produces
  // worse questions than the generic ones, which are at least well written.
  if (trimmed.length < 40) {
    return { questions: [...SHARPENING_QUESTIONS], tailored: false, reason: 'idea too short to tailor' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const spine = SHARPENING_QUESTIONS.map((q) =>
      `${q.id} — ${q.text}\n   (this must keep asking for: ${q.help})`).join('\n');

    const completion = await deps.client.create({
      model: deps.model ?? 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `THE PROJECT IDEA:\n${trimmed.slice(0, 6_000)}\n\nTHE TEN QUESTIONS:\n${spine}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'tailored_questions', strict: true, schema: TAILORED_SCHEMA } },
    } as any, { signal: controller.signal } as any);

    const raw = completion.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (!list.length) {
      log('tailor_empty', deps.correlationId, 'partial', { idea_chars: trimmed.length });
      return { questions: [...SHARPENING_QUESTIONS], tailored: false, reason: 'model returned no questions' };
    }

    const questions = mergeTailored(list);
    const changed = questions.filter((q, i) => q.text !== SHARPENING_QUESTIONS[i].text).length;
    log('tailor_ok', deps.correlationId, 'success', { idea_chars: trimmed.length, slots_rewritten: changed });
    return { questions, tailored: changed > 0 };
  } catch (err: any) {
    // Never fatal. A student with generic questions is fine; a student staring
    // at an error because the phrasing helper died is not.
    const reason = err?.name === 'AbortError' ? 'tailoring timed out' : `tailoring failed: ${err?.message}`;
    log('tailor_failed', deps.correlationId, 'failure', { error_class: err?.name ?? 'Error', message: err?.message });
    return { questions: [...SHARPENING_QUESTIONS], tailored: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
