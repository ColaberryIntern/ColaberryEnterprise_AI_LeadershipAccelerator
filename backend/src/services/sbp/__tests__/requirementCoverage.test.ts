import {
  REQUIREMENT_CHECKLIST, mergeMissed, quoteIsInSource, completeRequirements, buildCoveragePrompt,
  COVERAGE_JSON_SCHEMA, MAX_COVERAGE_ROUNDS,
} from '../requirementCoverage';
import { buildRequirementExtractionPrompt } from '../requirementExtraction';
import { BUILD_PLAN_JSON_SCHEMA, PlanRequirement } from '../planContract';

// The ShiftFill brief's own words (2026-11-19), the run that lost 13 of 14 stated facts.
const SOURCE = [
  'What good would look like: Gaps filled within 30 minutes on 9 mornings out of 10, under 10 minutes of Dana’s time.',
  'What I want to look at myself before it goes out: Any offer that would put someone into overtime, and any message to a temp agency (they bill us).',
  'What I\'d drop to get it: The Dentrix integration can wait; Sheets first.',
].join('\n');

const REQ = (id: string, statement: string, kind: PlanRequirement['kind'] = 'FUNC'): PlanRequirement => ({
  id, statement, kind, priority: 'must', cluster: 'Core', from_dimensions: [],
});

const EXISTING = [REQ('REQ-001', 'The system must open a gap when a call-out arrives.'), REQ('REQ-002', 'The system must use Twilio SMS.', 'CONSTRAINT')];

describe('the checklist', () => {
  it('names the facts ShiftFill lost: numbers as NFR, approvals and never-rules as SAFE, reports', () => {
    expect(REQUIREMENT_CHECKLIST).toMatch(/success target.*WITH its numbers/s);
    expect(REQUIREMENT_CHECKLIST).toMatch(/approval point.*SAFE/s);
    expect(REQUIREMENT_CHECKLIST).toMatch(/"never" rule/);
    expect(REQUIREMENT_CHECKLIST).toMatch(/report, summary, explanation/);
    expect(REQUIREMENT_CHECKLIST).toMatch(/deferred, put out of scope/);
  });

  it('is sent to the extraction stage and the audit alike', () => {
    expect(buildRequirementExtractionPrompt({ brief: SOURCE, document: '' })).toContain(REQUIREMENT_CHECKLIST);
    expect(buildCoveragePrompt({ brief: SOURCE, document: '' }, EXISTING)).toContain(REQUIREMENT_CHECKLIST);
  });

  it('shows the audit the existing set, then the source', () => {
    const p = buildCoveragePrompt({ brief: SOURCE, document: '' }, EXISTING);
    expect(p.indexOf('REQ-001')).toBeLessThan(p.indexOf('<ORIGINAL_BRIEF>'));
  });
});

describe('the schema', () => {
  it('reuses the plan\'s own requirement property schemas by reference and has no id', () => {
    const item = (BUILD_PLAN_JSON_SCHEMA as any).properties.requirements.items.properties;
    const mine = (COVERAGE_JSON_SCHEMA as any).properties.missing.items.properties.requirement.properties;
    expect(mine.statement).toBe(item.statement);
    expect(mine.kind).toBe(item.kind);
    expect(mine.id).toBeUndefined();
  });
});

describe('quoteIsInSource', () => {
  it('accepts a verbatim quote across typography and whitespace differences', () => {
    expect(quoteIsInSource("under 10 minutes of Dana's time", SOURCE)).toBe(true);
    expect(quoteIsInSource('any message to a temp   agency', SOURCE)).toBe(true);
  });
  it('refuses a paraphrase and a quote too short to prove anything', () => {
    expect(quoteIsInSource('temp agencies must be approved by Dana', SOURCE)).toBe(false);
    expect(quoteIsInSource('Sheets', SOURCE)).toBe(false);
  });
});

describe('mergeMissed', () => {
  it('adds a quoted requirement with the next id and never touches the existing ones', () => {
    const m = mergeMissed(EXISTING, [{
      quote: 'Gaps filled within 30 minutes on 9 mornings out of 10',
      requirement: { statement: 'Gaps must be filled within 30 minutes on 9 mornings out of 10.', kind: 'NFR', priority: 'must', cluster: 'Outcomes', from_dimensions: ['success_definition'] },
    }], SOURCE);
    expect(m.requirements.slice(0, 2)).toEqual(EXISTING);
    expect(m.requirements[2]).toMatchObject({ id: 'REQ-003', kind: 'NFR' });
    expect(m.added).toEqual([{ id: 'REQ-003', quote: 'Gaps filled within 30 minutes on 9 mornings out of 10' }]);
  });

  it('refuses an addition whose quote is not in the source: that is an invented requirement', () => {
    const m = mergeMissed(EXISTING, [{
      quote: 'The system must integrate with Stripe for payroll',
      requirement: { statement: 'The system must pay hygienists through Stripe.', kind: 'FUNC', priority: 'must', cluster: 'Pay', from_dimensions: [] },
    }], SOURCE);
    expect(m.requirements).toHaveLength(2);
    expect(m.refused).toEqual([{ quote: 'The system must integrate with Stripe for payroll', reason: 'quote_not_in_source' }]);
  });

  it('refuses a duplicate of an existing statement', () => {
    const m = mergeMissed(EXISTING, [{
      quote: 'any message to a temp agency (they bill us)',
      requirement: { statement: 'The system must open a gap when a call-out arrives.', kind: 'FUNC', priority: 'must', cluster: 'Core', from_dimensions: [] },
    }], SOURCE);
    expect(m.refused[0].reason).toBe('duplicate_statement');
  });
});

describe('completeRequirements', () => {
  const reply = (missing: unknown[]) => ({ choices: [{ message: { content: JSON.stringify({ missing }) } }] });
  const temp = {
    quote: 'any message to a temp agency (they bill us)',
    requirement: { statement: 'Dana must approve any message to a temp agency before it is sent.', kind: 'SAFE', priority: 'must', cluster: 'Approvals', from_dimensions: ['approval_points'] },
  };

  it('runs a second round when the first added something, and stops when a round adds nothing', async () => {
    const create = jest.fn()
      .mockResolvedValueOnce(reply([temp]))
      .mockResolvedValueOnce(reply([]));
    const out = await completeRequirements(EXISTING, { brief: SOURCE, document: '', model: 'm', client: { create } as any });
    expect(create).toHaveBeenCalledTimes(2);
    expect(out.added.map((a) => a.id)).toEqual(['REQ-003']);
    expect(out.requirements[2].kind).toBe('SAFE');
  });

  it('is bounded', async () => {
    let i = 0;
    const create = jest.fn(async () => reply([{ ...temp, requirement: { ...temp.requirement, statement: `Variant ${i += 1} of the temp agency rule.` } }]));
    await completeRequirements(EXISTING, { brief: SOURCE, document: '', model: 'm', client: { create } as any });
    expect(create).toHaveBeenCalledTimes(MAX_COVERAGE_ROUNDS);
  });

  it('never fails the build: an upstream error returns the set it was given', async () => {
    const create = jest.fn(async () => { throw new Error('socket hang up'); });
    const out = await completeRequirements(EXISTING, { brief: SOURCE, document: '', model: 'm', client: { create } as any });
    expect(out.requirements).toEqual(EXISTING);
    expect(out.added).toEqual([]);
  });
});
