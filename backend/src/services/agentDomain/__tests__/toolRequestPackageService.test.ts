/**
 * AF11.8 — attaching the decision package, and the one behaviour that distinguishes a BOUNCE from
 * a refusal.
 *
 * The ticket's word is *"bounces"*, not "refuses": *"A request missing one does not reach Ali; it
 * bounces to the agent naming the block."* So the property these tests exist for is that an
 * INCOMPLETE PACKAGE IS SAVED. If it were rejected, an agent could not keep half-written work and
 * would have to compose all ten blocks in one shot or lose them.
 *
 * The other half is that readiness is COMPUTED and never stored, so there is no flag that can
 * drift out of agreement with the package beside it.
 */

const mockTransaction = jest.fn();
const mockRequestFindByPk = jest.fn();
const mockPackageFindByPk = jest.fn();
const mockPackageFindAll = jest.fn();
const mockPackageCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockRequestFindByPk(...a) },
}));
jest.mock('../../../models/AgentDomainToolRequestPackage', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: unknown[]) => mockPackageFindByPk(...a),
    findAll: (...a: unknown[]) => mockPackageFindAll(...a),
    create: (...a: unknown[]) => mockPackageCreate(...a),
  },
}));

import type { Sequelize } from 'sequelize';
import {
  NO_PACKAGE,
  PackageOnAChangeRequestError,
  PackageOnADecidedRequestError,
  PackageRequestNotFoundError,
  attachPackage,
  loadPackages,
  readinessOf,
} from '../toolRequestPackageService';
import type { ToolRequestPackageInput } from '../toolRequestPackageContract';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-17T12:00:00.000Z');

/** A sequelize stand-in whose `transaction` just runs the callback. */
const fakeSequelize = () => ({
  transaction: (fn: (t: unknown) => unknown) => mockTransaction(fn),
} as unknown as Sequelize);

function completeInput(over: Partial<ToolRequestPackageInput> = {}): ToolRequestPackageInput {
  return {
    executive_summary: 'Sarbjit drafts pages by hand. This asks for a drafter. B grants what exists.',
    problem: 'Three hours a week spent drafting pages Sohail then rewrites.',
    key_findings: [{ finding: '3 hours a week', source: "Sarbjit's time log, 10 Nov 2026" }],
    options: [
      { key: 'A', summary: 'Build a drafter', what_happens: 'Two weeks of build.', verb: 'approve_to_build' },
      { key: 'B', summary: 'Grant the existing builder', what_happens: 'Usable today.', verb: 'assign_existing_tool' },
    ],
    recommendation: 'B',
    recommendation_reason: 'The endpoints already exist.',
    impact: 'About 3 hours a week back.',
    risk_can_break: ['A draft published before review'],
    risk_cannot_break: ['It cannot publish'],
    simulated_action: 'Ran the drafter over the last 12 briefs.',
    simulated_against: 'The 12 briefs filed between 1 Sep and 10 Nov 2026',
    simulated_at: '2026-11-16T09:00:00.000Z',
    steps_that_follow: ['Grant the tool', 'Draft one page', 'Report the edit count'],
    ...over,
  };
}

/** What the model hands back after a write, shaped as the row really is. */
const storedRow = (input: ToolRequestPackageInput) => ({
  change_request_id: ID,
  executive_summary: input.executive_summary ?? '',
  problem: input.problem ?? '',
  key_findings: input.key_findings ?? [],
  options: input.options ?? [],
  recommendation: input.recommendation ?? '',
  recommendation_reason: input.recommendation_reason ?? '',
  impact: input.impact ?? '',
  risk_can_break: input.risk_can_break ?? [],
  risk_cannot_break: input.risk_cannot_break ?? [],
  simulated_action: input.simulated_action ?? '',
  simulated_against: input.simulated_against ?? '',
  simulated_at: new Date(input.simulated_at ?? 0),
  steps_that_follow: input.steps_that_follow ?? [],
  update: mockUpdate,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn('txn'));
  mockRequestFindByPk.mockResolvedValue({ id: ID, kind: 'tool', status: 'submitted' });
  mockPackageFindByPk.mockResolvedValue(null);
  mockPackageCreate.mockResolvedValue(undefined);
});

describe('THE CONTROL', () => {
  it('a complete package is written and reads back ready for a human', async () => {
    const input = completeInput();
    mockPackageFindByPk
      .mockResolvedValueOnce(null)              // the "does one exist" read
      .mockResolvedValueOnce(storedRow(input)); // the read-back
    const out = await attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input, now: NOW });
    expect(mockPackageCreate).toHaveBeenCalled();
    expect(out.readiness.has_package).toBe(true);
    expect(out.readiness.ready_for_a_human).toBe(true);
    expect(out.readiness.bounced_blocks).toEqual([]);
  });
});

