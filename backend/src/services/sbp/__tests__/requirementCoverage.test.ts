import {
  REQUIREMENT_CHECKLIST, mergeMissed, quoteIsInSource, completeRequirements, buildCoveragePrompt,
  COVERAGE_JSON_SCHEMA, MAX_COVERAGE_ROUNDS, restatesExisting,
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
    // ShiftFill v7/v9 lost "Then our two temp agencies." at both stages.
    expect(REQUIREMENT_CHECKLIST).toMatch(/Every fallback, in order/);
    expect(REQUIREMENT_CHECKLIST).toMatch(/approval rule about contacting someone is not the step that contacts them/);
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

describe('restatesExisting: the near-duplicates the live re-run produced (2026-11-20)', () => {
  const SET = [
    REQ('REQ-008', 'The system must never text a hygienist who is on approved leave.', 'SAFE'),
    REQ('REQ-009', "The system must never share one employee's reason for calling out with anyone else.", 'SAFE'),
    REQ('REQ-011', 'The system must fill gaps within 30 minutes of the call-out on 9 mornings out of 10.', 'NFR'),
    REQ('REQ-012', 'The system must ensure Dana spends under 10 minutes per gap.', 'NFR'),
    REQ('REQ-013', 'The system must send a weekly summary of gaps, fill times, and overtime approved to Dana.'),
  ];
  it.each([
    'The system must never text anyone on approved leave.',
    'The system must never share why someone called out.',
    'The system must ensure gaps are filled within 30 minutes on 9 mornings out of 10 and Dana spends under 10 minutes per gap.',
  ])('refuses "%s"', (s) => expect(restatesExisting(s, SET)).toBe(true));

  it.each([
    'The system must require Dana\'s approval before sending any message to a temp agency.',
    'The system must send Dana an end-of-day summary explaining each decision in plain words.',
    'The system must offer the shift to the two temp agencies after the hygienists.',
  ])('keeps "%s"', (s) => expect(restatesExisting(s, SET)).toBe(false));
});

describe('completeRequirements', () => {
  const reply = (missing: unknown[]) => ({ choices: [{ message: { content: JSON.stringify({ missing }) } }] });
  const temp = {
    quote: 'any message to a temp agency (they bill us)',
    requirement: { statement: 'Dana must approve any message to a temp agency before it is sent.', kind: 'SAFE', priority: 'must', cluster: 'Approvals', from_dimensions: ['approval_points'] },
  };

  const target = {
    quote: 'Gaps filled within 30 minutes on 9 mornings out of 10',
    requirement: { statement: 'Gaps must be filled within 30 minutes on 9 mornings out of 10.', kind: 'NFR', priority: 'must', cluster: 'Outcomes', from_dimensions: ['success_definition'] },
  };
  const speed = {
    quote: "under 10 minutes of Dana's time",
    requirement: { statement: 'Dana must spend under 10 minutes on each gap.', kind: 'NFR', priority: 'must', cluster: 'Outcomes', from_dimensions: ['success_definition'] },
  };

  it('keeps reading while a round yields real additions, and stops on a trickle', async () => {
    const create = jest.fn()
      .mockResolvedValueOnce(reply([temp, target, speed]))
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(reply([]));
    const out = await completeRequirements(EXISTING, { brief: SOURCE, document: '', model: 'm', client: { create } as any });
    // Two normal rounds, then one focused round: `temp` guards messaging an agency nothing contacts,
    // and this source never says to contact one, so that round adds nothing.
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2][0].messages[1].content).toContain('guards contacting "temp agency"');
    expect(out.added.map((a) => a.id)).toEqual(['REQ-003', 'REQ-004', 'REQ-005']);
    expect(out.requirements[2].kind).toBe('SAFE');
  });

  it('a round of one or two additions ends the audit', async () => {
    // Not `temp`: a guard on messaging an agency nobody contacts earns one focused round (contactGaps).
    const create = jest.fn().mockResolvedValueOnce(reply([target]));
    await completeRequirements(EXISTING, { brief: SOURCE, document: '', model: 'm', client: { create } as any });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('is bounded', async () => {
    let i = 0;
    const fresh = () => { i += 1; return { ...temp, requirement: { ...temp.requirement, statement: `Zone w${i}a w${i}b quorum.` } }; };
    const create = jest.fn(async () => reply([fresh(), fresh(), fresh()]));
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
