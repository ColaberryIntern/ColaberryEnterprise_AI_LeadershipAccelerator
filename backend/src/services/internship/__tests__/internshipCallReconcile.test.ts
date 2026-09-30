// The model, the vendor fetch, and the completion handler are all mocked, so this
// is a pure test of reconcile's branching — no database, no network. isTerminalCallStatus
// carries its real logic because the branch under test turns on it.
jest.mock('../../../models/InternshipInterviewSession', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../synthflowService', () => ({
  fetchSynthflowCall: jest.fn(),
  isTerminalCallStatus: (s?: string | null) => {
    const v = (s || '').toLowerCase();
    return ['completed', 'failed', 'no-answer', 'busy', 'canceled', 'cancelled'].includes(v);
  },
}));
jest.mock('../internshipCallCompletion', () => ({ handleInternshipCallCompleted: jest.fn() }));

import InternshipInterviewSession from '../../../models/InternshipInterviewSession';
import { fetchSynthflowCall } from '../../synthflowService';
import { handleInternshipCallCompleted } from '../internshipCallCompletion';
import { reconcileInternshipCall } from '../internshipCallReconcile';

const findOne = (InternshipInterviewSession as any).findOne as jest.Mock;
const fetchCall = fetchSynthflowCall as jest.Mock;
const complete = handleInternshipCallCompleted as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('reconcileInternshipCall', () => {
  it('does nothing, and never calls the vendor, when there is no open call', async () => {
    findOne.mockResolvedValue(null);
    const out = await reconcileInternshipCall('app-1');
    expect(out).toEqual({ reconciled: false, reason: 'no_open_call' });
    expect(fetchCall).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not complete a call that is still active', async () => {
    findOne.mockResolvedValue({ id: 's1', provider_call_id: 'c1' });
    fetchCall.mockResolvedValue({ status: 'in-progress', transcript: '', disposition: null, durationSeconds: null, recordingUrl: null, endedReason: null });
    const out = await reconcileInternshipCall('app-1');
    expect(out).toMatchObject({ reconciled: false, reason: 'still_active', status: 'in-progress' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('leaves the call open when the vendor record cannot be read', async () => {
    findOne.mockResolvedValue({ id: 's1', provider_call_id: 'c1' });
    fetchCall.mockResolvedValue(null);
    const out = await reconcileInternshipCall('app-1');
    expect(out).toEqual({ reconciled: false, reason: 'no_record' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('completes a terminal call, passing the vendor transcript through', async () => {
    findOne.mockResolvedValue({ id: 's1', provider_call_id: 'c1' });
    fetchCall.mockResolvedValue({
      status: 'completed', transcript: 'bot: hi | human: yes', disposition: 'human_goodbye',
      durationSeconds: 312, recordingUrl: null, endedReason: 'human_goodbye',
    });
    complete.mockResolvedValue({ handled: true, session_id: 's1', extracted: 7, unmatched: 0, transcript_stored: false });
    const out = await reconcileInternshipCall('app-1');
    expect(out).toEqual({ reconciled: true, status: 'completed', extracted: 7 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      callId: 'c1', sessionId: 's1', applicationId: 'app-1',
      transcript: 'bot: hi | human: yes', status: 'completed', durationSeconds: 312,
    }));
  });

  it('does not look the call up without a provider id', async () => {
    findOne.mockResolvedValue({ id: 's1', provider_call_id: null });
    const out = await reconcileInternshipCall('app-1');
    expect(out).toEqual({ reconciled: false, reason: 'no_open_call' });
    expect(fetchCall).not.toHaveBeenCalled();
  });
});
