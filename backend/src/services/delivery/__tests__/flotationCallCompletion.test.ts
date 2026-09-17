/**
 * A finished AI Flotation call becomes a project whoever reports it finished.
 *
 * The gap: three out of three Flotation calls ever placed sat at `sent` with no transcript,
 * because the webhook never came. These prove the three ways in - webhook, admin poll,
 * five-minute sweep - all end in the same completion, that the completion is idempotent,
 * and that "cannot reconcile right now" is never mistaken for "the call did not happen".
 */
const mockCommFindOne = jest.fn();
const mockCommFindAll = jest.fn();
const mockLeadFindByPk = jest.fn();
const mockFetchCall = jest.fn();
const mockFinish = jest.fn();

jest.mock('../../../models', () => ({
  CommunicationLog: { findOne: (...a: any[]) => mockCommFindOne(...a), findAll: (...a: any[]) => mockCommFindAll(...a) },
  Lead: { findByPk: (...a: any[]) => mockLeadFindByPk(...a) },
}));
jest.mock('../../synthflowService', () => ({
  fetchSynthflowCall: (...a: any[]) => mockFetchCall(...a),
  isTerminalCallStatus: (s: string) => ['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(String(s || '').toLowerCase()),
}));
jest.mock('../projectIntake', () => ({
  ...jest.requireActual('../projectIntake'),
  finishIntake: (...a: any[]) => mockFinish(...a),
}));

import { completeFlotationCall, reconcileFlotationCall, reconcileOpenFlotationCalls, SWEEP_MIN_AGE_MS } from '../flotationCallCompletion';

const TRANSCRIPT = 'agent: Tell me about the project.\nhuman: We run a tool library and track loans on paper.';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'log-1',
  lead_id: 42,
  status: 'sent',
  provider: 'synthflow',
  provider_message_id: 'call_1',
  provider_response: null,
  metadata: { source: 'ai-flotation', trigger: 'instant_callback' },
  created_at: new Date('2026-09-17T10:00:00Z'),
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLeadFindByPk.mockResolvedValue({ id: 42, name: 'Marta Okafor', company: 'Northside', email: 'marta@northside.test' });
  mockFinish.mockResolvedValue({ understanding: 'created', understanding_id: 'rec-1', build: { started: true, project_id: 'proj-1' } });
});

describe('completeFlotationCall', () => {
  it('writes the log row and ends the intake, landing by the lead email for a prospect', async () => {
    const r = row();
    mockCommFindOne.mockResolvedValue(r);

    const out = await completeFlotationCall({ callId: 'call_1', status: 'completed', transcript: TRANSCRIPT, durationSeconds: 300, endReason: 'completed' });

    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'delivered',
      provider_response: expect.objectContaining({ call_status: 'completed', transcript: TRANSCRIPT, duration: 300 }),
    }));
    expect(mockFinish).toHaveBeenCalledWith({
      conversation: TRANSCRIPT,
      source: 'voice_transcript',
      sourceRef: 'call_1',
      facts: { name: 'Marta Okafor', company: 'Northside', role: null },
      leadId: 42,
      buildFor: { kind: 'by_email', email: 'marta@northside.test' },
    });
    expect(out).toEqual({ handled: true, completed: true, intake: expect.objectContaining({ build: { started: true, project_id: 'proj-1' } }) });
  });

  it("lands on the student an admin's call was stamped with", async () => {
    mockCommFindOne.mockResolvedValue(row({ metadata: { source: 'ai-flotation', enrollment_id: 'enr-9', requested_by: 'admin' } }));
    await completeFlotationCall({ callId: 'call_1', status: 'completed', transcript: TRANSCRIPT });
    expect(mockFinish.mock.calls[0][0].buildFor).toEqual({ kind: 'enrollment', enrollmentId: 'enr-9' });
  });

  it('does not rewrite a row the webhook already finished - only ends the intake', async () => {
    const r = row({ status: 'delivered', provider_response: { transcript: TRANSCRIPT } });
    mockCommFindOne.mockResolvedValue(r);
    await completeFlotationCall({ callId: 'call_1', status: 'completed', transcript: TRANSCRIPT });
    expect(r.update).not.toHaveBeenCalled();
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });

  it('a call that did not complete is recorded as failed and extracts nothing', async () => {
    const r = row();
    mockCommFindOne.mockResolvedValue(r);
    const out = await completeFlotationCall({ callId: 'call_1', status: 'no-answer', transcript: '', endReason: 'no-answer' });
    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(mockFinish).not.toHaveBeenCalled();
    expect(out).toEqual({ handled: true, completed: false });
  });

  it('a completed call with an empty transcript extracts nothing', async () => {
    mockCommFindOne.mockResolvedValue(row());
    const out = await completeFlotationCall({ callId: 'call_1', status: 'completed', transcript: '' });
    expect(mockFinish).not.toHaveBeenCalled();
    expect(out).toEqual({ handled: true, completed: false });
  });

  it('leaves other brands\' calls alone', async () => {
    mockCommFindOne.mockResolvedValue(row({ metadata: { source: 'training_site' } }));
    const out = await completeFlotationCall({ callId: 'call_1', status: 'completed', transcript: TRANSCRIPT });
    expect(out).toEqual({ handled: false, reason: 'not_flotation' });
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('says so when it has no row for the call', async () => {
    mockCommFindOne.mockResolvedValue(null);
    expect(await completeFlotationCall({ callId: 'call_x', status: 'completed', transcript: TRANSCRIPT })).toEqual({ handled: false, reason: 'not_found' });
  });
});

