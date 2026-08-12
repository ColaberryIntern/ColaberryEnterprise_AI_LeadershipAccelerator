/**
 * The ten sharpening questions, and the tailoring that adapts them.
 *
 * The load-bearing property is that the SPINE cannot move. Ten slots, same ids,
 * same order, same downstream meaning — because the decomposer, the traceability
 * gate and the Architect all depend on the same facts appearing in every brief.
 * Only the wording adapts. Most of these tests exist to stop a model, or a
 * future edit, quietly changing what a question asks for.
 */
import {
  SHARPENING_QUESTIONS, TOTAL_QUESTIONS, buildBriefFromAnswers, missingRequired,
  completeness, questionById,
  reinforceNonNegotiables,
} from '../sharpeningQuestions';
import { tailorQuestions, mergeTailored } from '../tailorQuestions';

const IDEA =
  'A tool for a dental clinic that predicts which patients will miss their appointment and offers '
  + 'the slot to someone on the waitlist. Front desk staff see a daily risk list each morning.';

const FULL: Record<string, string> = {
  q1_job: 'Tells the front desk who will miss tomorrow, in time to refill the slot.',
  q2_operator: 'Front desk staff, not technical, on the practice desktop.',
  q3_trigger: 'A nightly 6pm job plus an 8am cutoff check.',
  q4_systems: 'Dentrix appointment export, Twilio for SMS.',
  q5_decision: 'Which patients are likely to no-show, from history and lead time.',
  q6_never: 'No appointment is ever cancelled without a human approving it.',
  q7_measure: 'No-show rate drops from 18% to under 12%.',
  q8_volume: 'About 40 appointments a day, 60 in January.',
  q9_not_building: 'Not touching billing, no patient-facing app.',
  q10_evidence: 'Every released slot, who approved it and when.',
};

describe('the spine', () => {
  it('is exactly ten slots', () => {
    expect(TOTAL_QUESTIONS).toBe(10);
    expect(SHARPENING_QUESTIONS).toHaveLength(10);
  });

  it('has unique, stable ids in index order', () => {
    // Ids are persisted with answers. Renaming one orphans stored data.
    const ids = SHARPENING_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual([
      'q1_job', 'q2_operator', 'q3_trigger', 'q4_systems', 'q5_decision',
      'q6_never', 'q7_measure', 'q8_volume', 'q9_not_building', 'q10_evidence',
    ]);
    SHARPENING_QUESTIONS.forEach((q, i) => expect(q.index).toBe(i));
  });

  it('covers every requirement kind the decomposer emits', () => {
    // A brief that cannot produce a SAFE or an OBS requirement cannot produce a
    // trust spine, and r0 has nothing to prove.
    const feeds = new Set(SHARPENING_QUESTIONS.map((q) => q.feeds));
    ['FUNC', 'SAFE', 'OBS', 'NFR', 'CONSTRAINT', 'SCOPE'].forEach((k) => expect(feeds).toContain(k));
  });

  it('every slot documents the defect it guards against', () => {
    // A question that prevents nothing is a question that wastes a student's
    // time. Four fields is what we had; each addition has to justify itself.
    SHARPENING_QUESTIONS.forEach((q) => {
      expect(q.guards.length).toBeGreaterThan(20);
      expect(q.examples.length).toBeGreaterThanOrEqual(2);
      expect(q.text.trim().endsWith('?')).toBe(true);
    });
  });

  it('requires the six that the gate cannot work without', () => {
    const required = SHARPENING_QUESTIONS.filter((q) => q.required).map((q) => q.id);
    expect(required).toEqual(['q1_job', 'q2_operator', 'q3_trigger', 'q5_decision', 'q6_never', 'q7_measure']);
  });

  it('looks up by id', () => {
    expect(questionById('q6_never')!.feeds).toBe('SAFE');
    expect(questionById('nope')).toBeUndefined();
  });
});

