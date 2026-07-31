import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

const mockNoActionExecutor = jest.fn(async () => ({ ok: true }));
const mockMarkWaitingExecutor = jest.fn(async () => ({ ok: true }));
const mockEmailArchiveExecutor = jest.fn(async () => ({ message_id: 'archived-1' }));
const mockFailingExecutor = jest.fn(async () => {
  throw Object.assign(new Error('provider unavailable'), { error_class: 'ProviderTimeoutError' });
});

jest.mock('../caseActionExecutors', () => ({
  ACTION_EXECUTORS: {
    NO_ACTION: (...args: any[]) => mockNoActionExecutor(...args),
    MARK_WAITING: (...args: any[]) => mockMarkWaitingExecutor(...args),
    EMAIL_LABEL: (...args: any[]) => mockEmailArchiveExecutor(...args),
    BASECAMP_COMMENT: (...args: any[]) => mockFailingExecutor(...args),
  },
  ClassifiedExecutionError: class ClassifiedExecutionError extends Error {
    error_class: string;
    constructor(errorClass: string, message: string) {
      super(message);
      this.error_class = errorClass;
    }
  },
}));

import { executeApprovedActions, reconcileStuckActions } from '../caseExecutionService';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  mockNoActionExecutor.mockClear();
  mockMarkWaitingExecutor.mockClear();
  mockEmailArchiveExecutor.mockClear();
  mockFailingExecutor.mockClear();
});

async function seedCase(state = 'AWAITING_APPROVAL') {
  return fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state, correlation_id: randomUUID(), reopen_count: 0 });
}

async function seedAction(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseAction.create({
    case_id: caseId,
    action_type: 'NO_ACTION',
    target_source: 'case',
    preview: 'preview',
    payload: {},
    risk_level: 'LOW',
    requires_individual_approval: false,
    status: 'APPROVED',
    depends_on_action_ids: [],
    idempotency_key: randomUUID(),
    attempt_count: 0,
    acting_admin: 'system',
    correlation_id: randomUUID(),
    ...overrides,
  });
}

describe('executeApprovedActions — happy path', () => {
  it('executes every APPROVED action and marks it SUCCEEDED with a receipt', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id);

    const result = await executeApprovedActions(c.id, 'ali@colaberry.com');

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(a.status).toBe('SUCCEEDED');
    expect(a.external_receipt).toEqual({ ok: true });
    expect(mockNoActionExecutor).toHaveBeenCalledTimes(1);
  });

  it('transitions the case from AWAITING_APPROVAL to EXECUTING at the start of a run', async () => {
    const c = await seedCase();
    await seedAction(c.id);
    await executeApprovedActions(c.id, 'ali@colaberry.com');
    // No failures in this test -> case stays EXECUTING awaiting Verify.
    expect(c.state).toBe('EXECUTING');
  });

  it('skips actions that are not APPROVED (e.g. still PROPOSED or already REJECTED)', async () => {
    const c = await seedCase();
    await seedAction(c.id, { status: 'PROPOSED' });
    await seedAction(c.id, { status: 'REJECTED' });
    const result = await executeApprovedActions(c.id, 'ali@colaberry.com');
    expect(result.executed).toBe(0);
  });
});

describe('executeApprovedActions — dependency ordering and failure blocking', () => {
  it('a failed action blocks its dependent (archive) action from executing — SKIPPED, not executed', async () => {
    const c = await seedCase();
    const basecampAction = await seedAction(c.id, { action_type: 'BASECAMP_COMMENT' }); // wired to mockFailingExecutor
    const archiveAction = await seedAction(c.id, { action_type: 'EMAIL_LABEL', depends_on_action_ids: [basecampAction.id] });

    const result = await executeApprovedActions(c.id, 'ali@colaberry.com');

    expect(basecampAction.status).toBe('FAILED');
    expect(archiveAction.status).toBe('SKIPPED');
    expect(mockEmailArchiveExecutor).not.toHaveBeenCalled(); // never attempted
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('archive actions execute only after their dependencies succeed', async () => {
    const c = await seedCase();
    const waiting = await seedAction(c.id, { action_type: 'MARK_WAITING' });
    const archive = await seedAction(c.id, { action_type: 'EMAIL_LABEL', depends_on_action_ids: [waiting.id] });

    await executeApprovedActions(c.id, 'ali@colaberry.com');

    expect(waiting.status).toBe('SUCCEEDED');
    expect(archive.status).toBe('SUCCEEDED');
    expect(mockEmailArchiveExecutor).toHaveBeenCalledTimes(1);
  });

  it('transitions the case to FAILED when any action fails', async () => {
    const c = await seedCase();
    await seedAction(c.id, { action_type: 'BASECAMP_COMMENT' });
    await executeApprovedActions(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('FAILED');
  });
});

describe('executeApprovedActions — rejects execution from the wrong case state', () => {
  it('rejects executing a case still in NEEDS_ALI', async () => {
    const c = await seedCase('NEEDS_ALI');
    await seedAction(c.id);
    await expect(executeApprovedActions(c.id, 'ali@colaberry.com')).rejects.toThrow();
  });

  it('allows re-invoking execute on a case already in EXECUTING (retry semantics)', async () => {
    const c = await seedCase('EXECUTING');
    await seedAction(c.id);
    const result = await executeApprovedActions(c.id, 'ali@colaberry.com');
    expect(result.succeeded).toBe(1);
  });
});

describe('reconcileStuckActions — interrupted-run recovery', () => {
  it('promotes a stuck EXECUTING action with an existing receipt to SUCCEEDED (never re-executes)', async () => {
    const c = await seedCase();
    const stuck = await seedAction(c.id, { status: 'EXECUTING', external_receipt: { message_id: 'already-sent' } });

    await reconcileStuckActions(c.id);

    expect(stuck.status).toBe('SUCCEEDED');
  });

  it('resets a stuck EXECUTING action with NO receipt back to APPROVED so it retries safely', async () => {
    const c = await seedCase();
    const stuck = await seedAction(c.id, { status: 'EXECUTING', external_receipt: null });

    await reconcileStuckActions(c.id);

    expect(stuck.status).toBe('APPROVED');
  });

  it('a full execute() run reconciles a stuck action from a prior interrupted run before proceeding', async () => {
    const c = await seedCase('EXECUTING');
    const stuck = await seedAction(c.id, { status: 'EXECUTING', external_receipt: null, action_type: 'NO_ACTION' });

    const result = await executeApprovedActions(c.id, 'ali@colaberry.com');

    expect(stuck.status).toBe('SUCCEEDED'); // reconciled to APPROVED, then executed fresh
    expect(result.succeeded).toBe(1);
  });
});

describe('executeApprovedActions — never duplicates a side effect on retry', () => {
  it('an action already SUCCEEDED is not re-executed on a second Execute call', async () => {
    const c = await seedCase('EXECUTING');
    const already = await seedAction(c.id, { status: 'SUCCEEDED', external_receipt: { ok: true } });

    await executeApprovedActions(c.id, 'ali@colaberry.com');

    expect(mockNoActionExecutor).not.toHaveBeenCalled();
    expect(already.status).toBe('SUCCEEDED');
  });
});
