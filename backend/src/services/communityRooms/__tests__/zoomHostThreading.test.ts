jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../zoomService', () => ({
  createMeeting: jest.fn(),
  listUpcomingMeetingsWithAgenda: jest.fn(),
}));

import { sequelize } from '../../../config/database';
import * as zoomService from '../../zoomService';
import { createMeetingIdempotent, findMeetingByRequestMarker, requestMarker } from '../zoomMeetingIdempotency';

const q = sequelize.query as unknown as jest.Mock;
const createMock = zoomService.createMeeting as unknown as jest.Mock;
const listMock = zoomService.listUpcomingMeetingsWithAgenda as unknown as jest.Mock;

/**
 * Multi-host introduces one genuinely new way to create a duplicate meeting.
 *
 * The ledger reconciles a lost response by listing a host's scheduled meetings and
 * looking for the request marker in the agenda. With one host that host was always
 * the right one. With several, reconciling against the DEFAULT host asks the wrong
 * Zoom user, gets a truthful "no such meeting" about a meeting that exists, and
 * creates a second one — on a platform where a single-host account already had
 * students landing in each other's rooms.
 *
 * So the host is written with the CLAIM, before Zoom is called, and read back from
 * the ledger on retry.
 */

const INPUT = {
  requestId: 'booking-77',
  topic: 'Practice run',
  agenda: 'Rehearse the demo',
  startDateTime: '2026-10-08T13:30:00',
  durationMinutes: 30,
  timezone: 'America/Chicago',
};

/** First query is the claim; the rest are reads/updates the test supplies. */
const claimWon = () => q.mockResolvedValueOnce([[{ request_id: INPUT.requestId }], {}]);
const claimLost = () => q.mockResolvedValueOnce([[], {}]);
const ledgerSays = (row: Record<string, unknown>) => q.mockResolvedValueOnce([[row], {}]);
const anyWrite = () => q.mockResolvedValueOnce([[], {}]);

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  createMock.mockResolvedValue({ meetingId: '99', joinUrl: 'https://zoom.us/j/99' });
  listMock.mockResolvedValue([]);
});

describe('the host a request used is recorded before Zoom is called', () => {
  it('writes the host on the claim, not after the response', async () => {
    claimWon();
    anyWrite(); // markCreated
    await createMeetingIdempotent({ ...INPUT, hostEmail: 'program.102@colaberry.com' });

    const claimSql = String(q.mock.calls[0][0]);
    expect(claimSql).toContain('INSERT INTO zoom_meeting_requests');
    expect(claimSql).toContain('host_email');
    expect(q.mock.calls[0][1].replacements.host).toBe('program.102@colaberry.com');
  });

  it('records an empty host when none is given, meaning the configured default', async () => {
    claimWon();
    anyWrite();
    await createMeetingIdempotent(INPUT);
    expect(q.mock.calls[0][1].replacements.host).toBe('');
  });

  it('passes the host to the actual create call', async () => {
    claimWon();
    anyWrite();
    await createMeetingIdempotent({ ...INPUT, hostEmail: 'mika@colaberry.com' });
    expect(createMock.mock.calls[0][0].hostEmail).toBe('mika@colaberry.com');
  });
});

describe('a retry reconciles against the host the FIRST attempt used', () => {
  it('asks the ledger host, not the default, when a prior attempt is pending', async () => {
    // THE DUPLICATE THIS PREVENTS: asking the default host about a meeting created
    // on program.103 returns "absent", and absent is what licenses a second create.
    claimLost();
    ledgerSays({ request_id: INPUT.requestId, state: 'pending', meeting_id: null, join_url: null, attempts: 1, host_email: 'program.103@colaberry.com' });
    listMock.mockResolvedValue([
      { id: 555, agenda: `Rehearse\n\n${requestMarker(INPUT.requestId)}`, join_url: 'https://zoom.us/j/555' },
    ]);
    anyWrite(); // markCreated(reconciled)

    const r = await createMeetingIdempotent({ ...INPUT, hostEmail: 'program.103@colaberry.com' });

    expect(listMock).toHaveBeenCalledWith('program.103@colaberry.com');
    expect(r.outcome).toBe('reconciled');
    expect(r.meetingId).toBe('555');
    // And crucially: no second meeting was created.
    expect(createMock).not.toHaveBeenCalled();
  });

  it('falls back to the default host for rows written before multi-host existed', async () => {
    claimLost();
    ledgerSays({ request_id: INPUT.requestId, state: 'pending', meeting_id: null, join_url: null, attempts: 1, host_email: '' });
    listMock.mockResolvedValue([]);
    anyWrite();

    await createMeetingIdempotent(INPUT);
    // undefined, not '' — the service treats absent as "use the configured host".
    expect(listMock).toHaveBeenCalledWith(undefined);
  });

  it('a failed reconcile still refuses to conclude the meeting is absent', async () => {
    // Unchanged guarantee, re-asserted because multi-host touched this path.
    listMock.mockRejectedValue(new Error('zoom 503'));
    await expect(findMeetingByRequestMarker('r-1', 'program.104@colaberry.com')).rejects.toThrow(/Zoom reconcile failed/);
  });

  it('a replay never reaches Zoom at all, whatever host it names', async () => {
    claimLost();
    ledgerSays({ request_id: INPUT.requestId, state: 'created', meeting_id: '42', join_url: 'https://zoom.us/j/42', attempts: 1, host_email: 'program.101@colaberry.com' });

    const r = await createMeetingIdempotent({ ...INPUT, hostEmail: 'program.101@colaberry.com' });

    expect(r.outcome).toBe('replayed');
    expect(listMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