describe('the brief it assembles', () => {
  it('carries every answer through', () => {
    const brief = buildBriefFromAnswers(IDEA, FULL, 6);
    Object.values(FULL).forEach((answer) => expect(brief).toContain(answer));
    expect(brief).toContain(IDEA);
  });

  it('labels the systems answer as a CONSTRAINT, not a feature', () => {
    // THE LAYER-STORY FIX. The pilot typed "connect to Postgres" as a FUNC/must
    // requirement, the coverage rule demanded a story for it, and 3 of 12
    // stories became layers. This heading is the whole countermeasure.
    const brief = buildBriefFromAnswers(IDEA, FULL);
    expect(brief).toMatch(/IMPLEMENTATION CONSTRAINTS/);
    expect(brief).toMatch(/do NOT write a story whose only purpose/i);
  });

  it('demands the success measure be falsifiable', () => {
    expect(buildBriefFromAnswers(IDEA, FULL)).toMatch(/MEASURABLE DEFINITION OF DONE/);
  });

  it('marks out-of-scope answers as forbidden territory, not backlog', () => {
    expect(buildBriefFromAnswers(IDEA, FULL)).toMatch(/do not write requirements or stories for these/i);
  });

  it('keeps the timeline as context, never as a requirement', () => {
    // The first live run turned "TIMELINE: 6 weeks" into REQ-016 "must be
    // deployed within 6 weeks" — a must-have no story can fulfil, which the
    // coverage rule then flagged as uncovered.
    const brief = buildBriefFromAnswers(IDEA, FULL, 6);
    expect(brief).toMatch(/NOT a requirement/);
    expect(brief).toMatch(/6 weeks/);
  });

  it('omits the schedule line entirely when no weeks are given', () => {
    expect(buildBriefFromAnswers(IDEA, FULL)).not.toMatch(/SCHEDULE/);
  });

  it('skips blank answers rather than emitting empty headings', () => {
    const brief = buildBriefFromAnswers(IDEA, { q1_job: 'Only this one.', q8_volume: '   ' });
    expect(brief).toContain('Only this one.');
    expect(brief).not.toMatch(/VOLUME/);
  });

  it('is still usable from the idea alone', () => {
    // A student who skips every optional question must still get a build.
    const brief = buildBriefFromAnswers(IDEA, {});
    expect(brief.trim()).toBe(IDEA);
  });
});

describe('completeness and validation', () => {
  it('names exactly the required answers that are missing', () => {
    expect(missingRequired(FULL)).toHaveLength(0);
    const partial = { ...FULL, q6_never: '', q7_measure: '   ' };
    expect(missingRequired(partial).map((q) => q.id)).toEqual(['q6_never', 'q7_measure']);
  });

  it('reports how much of the brief is filled in', () => {
    expect(completeness(FULL)).toEqual({ answered: 10, total: 10, percent: 100 });
    expect(completeness({ q1_job: 'a', q2_operator: 'b' })).toEqual({ answered: 2, total: 10, percent: 20 });
  });
});