describe('A BOUNCE IS NOT A REFUSAL — the property this module exists for', () => {
  it('SAVES an incomplete package and names the blocks that are outstanding', async () => {
    // Refusing would mean an agent cannot keep half-written work, which would force it to compose
    // all ten blocks in one shot and lose everything on the first mistake.
    const input = completeInput({ problem: '', impact: '', steps_that_follow: [] });
    mockPackageFindByPk.mockResolvedValueOnce(null).mockResolvedValueOnce(storedRow(input));

    const out = await attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input, now: NOW });

    expect(mockPackageCreate).toHaveBeenCalled();           // IT WAS SAVED
    expect(out.readiness.ready_for_a_human).toBe(false);    // AND IT IS NOT READY
    expect(out.readiness.bounced_blocks).toEqual(
      expect.arrayContaining(['problem', 'possible_impact', 'steps_that_follow']),
    );
  });

  it('carries the SENTENCES, not only the block names, so the agent knows what to write', async () => {
    const input = completeInput({ simulated_against: '' });
    mockPackageFindByPk.mockResolvedValueOnce(null).mockResolvedValueOnce(storedRow(input));
    const out = await attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input, now: NOW });
    const reason = out.readiness.bounce_reasons.find((i) => i.block === 'simulated_action');
    expect(reason).toBeDefined();
    expect(String(reason?.detail).length).toBeGreaterThan(20);
  });

  it('replaces rather than appends when a package already exists', async () => {
    // One package per request, by primary key. A second row would mean two arguments and no way
    // to know which one Ali read.
    const input = completeInput();
    const existing = storedRow(completeInput({ problem: 'the old problem' }));
    mockPackageFindByPk.mockResolvedValueOnce(existing).mockResolvedValueOnce(storedRow(input));
    await attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input, now: NOW });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockPackageCreate).not.toHaveBeenCalled();
  });
});

describe('what cannot carry a package', () => {
  it('refuses a request that does not exist', async () => {
    mockRequestFindByPk.mockResolvedValue(null);
    await expect(attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input: completeInput(), now: NOW }))
      .rejects.toBeInstanceOf(PackageRequestNotFoundError);
  });

  it('refuses a CHANGE request: the ten blocks are the script for letting an agent act', async () => {
    mockRequestFindByPk.mockResolvedValue({ id: ID, kind: 'change', status: 'submitted' });
    await expect(attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input: completeInput(), now: NOW }))
      .rejects.toBeInstanceOf(PackageOnAChangeRequestError);
  });

  it('REFUSES A REWRITE AFTER THE DECISION, because that changes the argument after it was read', async () => {
    mockRequestFindByPk.mockResolvedValue({ id: ID, kind: 'tool', status: 'approved' });
    await expect(attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input: completeInput(), now: NOW }))
      .rejects.toBeInstanceOf(PackageOnADecidedRequestError);
    expect(mockPackageCreate).not.toHaveBeenCalled();
  });

  it('locks the request row, so two writers cannot both think theirs is the package', async () => {
    const input = completeInput();
    mockPackageFindByPk.mockResolvedValueOnce(null).mockResolvedValueOnce(storedRow(input));
    await attachPackage({ sequelize: fakeSequelize(), changeRequestId: ID, input, now: NOW });
    const opts = mockRequestFindByPk.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.lock).toBeDefined();
    expect(opts.transaction).toBe('txn');
  });
});

describe('readiness is COMPUTED, never stored', () => {
  it('a request with no package is not ready, and says nobody has written one', () => {
    expect(readinessOf(null)).toEqual(NO_PACKAGE);
    expect(NO_PACKAGE.has_package).toBe(false);
    expect(NO_PACKAGE.ready_for_a_human).toBe(false);
    // Distinct facts: "nobody wrote one" is not "one was written and three blocks are thin".
    expect(NO_PACKAGE.bounced_blocks).toEqual([]);
  });

  it('judges the SAME package differently as the clock moves past its simulation date', () => {
    // The clearest proof there is no stored flag: nothing about the row changed, and the answer
    // did. A `ready` column written at save time would have frozen the wrong answer.
    const future = {
      ...completeInput({ simulated_at: '2026-11-18T09:00:00.000Z' }),
    } as never;
    const beforeIt = readinessOf(future, new Date('2026-11-17T12:00:00.000Z'));
    const afterIt = readinessOf(future, new Date('2026-11-19T12:00:00.000Z'));
    expect(beforeIt.ready_for_a_human).toBe(false);
    expect(beforeIt.bounced_blocks).toContain('simulated_action');
    expect(afterIt.ready_for_a_human).toBe(true);
  });
});

describe('loading a page of packages', () => {
  it('asks ONE query for the whole page, not one per request', async () => {
    mockPackageFindAll.mockResolvedValue([]);
    await loadPackages(['a', 'b', 'c']);
    expect(mockPackageFindAll).toHaveBeenCalledTimes(1);
    expect(mockPackageFindAll).toHaveBeenCalledWith({ where: { change_request_id: ['a', 'b', 'c'] } });
  });

  it('asks NOTHING for an empty page, so a queue of change requests costs no query', async () => {
    const out = await loadPackages([]);
    expect(out.size).toBe(0);
    expect(mockPackageFindAll).not.toHaveBeenCalled();
  });
});
