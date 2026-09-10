import { generateIntakeQuestions } from '../intakeQuestionsService';
import {
  INTAKE_QUESTIONS_JSON_SCHEMA,
  INTAKE_SYSTEM_PROMPT,
  QUESTION_TARGETS,
  buildIntakeQuestionsPrompt,
} from '../intakeQuestionsPrompt';

/**
 * The interview must get SHORTER as the description gets better.
 *
 * ## The defect these tests pin
 *
 * The angle list has always said "ask the first MAX that the student's
 * description does not already answer clearly". Three separate floors
 * contradicted it, and a floor beats an exhortation every time:
 *
 *   1. the user prompt said "ask between MIN and MAX questions"
 *   2. the JSON schema said `minItems: 3`, so under `strict: true` structured
 *      output a shorter answer was not even representable
 *   3. the service rejected any response with fewer than 3 questions, retried,
 *      and then degraded to the GENERIC fallback set
 *
 * Together those meant the better a student wrote, the more likely they were to
 * be handed the generic form the whole adaptive path exists to replace. The
 * third one is the cruel part: effort was punished with a worse experience.
 */

/** A model that returns exactly what the test tells it to. */
const stub = (payload: unknown) => ({
  create: jest.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }),
});

const question = (id: string, text: string) => ({
  id,
  question: text,
  why: 'because it changes the build',
  placeholder: 'for example, the invoices spreadsheet',
  suggestions: ['one', 'two'],
  kind: 'text' as const,
});

const IDEA = 'A tool that reads incoming invoices from our shared mailbox, checks them '
  + 'against the purchase orders in our spreadsheet, and flags mismatches for Priya to '
  + 'review before anything is paid.';

describe('no floor survives anywhere in the contract', () => {
  it('the prompt asks for a maximum and states there is no minimum', () => {
    const prompt = buildIntakeQuestionsPrompt({ idea: IDEA, size: 'project' });
    expect(prompt).toContain('AT MOST 7');
    expect(prompt).toMatch(/no minimum/i);
    // The exact old wording, which is what actually caused the behaviour.
    expect(prompt).not.toMatch(/between \d+ and \d+ questions/);
  });

  it('the tier table carries no `min` at all, so nothing can read one back', () => {
    for (const size of ['workflow', 'project', 'autonomous'] as const) {
      expect(QUESTION_TARGETS[size]).toEqual({ max: expect.any(Number) });
      expect(QUESTION_TARGETS[size]).not.toHaveProperty('min');
    }
  });

  it('the system prompt has no unsubstituted MIN placeholder left behind', () => {
    // A leftover {{MIN}} would reach the model verbatim and read as an instruction.
    expect(INTAKE_SYSTEM_PROMPT).not.toContain('{{MIN}}');
  });

  it('the JSON schema permits a short answer', () => {
    const questions = (INTAKE_QUESTIONS_JSON_SCHEMA as any).properties.questions;
    expect(questions.minItems).toBeUndefined();
    expect(questions.maxItems).toBe(10);
  });

  it('the schema requires the model to say what it did NOT ask, and quote it', () => {
    const schema = INTAKE_QUESTIONS_JSON_SCHEMA as any;
    expect(schema.required).toContain('covered');
    expect(schema.properties.covered.items.required).toEqual(['angle', 'evidence']);
  });
});

