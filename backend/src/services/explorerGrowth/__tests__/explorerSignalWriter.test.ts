const navFindOne = jest.fn();
const navCreate = jest.fn();

jest.mock('../../../models', () => ({
  StudentNavigationEvent: {
    findOne: (...a: unknown[]) => navFindOne(...a),
    create: (...a: unknown[]) => navCreate(...a),
  },
}));

const isEnabled = jest.fn();
jest.mock('../../../config/explorerGrowthFlags', () => {
  // config/env.ts imports resolveExplorerGrowthFlags from this module to build
  // env.explorerGrowth at load time, so a mock that replaces the module wholesale
  // breaks env initialisation for the entire suite. Keep the real implementation
  // and override only the gate under test.
  const actual = jest.requireActual('../../../config/explorerGrowthFlags');
  return {
    ...actual,
    isExplorerFeatureEnabled: (...a: unknown[]) => isEnabled(...a),
  };
});

import { recordLearnerSignal } from '../explorerSignalWriter';

const ENR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  [navFindOne, navCreate, isEnabled].forEach((m) => m.mockReset());
  isEnabled.mockReturnValue(true);
  navFindOne.mockResolvedValue(null);
  navCreate.mockResolvedValue({ id: 'row-1' });
});

describe('dark by default', () => {
  it('writes NOTHING when signal ingest is disabled', async () => {
    isEnabled.mockReturnValue(false);
    const r = await recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session' });
    expect(r).toMatchObject({ outcome: 'skipped_flag_off', written: false });
    expect(navCreate).not.toHaveBeenCalled();
    expect(navFindOne).not.toHaveBeenCalled();
  });

  it('asks the master-aware helper, not a raw sub-flag', async () => {
    await recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session' });
    expect(isEnabled).toHaveBeenCalledWith('signalIngest', expect.anything());
  });
});

describe('closed alphabet', () => {
  it('writes a signal this stream owns', async () => {
    const r = await recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session', page: '/portal/today' });
    expect(r).toMatchObject({ outcome: 'written', written: true });
    expect(navCreate).toHaveBeenCalledWith(
      expect.objectContaining({ enrollment_id: ENR, event_type: 'portal_session', page: '/portal/today' }),
    );
  });

  it('rejects an event type the definitions table does not know', async () => {
    const r = await recordLearnerSignal({ enrollmentId: ENR, eventType: 'totally_made_up' });
    expect(r.outcome).toBe('rejected_unknown_signal');
    expect(navCreate).not.toHaveBeenCalled();
  });

  it('rejects a REAL signal that belongs to another source table', async () => {
    // card_completed is real, but it is read from timeline_card_progress.
    // Accepting it here would create a second, divergent record of the same
    // fact and let a client forge learning progress.
    const r = await recordLearnerSignal({ enrollmentId: ENR, eventType: 'card_completed' });
    expect(r.outcome).toBe('rejected_not_writable');
    expect(navCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['missing enrollmentId', { enrollmentId: '', eventType: 'portal_session' }],
    ['blank enrollmentId', { enrollmentId: '   ', eventType: 'portal_session' }],
    ['missing eventType', { enrollmentId: ENR, eventType: '' }],
  ])('rejects %s', async (_label, input) => {
    const r = await recordLearnerSignal(input as never);
    expect(r.outcome).toBe('rejected_invalid_input');
    expect(navCreate).not.toHaveBeenCalled();
  });
});

describe('idempotency', () => {
  it('suppresses an identical signal seen inside the dedupe window', async () => {
    navFindOne.mockResolvedValue({ id: 'existing' });
    const r = await recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session', page: '/portal/today' });
    expect(r).toMatchObject({ outcome: 'duplicate_suppressed', written: false });
    expect(navCreate).not.toHaveBeenCalled();
  });

  it('scopes the dedupe lookback to the same learner, signal and page', async () => {
    await recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session', page: '/portal/today' });
    const where = navFindOne.mock.calls[0][0].where;
    expect(where.enrollment_id).toBe(ENR);
    expect(where.event_type).toBe('portal_session');
    expect(where.page).toBe('/portal/today');
    expect(where.created_at).toBeDefined();
  });

  it('treats a different page as a different occurrence', async () => {
    await recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session', page: '/portal/a' });
    await recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session', page: '/portal/b' });
    expect(navFindOne.mock.calls[0][0].where.page).toBe('/portal/a');
    expect(navFindOne.mock.calls[1][0].where.page).toBe('/portal/b');
  });
});

describe('never breaks the caller', () => {
  it('resolves rather than throwing when the create fails', async () => {
    navCreate.mockRejectedValue(new Error('deadlock detected'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Instrumentation is not the user's request. A failed signal write must
    // never surface as a failed page load.
    await expect(
      recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session' }),
    ).resolves.toMatchObject({ outcome: 'failed', written: false });

    warn.mockRestore();
  });

  it('resolves rather than throwing when the dedupe lookup fails', async () => {
    navFindOne.mockRejectedValue(new Error('connection reset'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      recordLearnerSignal({ enrollmentId: ENR, eventType: 'portal_session' }),
    ).resolves.toMatchObject({ outcome: 'failed' });
    warn.mockRestore();
  });

  it('never emits raw PII in the failure log', async () => {
    // metadata is learner-supplied, so it can carry an address.
    navCreate.mockRejectedValue(new Error('boom sensitive.learner@realdomain.com'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await recordLearnerSignal({
      enrollmentId: ENR,
      eventType: 'portal_session',
      metadata: { typed: 'sensitive.learner@realdomain.com' },
    });

    const emitted = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(emitted).not.toContain('sensitive.learner@realdomain.com');
    expect(emitted).toContain(ENR); // the enrollment id IS safe and is what an operator acts on
    warn.mockRestore();
  });
});
