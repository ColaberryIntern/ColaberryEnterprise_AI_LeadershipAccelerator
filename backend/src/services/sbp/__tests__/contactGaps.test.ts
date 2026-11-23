/**
 * ShiftFill v7, v9 and v12 kept a guard on messaging the temp agencies and dropped the
 * step that contacts them ("Then our two temp agencies."). The statements below are
 * those runs' own, verbatim.
 */
import { uncontactedParties, contactGapFocus } from '../contactGaps';
import { completeRequirements, MAX_COVERAGE_ROUNDS } from '../requirementCoverage';
import { PlanRequirement } from '../planContract';

const REQ = (id: string, statement: string, kind: PlanRequirement['kind'] = 'FUNC'): PlanRequirement => ({
  id, statement, kind, priority: 'must', cluster: 'Core', from_dimensions: [],
});
const RANK = REQ('REQ-002', 'The system must rank hygienists to offer the shift to based on being off that day, licensed for that office, under 40 hours that week, and nearest by commute.');
const V12_GUARD = REQ('REQ-020', 'The system must flag any message to a temp agency for Dana to review before sending.', 'SAFE');

describe('uncontactedParties', () => {
  it('finds the guard with no contacting step, in every dropped run\'s wording', () => {
    for (const g of [
      'The system must require Dana\'s approval before sending any message to a temp agency.', // v8 shape
      'The system must flag any message to a temp agency for Dana to review before sending.', // v12
      'The system must have Dana approve any message sent to a temp agency.', // v10 shape
      'Dana must approve any message sent to a temp agency.', // v7
    ]) {
      expect(uncontactedParties([RANK, REQ('REQ-019', g, 'SAFE')])).toEqual([{ guard: 'REQ-019', party: 'temp agency' }]);
    }
  });

  it('is satisfied by any non-guard requirement that names the party, plural or not (v8, v10)', () => {
    for (const s of [
      'The system must offer shifts to the two temp agencies after ranking hygienists.',
      'The system must offer shifts to two temp agencies if no hygienists accept.',
    ]) {
      expect(uncontactedParties([RANK, REQ('REQ-018', s), V12_GUARD])).toEqual([]);
    }
  });

  it('does not count another guard or a constraint as the contacting step', () => {
    const otherGuard = REQ('REQ-021', 'The system must never share a call-out reason with a temp agency.', 'SAFE');
    const tool = REQ('REQ-016', 'The system must email each temp agency through Gmail.', 'CONSTRAINT');
    expect(uncontactedParties([RANK, V12_GUARD, otherGuard, tool])).toHaveLength(1);
  });

  it('reports each party once, and nothing for guards that are not about contacting anyone', () => {
    const second = REQ('REQ-022', 'Dana must approve any message sent to a temp agency.', 'SAFE');
    const overtime = REQ('REQ-008', 'The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.', 'SAFE');
    expect(uncontactedParties([RANK, V12_GUARD, second, overtime])).toEqual([{ guard: 'REQ-020', party: 'temp agency' }]);
    expect(uncontactedParties([])).toEqual([]);
  });

  it('names the party in the focus instruction, and is empty with no gaps', () => {
    expect(contactGapFocus([{ guard: 'REQ-020', party: 'temp agency' }])).toContain('- REQ-020 guards contacting "temp agency".');
    expect(contactGapFocus([])).toBe('');
  });
});

describe('the audit runs one focused round for a contact gap', () => {
  const SOURCE = [
    'Rank who to offer the shift to: hygienists who are off that day, licensed for that office, under 40 hours that week, and nearest by commute. Then our two temp agencies.',
    'What I want to look at myself before it goes out: any message to a temp agency (they bill us).',
  ].join('\n');
  const reply = (missing: unknown[]) => ({ choices: [{ message: { content: JSON.stringify({ missing }) } }] });
  const OFFER = {
    quote: 'Then our two temp agencies.',
    requirement: { statement: 'The system must offer the shift to the two temp agencies after the ranked hygienists.', kind: 'FUNC', priority: 'must', cluster: 'Offers', from_dimensions: [] },
  };
  const opts = (create: jest.Mock) => ({ brief: SOURCE, document: '', model: 'm', client: { create } as any });

  it('asks about the party once, and keeps the step when the source has it (v12)', async () => {
    const create = jest.fn().mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply([OFFER]));
    const out = await completeRequirements([RANK, V12_GUARD], opts(create));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].messages[1].content).not.toContain('FOCUS FOR THIS ROUND');
    expect(create.mock.calls[1][0].messages[1].content).toContain('- REQ-020 guards contacting "temp agency".');
    expect(out.added).toEqual([{ id: 'REQ-021', quote: 'Then our two temp agencies.' }]);
    expect(out.rounds).toBe(2);
  });

  it('adds nothing it cannot quote: an invented contacting step is refused', async () => {
    const invented = { ...OFFER, quote: 'Call the agencies at 7:15 every day.' };
    const create = jest.fn().mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply([invented]));
    const out = await completeRequirements([RANK, V12_GUARD], opts(create));
    expect(out.added).toEqual([]);
  });

  it('makes no extra call when there is no gap, or after a failed call', async () => {
    const fine = jest.fn().mockResolvedValueOnce(reply([]));
    await completeRequirements([RANK, REQ('REQ-018', OFFER.requirement.statement), V12_GUARD], opts(fine));
    expect(fine).toHaveBeenCalledTimes(1);
    const down = jest.fn(async () => { throw new Error('socket hang up'); });
    const out = await completeRequirements([RANK, V12_GUARD], opts(down as unknown as jest.Mock));
    expect(out.requirements).toEqual([RANK, V12_GUARD]);
  });

  it('runs at most one focused round on top of the normal ones', async () => {
    let i = 0;
    const filler = () => { i += 1; return { quote: 'Then our two temp agencies.', requirement: { statement: `Zone w${i}a w${i}b quorum.`, kind: 'NFR', priority: 'must', cluster: 'c', from_dimensions: [] } }; };
    const create = jest.fn(async () => reply([filler(), filler(), filler()]));
    await completeRequirements([RANK, V12_GUARD], opts(create as unknown as jest.Mock));
    expect(create).toHaveBeenCalledTimes(MAX_COVERAGE_ROUNDS + 1);
  });
});
