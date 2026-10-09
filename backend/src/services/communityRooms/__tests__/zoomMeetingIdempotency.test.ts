jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../zoomService', () => ({
  createMeeting: jest.fn(),
  listUpcomingMeetingsWithAgenda: jest.fn(),
}));

import { sequelize } from '../../../config/database';
import * as zoomService from '../../zoomService';
import {
  createMeetingIdempotent,
  findMeetingByRequestMarker,
  requestMarker,
} from '../zoomMeetingIdempotency';

const q = sequelize.query as unknown as jest.Mock;
const createMock = zoomService.createMeeting as unknown as jest.Mock;
const listMock = zoomService.listUpcomingMeetingsWithAgenda as unknown as jest.Mock;

const INPUT = {
  requestId: 'booking-42',
  topic: 'Practice run',
  agenda: 'Rehearse the demo',
  startDateTime: '2026-10-08T13:30:00',
  durationMinutes: 30,
  timezone: 'America/Chicago',
};

/** The ledger INSERT returns a row when this caller won the claim, none when it lost. */
const claimWon = () => q.mockImplementationOnce(async () => [[{ request_id: 'booking-42' }], {}]);
const claimLost = () => q.mockImplementationOnce(async () => [[], {}]);
/** The follow-up SELECT a losing caller performs. */
const ledgerSays = (row: Record<string, unknown> | null) =>
  q.mockImplementationOnce(async () => [row ? [row] : [], {}]);
/** Any subsequent UPDATE. */
const anyWrite = () => q.mockImplementation(async () => [[], {}]);

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  createMock.mockReset();
  listMock.mockReset();
});

