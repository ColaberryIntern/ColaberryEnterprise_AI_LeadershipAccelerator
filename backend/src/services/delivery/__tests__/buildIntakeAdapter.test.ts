/**
 * A Flotation understanding becomes a portal intake, and provenance survives the crossing.
 *
 * The SBP brief has no provenance field. If an inferred item crossed as a plain sentence the
 * decomposer would build it with the same confidence as something the customer said - which
 * is §16's forbidden merge, performed at a boundary.
 */

import {
  toBuildIntake,
  phraseForBrief,
  IDEA_MIN,
  ANSWER_MAX,
  ANSWERS_MAX,
  DEFAULT_SIZE,
  DEFAULT_TARGET_WEEKS,
} from '../buildIntakeAdapter';
import type { ProjectUnderstanding, UnderstandingItem } from '../projectUnderstanding';

const item = (over: Partial<UnderstandingItem>): UnderstandingItem => ({
  dimension: 'problem',
  value: 'x',
  classification: 'FACT',
  provenance: 'source_message',
  ...over,
} as UnderstandingItem);

const toolLibrary: ProjectUnderstanding = {
  title: 'Tool Loan Management System',
  proposed_surfaces: [],
  items: [
    item({ dimension: 'problem', value: 'Managing tool loans is challenging with a paper sign-out sheet and WhatsApp.' }),
    item({ dimension: 'desired_outcome', value: 'A system that automates overdue notifications and shows what is out.' }),
    item({ dimension: 'actors', value: 'Marta runs the desk on Saturdays; the coordinator chases overdue tools.' }),
    item({ dimension: 'current_workflow', value: 'Marta circles late items on the sheet and messages members on WhatsApp.' }),
    item({ dimension: 'data', value: 'Only a name, a phone number and what they borrowed.' }),
    item({ dimension: 'constraints', value: 'Budget approval is needed before deciding.', provenance: 'ai_inferred', classification: 'ASSUMPTION' }),
    item({ dimension: 'unknowns', value: 'Whether members book online or just check availability.', classification: 'QUESTION' }),
    item({ dimension: 'assumptions', value: 'The library has reliable wifi.', provenance: 'ai_inferred', classification: 'ASSUMPTION' }),
    item({ dimension: 'delivery_profile', value: 'Small build, single surface.', provenance: 'ai_inferred', classification: 'RECOMMENDATION' }),
  ],
};

describe('phraseForBrief — provenance kept in words', () => {
  it('passes a customer statement through as itself', () => {
    expect(phraseForBrief(item({ value: 'Marta keeps the sheet.' }))).toBe('Marta keeps the sheet.');
  });

  it('marks an inference so the decomposer does not build it as fact', () => {
    const out = phraseForBrief(item({ value: 'They need a mobile app.', provenance: 'ai_inferred', classification: 'ASSUMPTION' }));
    expect(out).toMatch(/^\(Our inference, not confirmed by the customer\)/);
    expect(out).toContain('They need a mobile app.');
  });

  it('hands an open question over as a question, not an answer', () => {
    expect(phraseForBrief(item({ value: 'Online booking or not?', classification: 'QUESTION' }))).toMatch(/^Open question/);
  });

  it('labels a recommendation and a decision', () => {
    expect(phraseForBrief(item({ value: 'Use SMS.', classification: 'RECOMMENDATION' }))).toMatch(/^\(Our recommendation\)/);
    expect(phraseForBrief(item({ value: 'One city first.', classification: 'DECISION' }))).toMatch(/^Decided:/);
  });
});

describe('toBuildIntake', () => {
  const intake = toBuildIntake(toolLibrary);

  it('builds the idea from problem, outcome and pain, in the customer\'s words', () => {
    expect(intake.idea).toContain('paper sign-out sheet');
    expect(intake.idea).toContain('automates overdue notifications');
    expect(intake.idea.length).toBeGreaterThanOrEqual(IDEA_MIN);
  });

  it('names the project from the understanding and uses the wizard\'s own tier and weeks', () => {
    expect(intake.name).toBe('Tool Loan Management System');
    expect(intake.size).toBe(DEFAULT_SIZE);
    expect(intake.targetWeeks).toBe(DEFAULT_TARGET_WEEKS);
  });

  it('turns each remaining dimension into one question-and-answer', () => {
    const ids = intake.answers.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['actors', 'current_workflow', 'data', 'constraints', 'unknowns']));
    // The question is the label, so the decomposer reads an exchange rather than a bare value.
    expect(intake.answers.find((a) => a.id === 'actors')!.question).toBe('Actors / users?');
  });

  it('does not repeat idea dimensions as answers', () => {
    const ids = intake.answers.map((a) => a.id);
    expect(ids).not.toContain('problem');
    expect(ids).not.toContain('desired_outcome');
  });

  it('never hands assumptions or our delivery read over as requirements', () => {
    const ids = intake.answers.map((a) => a.id);
    expect(ids).not.toContain('assumptions');
    expect(ids).not.toContain('delivery_profile');
  });

  it('carries an inferred constraint with its label attached', () => {
    const constraints = intake.answers.find((a) => a.id === 'constraints')!;
    expect(constraints.answer).toMatch(/Our inference/);
  });

  it('hands an unknown over as an open question', () => {
    expect(intake.answers.find((a) => a.id === 'unknowns')!.answer).toMatch(/^Open question/);
  });

  it('is pure: the same understanding renders the same intake', () => {
    expect(toBuildIntake(toolLibrary)).toEqual(intake);
  });

  it('falls back to the title when the conversation gave no idea worth the name', () => {
    const thin: ProjectUnderstanding = { title: 'Something Short', proposed_surfaces: [], items: [item({ dimension: 'actors', value: 'Two people.' })] };
    const out = toBuildIntake(thin);
    expect(out.idea).toContain('Something Short');
    expect(out.idea.length).toBeGreaterThanOrEqual(IDEA_MIN);
  });

  it('clips an oversized answer and says so rather than dropping it silently', () => {
    const long: ProjectUnderstanding = {
      ...toolLibrary,
      items: [...toolLibrary.items, item({ dimension: 'systems', value: 'x'.repeat(ANSWER_MAX + 50) })],
    };
    const out = toBuildIntake(long);
    expect(out.answers.find((a) => a.id === 'systems')!.answer.length).toBeLessThanOrEqual(ANSWER_MAX);
    expect(out.dropped.some((d) => d.dimension === 'systems' && /clipped/.test(d.reason))).toBe(true);
  });

  it('stays inside the wizard\'s answer count', () => {
    expect(intake.answers.length).toBeLessThanOrEqual(ANSWERS_MAX);
  });
});