describe('reconcileFlotationCall - the admin poll and the sweep', () => {
  it('reads the call back and completes it when it has ended', async () => {
    const r = row();
    mockCommFindOne.mockResolvedValue(r);
    mockFetchCall.mockResolvedValue({ status: 'completed', transcript: TRANSCRIPT, durationSeconds: 240, recordingUrl: null, endedReason: 'completed', disposition: null });

    const out = await reconcileFlotationCall('call_1');

    expect(mockFetchCall).toHaveBeenCalledWith('call_1');
    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ reconciled: true, status: 'completed', intake: expect.objectContaining({ understanding: 'created' }) });
  });

  it('while the call is still going, reports that and touches nothing', async () => {
    const r = row();
    mockCommFindOne.mockResolvedValue(r);
    mockFetchCall.mockResolvedValue({ status: 'in-progress', transcript: '', durationSeconds: null, recordingUrl: null, endedReason: null, disposition: null });

    const out = await reconcileFlotationCall('call_1');

    expect(out).toEqual({ reconciled: false, reason: 'still_active', status: 'in-progress' });
    expect(r.update).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('"cannot read the record" is not "the call did not happen"', async () => {
    const r = row();
    mockCommFindOne.mockResolvedValue(r);
    mockFetchCall.mockResolvedValue(null);
    const out = await reconcileFlotationCall('call_1');
    expect(out).toEqual({ reconciled: false, reason: 'no_record' });
    expect(r.update).not.toHaveBeenCalled();
  });

  it('does not ask Synthflow about a row that is already finished', async () => {
    mockCommFindOne.mockResolvedValue(row({ status: 'delivered' }));
    const out = await reconcileFlotationCall('call_1');
    expect(out).toEqual({ reconciled: false, reason: 'already_terminal' });
    expect(mockFetchCall).not.toHaveBeenCalled();
  });
});

describe('reconcileOpenFlotationCalls - the five-minute sweep', () => {
  it('completes every Flotation call still at sent, skips other brands, and one failure does not stop it', async () => {
    const good = row({ provider_message_id: 'call_a' });
    const other = row({ provider_message_id: 'call_b', metadata: { source: 'cpn' } });
    const broken = row({ provider_message_id: 'call_c' });
    mockCommFindAll.mockResolvedValue([good, other, broken]);
    mockCommFindOne.mockImplementation(async ({ where }: any) => ({ call_a: good, call_b: other, call_c: broken })[where.provider_message_id] ?? null);
    mockFetchCall.mockImplementation(async (id: string) => {
      if (id === 'call_c') throw new Error('synthflow 500');
      return { status: 'completed', transcript: TRANSCRIPT, durationSeconds: 100, recordingUrl: null, endedReason: 'completed', disposition: null };
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const out = await reconcileOpenFlotationCalls(new Date('2026-09-17T10:10:00Z'));

    expect(out).toEqual({ checked: 2, reconciled: ['call_a'] });
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('flotation_call_sweep_item_failed'));
    warn.mockRestore();
  });

  it('only looks at sent voice rows old enough to have ended and young enough to matter', async () => {
    mockCommFindAll.mockResolvedValue([]);
    const now = new Date('2026-09-17T10:10:00Z');
    await reconcileOpenFlotationCalls(now);
    const { where, limit } = mockCommFindAll.mock.calls[0][0];
    expect(where).toMatchObject({ provider: 'synthflow', channel: 'voice', status: 'sent' });
    const bounds = Object.getOwnPropertySymbols(where.created_at).map((s) => where.created_at[s]);
    expect(Math.max(...bounds.map((d: Date) => d.getTime()))).toBe(now.getTime() - SWEEP_MIN_AGE_MS);
    expect(limit).toBe(20);
  });
});