describe('zoom meeting idempotency — the happy path', () => {
  it('claims the request, calls Zoom once, and records the result', async () => {
    claimWon(); anyWrite();
    createMock.mockResolvedValue({ meetingId: '999', joinUrl: 'https://zoom.us/j/999' });

    const r = await createMeetingIdempotent(INPUT);

    expect(r).toEqual({ meetingId: '999', joinUrl: 'https://zoom.us/j/999', outcome: 'created' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('embeds the request marker in the agenda — the only thread back to the request', async () => {
    claimWon(); anyWrite();
    createMock.mockResolvedValue({ meetingId: '1', joinUrl: null });

    await createMeetingIdempotent(INPUT);

    const agenda = createMock.mock.calls[0][0].agenda as string;
    expect(agenda).toContain('Rehearse the demo');   // the human's text survives
    expect(agenda).toContain(requestMarker('booking-42'));
  });

  it('claims BEFORE calling Zoom, not after', async () => {
    // A ledger written after a successful response only records the attempts that
    // already worked — exactly the ones that never needed recording.
    const order: string[] = [];
    q.mockImplementation(async (sql: string) => {
      if (String(sql).includes('INSERT INTO zoom_meeting_requests')) order.push('claim');
      else order.push('write');
      return [[{ request_id: 'booking-42' }], {}];
    });
    createMock.mockImplementation(async () => { order.push('zoom'); return { meetingId: '1', joinUrl: null }; });

    await createMeetingIdempotent(INPUT);

    expect(order[0]).toBe('claim');
    expect(order.indexOf('claim')).toBeLessThan(order.indexOf('zoom'));
  });

  it('refuses a blank request id rather than silently disabling the guarantee', async () => {
    await expect(createMeetingIdempotent({ ...INPUT, requestId: '' }))
      .rejects.toThrow(/requestId is required/);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('zoom meeting idempotency — a retry must not create a second meeting', () => {
  it('replays the recorded meeting when a previous attempt already succeeded', async () => {
    claimLost();
    ledgerSays({ request_id: 'booking-42', state: 'created', meeting_id: '999', join_url: 'https://zoom.us/j/999', attempts: 1 });

    const r = await createMeetingIdempotent(INPUT);

    expect(r).toEqual({ meetingId: '999', joinUrl: 'https://zoom.us/j/999', outcome: 'replayed' });
    // The whole point: Zoom is never called again.
    expect(createMock).not.toHaveBeenCalled();
  });

  it('THE DANGEROUS CASE: Zoom succeeded but the response was lost — adopt, do not recreate', async () => {
    // The prior attempt is 'pending', so we reached Zoom and never learned the outcome.
    // Creating again here is what produces two join links for one booking.
    claimLost();
    ledgerSays({ request_id: 'booking-42', state: 'pending', meeting_id: null, join_url: null, attempts: 1 });
    anyWrite();
    listMock.mockResolvedValue([
      { id: 555, agenda: `Rehearse the demo\n\n${requestMarker('booking-42')}`, join_url: 'https://zoom.us/j/555' },
      { id: 777, agenda: 'Someone else entirely', join_url: 'https://zoom.us/j/777' },
    ]);

    const r = await createMeetingIdempotent(INPUT);

    expect(r).toEqual({ meetingId: '555', joinUrl: 'https://zoom.us/j/555', outcome: 'reconciled' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates only when reconciliation proves the earlier call never landed', async () => {
    claimLost();
    ledgerSays({ request_id: 'booking-42', state: 'pending', meeting_id: null, join_url: null, attempts: 1 });
    anyWrite();
    listMock.mockResolvedValue([{ id: 777, agenda: 'unrelated', join_url: null }]);
    createMock.mockResolvedValue({ meetingId: '888', joinUrl: 'https://zoom.us/j/888' });

    const r = await createMeetingIdempotent(INPUT);

    expect(r.outcome).toBe('created');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('a FAILED reconcile throws rather than being read as "no meeting exists"', async () => {
    // Treating a reconcile error as absence is the precise inference that produces the
    // duplicate this module exists to prevent.
    claimLost();
    ledgerSays({ request_id: 'booking-42', state: 'pending', meeting_id: null, join_url: null, attempts: 1 });
    listMock.mockRejectedValue(new Error('Zoom 503'));

    await expect(createMeetingIdempotent(INPUT)).rejects.toThrow(/reconcile failed/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('leaves the row pending when the Zoom call itself fails', async () => {
    // NOT 'failed' — we do not know whether Zoom created it, and marking failed would
    // license the next retry to create a duplicate.
    claimWon();
    const writes: string[] = [];
    q.mockImplementation(async (sql: string) => { writes.push(String(sql)); return [[], {}]; });
    createMock.mockRejectedValue(new Error('socket hang up'));

    await expect(createMeetingIdempotent(INPUT)).rejects.toThrow('socket hang up');
    expect(writes.join(' ')).not.toMatch(/state\s*=\s*'failed'/);
    expect(writes.join(' ')).toMatch(/attempts = attempts \+ 1/);
  });
});

describe('zoom meeting idempotency — the race', () => {
  it('the claim is atomic: ON CONFLICT DO NOTHING, not SELECT-then-INSERT', async () => {
    // Two workers racing the same booking both attempt the insert; exactly one affects
    // a row. A read-then-write check lets both see "absent" and both call Zoom.
    claimWon(); anyWrite();
    createMock.mockResolvedValue({ meetingId: '1', joinUrl: null });

    await createMeetingIdempotent(INPUT);

    const claimSql = String(q.mock.calls[0][0]);
    expect(claimSql).toMatch(/INSERT INTO zoom_meeting_requests/);
    expect(claimSql).toMatch(/ON CONFLICT \(request_id\) DO NOTHING/);
    expect(claimSql).toMatch(/RETURNING request_id/);
    // And it is the FIRST thing that happens.
    expect(q.mock.calls[0][0]).toBe(claimSql);
  });
});

describe('findMeetingByRequestMarker', () => {
  it('matches on the marker, not on topic or start time', async () => {
    // Two bookings can legitimately share a topic and a time; only the marker is unique.
    listMock.mockResolvedValue([
      { id: 1, agenda: 'Practice run', join_url: 'a' },
      { id: 2, agenda: `x ${requestMarker('booking-42')}`, join_url: 'b' },
    ]);
    await expect(findMeetingByRequestMarker('booking-42')).resolves.toEqual({ meetingId: '2', joinUrl: 'b' });
  });

  it('returns null when genuinely absent', async () => {
    listMock.mockResolvedValue([{ id: 1, agenda: 'nothing relevant' }]);
    await expect(findMeetingByRequestMarker('booking-42')).resolves.toBeNull();
  });

  it('boundary: a meeting with no agenda does not throw', async () => {
    listMock.mockResolvedValue([{ id: 1 }]);
    await expect(findMeetingByRequestMarker('booking-42')).resolves.toBeNull();
  });
});