describe('tailoring adapts wording without moving the spine', () => {
  const stub = (payload: unknown) => ({
    create: jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] } as any)),
  });

  it('rewrites text and examples, keeping ids and order', async () => {
    const client = stub({
      questions: SHARPENING_QUESTIONS.map((q) => ({
        id: q.id, text: `Dental: ${q.label}?`, help: 'clinic-specific help', examples: ['ex a', 'ex b'],
      })),
    });
    const out = await tailorQuestions(IDEA, { client });

    expect(out.tailored).toBe(true);
    expect(out.questions).toHaveLength(10);
    expect(out.questions.map((q) => q.id)).toEqual(SHARPENING_QUESTIONS.map((q) => q.id));
    expect(out.questions[0].text).toMatch(/^Dental:/);
    expect(out.questions[0].examples).toEqual(['ex a', 'ex b']);
  });

  it('NEVER lets the model change what a slot means', async () => {
    // The one thing that must survive tailoring. `feeds`, `guards`, `required`
    // and `index` drive the brief and the gate; a model that returns them is
    // ignored.
    const client = stub({
      questions: [{
        id: 'q6_never', text: 'What is your favourite colour?', help: 'h', examples: ['x', 'y'],
        feeds: 'FUNC', required: false, index: 99, guards: 'nothing',
      }],
    });
    const out = await tailorQuestions(IDEA, { client });
    const q6 = out.questions.find((q) => q.id === 'q6_never')!;

    expect(q6.feeds).toBe('SAFE');
    expect(q6.required).toBe(true);
    expect(q6.index).toBe(5);
    expect(q6.guards).toBe(questionById('q6_never')!.guards);
  });

  it('ignores invented ids instead of growing the form', async () => {
    const client = stub({ questions: [{ id: 'q99_invented', text: 'extra?', help: 'h', examples: ['a'] }] });
    const out = await tailorQuestions(IDEA, { client });
    expect(out.questions).toHaveLength(10);
    expect(out.questions.some((q) => q.id === 'q99_invented')).toBe(false);
  });

  it('falls back per slot, so a partial rewrite is partly generic not broken', () => {
    const merged = mergeTailored([
      { id: 'q1_job', text: 'Tailored one?', help: 'h', examples: ['a', 'b'] },
      { id: 'q2_operator', text: '   ', examples: [] },     // empty → keep ours
    ]);
    expect(merged[0].text).toBe('Tailored one?');
    expect(merged[1].text).toBe(SHARPENING_QUESTIONS[1].text);
    expect(merged[1].examples).toEqual(SHARPENING_QUESTIONS[1].examples);
    expect(merged[9].text).toBe(SHARPENING_QUESTIONS[9].text);
  });

  it('FAILS OPEN — a model failure returns the generic spine, never an error', async () => {
    // Opposite of the traceability gate on purpose: the gate protects
    // correctness and fails closed; this protects phrasing and must never block
    // a student from starting a build.
    const client = { create: jest.fn(async () => { throw new Error('upstream down'); }) };
    const out = await tailorQuestions(IDEA, { client });

    expect(out.questions).toEqual([...SHARPENING_QUESTIONS]);
    expect(out.tailored).toBe(false);
    expect(out.reason).toMatch(/tailoring failed/);
  });

  it('fails open on malformed JSON too', async () => {
    const client = { create: jest.fn(async () => ({ choices: [{ message: { content: 'not json' } }] } as any)) };
    const out = await tailorQuestions(IDEA, { client });
    expect(out.questions).toHaveLength(10);
    expect(out.tailored).toBe(false);
  });

  it('does not call the model for an idea too thin to tailor against', async () => {
    const client = stub({ questions: [] });
    const out = await tailorQuestions('a scheduler', { client });
    expect(client.create).not.toHaveBeenCalled();
    expect(out.reason).toMatch(/too short/);
  });
});