describe('a description that answers the angles buys a shorter interview', () => {
  it('accepts two questions when the model quotes what covers the rest', async () => {
    // Under the old rule this exact response was rejected as "fewer than 3
    // well-formed questions", retried, and degraded to the generic set.
    const client = stub({
      questions: [
        question('mismatch_rule', 'When an invoice and a purchase order disagree, what should happen?'),
        question('priya_absent', 'If Priya is away, who reviews the flagged invoices?'),
      ],
      covered: [
        { angle: 'THE TOOLS', evidence: 'our shared mailbox ... the purchase orders in our spreadsheet' },
        { angle: 'THE GUARDRAIL', evidence: 'flags mismatches for Priya to review before anything is paid' },
      ],
    });

    const result = await generateIntakeQuestions({ idea: IDEA, size: 'project', client });

    expect(result.generated).toBe(true);
    expect(result.questions).toHaveLength(2);
    expect(result.covered.map((c) => c.angle)).toEqual(['THE TOOLS', 'THE GUARDRAIL']);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('a vague idea still earns a full interview', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      question(`q${i}`, `A question about the invoices and the spreadsheet, number ${i}`));
    const client = stub({ questions: many, covered: [] });

    const result = await generateIntakeQuestions({ idea: IDEA, size: 'project', client });
    expect(result.questions).toHaveLength(7);
  });

  it('the detailed description produces strictly fewer questions than the vague one', async () => {
    // The acceptance criterion in one assertion, rather than inferred from the
    // two tests above sitting next to each other.
    const detailed = await generateIntakeQuestions({
      idea: IDEA,
      size: 'project',
      client: stub({
        questions: [question('mismatch_rule', 'When an invoice and a purchase order disagree, what then?')],
        covered: [{ angle: 'THE TOOLS', evidence: 'our shared mailbox and the spreadsheet' }],
      }),
    });
    const vague = await generateIntakeQuestions({
      idea: IDEA,
      size: 'project',
      client: stub({
        questions: Array.from({ length: 6 }, (_, i) =>
          question(`q${i}`, `A question about the invoices spreadsheet, number ${i}`)),
        covered: [],
      }),
    });
    expect(detailed.questions.length).toBeLessThan(vague.questions.length);
  });

  it('still caps at the tier maximum', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) =>
      question(`q${i}`, `A question about the invoices and the spreadsheet, number ${i}`));
    const result = await generateIntakeQuestions({
      idea: IDEA, size: 'workflow', client: stub({ questions: twelve, covered: [] }),
    });
    expect(result.questions).toHaveLength(QUESTION_TARGETS.workflow.max);
  });
});

describe('a short interview and a broken response are different things', () => {
  it('retries when entries are malformed rather than accepting the survivors', async () => {
    // Two good, one junk. Silently keeping the two would let a degrading model
    // shorten every interview and look like the feature working.
    const client = stub({
      questions: [
        question('a', 'A question about the invoices spreadsheet'),
        question('b', 'Another question about the shared mailbox'),
        { id: 'c', question: 'short' },
      ],
      covered: [{ angle: 'THE TOOLS', evidence: 'spreadsheet' }],
    });
    await generateIntakeQuestions({ idea: IDEA, size: 'project', client });
    expect(client.create).toHaveBeenCalledTimes(2);
  });

  it('refuses an empty response that quotes nothing', async () => {
    const client = stub({ questions: [], covered: [] });
    const result = await generateIntakeQuestions({ idea: IDEA, size: 'project', client });

    // Retried, then degraded. An empty set with no evidence is not a short
    // interview, it is an empty response wearing one as a costume.
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(result.generated).toBe(false);
    expect(result.covered).toEqual([]);
  });

  it('drops a covered claim that carries no quote', async () => {
    const client = stub({
      questions: [question('a', 'A question about the invoices spreadsheet')],
      covered: [
        { angle: 'THE TOOLS', evidence: 'the shared mailbox' },
        { angle: 'THE MEASURE', evidence: '   ' },
      ],
    });
    const result = await generateIntakeQuestions({ idea: IDEA, size: 'project', client });
    expect(result.covered).toEqual([{ angle: 'THE TOOLS', evidence: 'the shared mailbox' }]);
  });

  it('the degraded set claims no coverage, because it never saw the description', async () => {
    const result = await generateIntakeQuestions({
      idea: IDEA,
      size: 'project',
      client: { create: jest.fn().mockRejectedValue(new Error('upstream is down')) } as never,
    });
    expect(result.generated).toBe(false);
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.covered).toEqual([]);
  });
});
