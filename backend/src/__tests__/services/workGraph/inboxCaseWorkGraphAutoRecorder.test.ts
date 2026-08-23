import { listWorkUnitsForTicket, createWorkUnit, addWorkUnitDependency } from '../../../services/workGraph/workGraphService';
import { recordWorkUnitForCaseState } from '../../../services/workGraph/inboxCaseWorkGraphAutoRecorder';

// Work Graph auto-recorder for Inbox Cases (2026-08-23) — Ali, live: "I don't
// see any visual proofs or work graphs in your examples." createWorkUnit() had
// zero automated callers before this change; this module is the fix, one real
// work unit per real CaseState the case actually enters, chained by a real
// dependency edge — never a fabricated straight-line story.

jest.mock('../../../services/workGraph/workGraphService', () => ({
  listWorkUnitsForTicket: jest.fn(),
  createWorkUnit: jest.fn(),
  addWorkUnitDependency: jest.fn(),
}));

const mockListWorkUnits = listWorkUnitsForTicket as unknown as jest.Mock;
const mockCreateWorkUnit = createWorkUnit as unknown as jest.Mock;
const mockAddDependency = addWorkUnitDependency as unknown as jest.Mock;

const TICKET_ID = '22222222-2222-4222-8222-222222222222';

function makeUnit(id: string, title: string, status = 'in_progress') {
  return { id, title, status, update: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListWorkUnits.mockResolvedValue([]);
  mockCreateWorkUnit.mockImplementation(async (_ticketId: string, input: any) =>
    makeUnit('new-unit', input.title, input.status),
  );
  mockAddDependency.mockResolvedValue({ id: 'dep-1' });
});

describe('recordWorkUnitForCaseState', () => {
  it('happy path: first call for a case (no existing units) creates one unit, no dependency edge (nothing to chain to)', async () => {
    await recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'DISCOVERING');

    expect(mockCreateWorkUnit).toHaveBeenCalledWith(TICKET_ID, {
      title: 'Discovering the case',
      requiredCapability: 'inbox_case_triage',
      status: 'in_progress',
    });
    expect(mockAddDependency).not.toHaveBeenCalled();
  });

  it('sets assigned_agent_name to InboxCaseEngine on the created unit', async () => {
    const created = makeUnit('u1', 'Discovering the case');
    mockCreateWorkUnit.mockResolvedValue(created);

    await recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'DISCOVERING');

    expect(created.update).toHaveBeenCalledWith({ assigned_agent_name: 'InboxCaseEngine' });
  });

  it('happy path: a real state change marks the prior unit done and chains the new one to it with a real dependency edge', async () => {
    const prior = makeUnit('u-prior', 'Discovering the case', 'in_progress');
    mockListWorkUnits.mockResolvedValue([prior]);
    const created = makeUnit('u-new', 'Assessing the case');
    mockCreateWorkUnit.mockResolvedValue(created);

    await recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'ASSESSING');

    expect(prior.update).toHaveBeenCalledWith({ status: 'done', updated_at: expect.any(Date) });
    expect(mockAddDependency).toHaveBeenCalledWith('u-new', { dependsOnWorkUnitId: 'u-prior' });
  });

  it('idempotency: the same state re-written as the ticket\'s most recent unit is a no-op — no duplicate unit, no dependency edge', async () => {
    const latest = makeUnit('u1', 'Assessing the case', 'in_progress');
    mockListWorkUnits.mockResolvedValue([latest]);

    await recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'ASSESSING');

    expect(mockCreateWorkUnit).not.toHaveBeenCalled();
    expect(latest.update).not.toHaveBeenCalled();
  });

  it("honesty: a real loop back to a PREVIOUSLY-visited (but not most-recent) state IS recorded as a new unit — never deduplicated across the whole history, only against the immediately-latest one", async () => {
    // Case bounced ASSESSING -> NEEDS_ALI -> ASSESSING again. The most recent
    // unit is 'Needs Ali's input', not 'Assessing the case', so re-entering
    // ASSESSING must create a genuinely new unit reflecting the real bounce.
    const priorAssessing = makeUnit('u-assess-1', 'Assessing the case', 'done');
    const needsAli = makeUnit('u-needs-ali', "Needs Ali's input", 'in_progress');
    mockListWorkUnits.mockResolvedValue([priorAssessing, needsAli]);

    await recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'ASSESSING');

    expect(mockCreateWorkUnit).toHaveBeenCalledWith(TICKET_ID, expect.objectContaining({ title: 'Assessing the case' }));
    expect(mockAddDependency).toHaveBeenCalledWith('new-unit', { dependsOnWorkUnitId: 'u-needs-ali' });
  });

  it('terminal state RESOLVED creates a unit already marked done', async () => {
    await recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'RESOLVED');

    expect(mockCreateWorkUnit).toHaveBeenCalledWith(TICKET_ID, expect.objectContaining({ status: 'done' }));
  });

  it('terminal state FAILED creates a unit marked failed, never fabricated as a success', async () => {
    await recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'FAILED');

    expect(mockCreateWorkUnit).toHaveBeenCalledWith(TICKET_ID, expect.objectContaining({ status: 'failed' }));
  });

  it("honesty gate: a ticket type the classifier marks workGraph:'not_applicable' (e.g. 'task') never creates a work unit, even if this function were ever called for one", async () => {
    await recordWorkUnitForCaseState(TICKET_ID, 'task', 'DISCOVERING');

    expect(mockListWorkUnits).not.toHaveBeenCalled();
    expect(mockCreateWorkUnit).not.toHaveBeenCalled();
  });

  it('failure isolation: createWorkUnit rejecting never throws out of this function', async () => {
    mockCreateWorkUnit.mockRejectedValue(new Error('DB unavailable'));

    await expect(recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'DISCOVERING')).resolves.toBeUndefined();
  });

  it('failure isolation: listWorkUnitsForTicket rejecting never throws out of this function', async () => {
    mockListWorkUnits.mockRejectedValue(new Error('DB unavailable'));

    await expect(recordWorkUnitForCaseState(TICKET_ID, 'inbox_case', 'DISCOVERING')).resolves.toBeUndefined();
    expect(mockCreateWorkUnit).not.toHaveBeenCalled();
  });
});