describe('non-negotiables survive a document that dropped them', () => {
  // MEASURED, not hypothetical. A live Architect run on 2026-08-12 expanded a
  // 1,995-char brief into 183,396 chars and the word "approv" appeared ZERO
  // times — the guardrail sentence was gone. It kept the operator, Dentrix,
  // Twilio and the waitlist, and lost the one line protecting a patient.
  const DROPPED_GUARDRAIL =
    '# Chapter 1\nThe system predicts no-shows for the front desk using the Dentrix export '
    + 'and Twilio, and offers released slots to the waitlist in priority order.\n';

  it('reinstates the guardrail the expansion dropped', () => {
    const out = reinforceNonNegotiables(DROPPED_GUARDRAIL, FULL);
    expect(out.reinstated).toContain('q6_never');
    expect(out.document).toContain(FULL.q6_never);
    expect(out.document.toLowerCase()).toContain('approv');
  });

  it('reinstates the measurable definition of done and the evidence rule too', () => {
    const out = reinforceNonNegotiables(DROPPED_GUARDRAIL, FULL);
    expect(out.reinstated).toEqual(['q6_never', 'q7_measure', 'q10_evidence']);
  });

  it('tells the model which side wins on a conflict', () => {
    expect(reinforceNonNegotiables(DROPPED_GUARDRAIL, FULL).document)
      .toMatch(/Where anything above[\s\S]*conflicts with them, these win/);
  });

  it('leaves a document alone when it already carries them', () => {
    const complete = `${DROPPED_GUARDRAIL}\n${FULL.q6_never}\n${FULL.q7_measure}\n${FULL.q10_evidence}`;
    const out = reinforceNonNegotiables(complete, FULL);
    expect(out.reinstated).toEqual([]);
    expect(out.document).toBe(complete);
  });

  it('is idempotent — re-running never grows the document again', () => {
    const once = reinforceNonNegotiables(DROPPED_GUARDRAIL, FULL);
    const twice = reinforceNonNegotiables(once.document, FULL);
    expect(twice.reinstated).toEqual([]);
    expect(twice.document).toBe(once.document);
  });

  it('matches on a phrase, so a paraphrase still counts as present', () => {
    // Whole-sentence matching would almost always miss (documents paraphrase);
    // single-word matching would almost always hit by accident.
    const paraphrased = 'Policy: no appointment is ever cancelled without a human approving it first, ever.';
    const out = reinforceNonNegotiables(paraphrased, { q6_never: FULL.q6_never });
    expect(out.reinstated).not.toContain('q6_never');
  });

  it('does nothing to an empty document', () => {
    expect(reinforceNonNegotiables('', FULL)).toEqual({ document: '', reinstated: [] });
  });

  it('does nothing when the student answered none of the three', () => {
    const out = reinforceNonNegotiables(DROPPED_GUARDRAIL, { q1_job: 'Only this.' });
    expect(out.reinstated).toEqual([]);
    expect(out.document).toBe(DROPPED_GUARDRAIL);
  });
});

describe('presence detection needs proximity, not just overlap', () => {
  /**
   * The failure a small fixture cannot show. Measured against the real 183,396-
   * character Architect output: "appointment", "cancelled", "released", "human"
   * and "front" all appear SOMEWHERE in a healthcare document — 86% of the
   * guardrail's distinctive words — so a whole-document overlap check judged the
   * guardrail present in a document containing "approv" zero times.
   */
  const GUARDRAIL = 'No appointment is ever cancelled without a human at the front desk approving it.';

  const scattered = [
    'Chapter 2 covers appointment scheduling and the daily roster.',
    'x'.repeat(3000),
    'Chapter 5 explains how a slot is released back to the pool.',
    'y'.repeat(3000),
    'Chapter 7 discusses cancelled visits and their billing treatment.',
    'z'.repeat(3000),
    'Chapter 9 describes the front desk workflow and human factors.',
  ].join('\n');

  it('does NOT count words scattered across a long document as the requirement being present', () => {
    expect(scattered.toLowerCase()).toContain('appointment');
    expect(scattered.toLowerCase()).toContain('cancelled');
    expect(scattered.toLowerCase()).toContain('front');
    expect(scattered.toLowerCase()).not.toContain('approv');

    const out = reinforceNonNegotiables(scattered, { q6_never: GUARDRAIL });
    expect(out.reinstated).toEqual(['q6_never']);
  });

  it('DOES count them when they appear together, however reworded', () => {
    const together = 'x'.repeat(5000)
      + '\nPolicy: the front desk must approve before any appointment is cancelled or a slot released to a human waitlist.\n'
      + 'y'.repeat(5000);
    const out = reinforceNonNegotiables(together, { q6_never: GUARDRAIL });
    expect(out.reinstated).toEqual([]);
  });
});
