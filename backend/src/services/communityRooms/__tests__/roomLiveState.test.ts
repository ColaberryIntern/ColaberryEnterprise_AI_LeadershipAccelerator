/**
 * "Open now" has to mean a meeting is happening.
 *
 * THE DEFECT. The campus hallway called a room open when `inside_count > 0`, and that
 * counts fresh `room_presence` heartbeats, which the room PAGE writes every 30 seconds
 * while a browser tab is open. So "2 OPEN NOW" meant two people had a tab open, a real
 * Zoom call with everyone off the website read as closed, and the badge was unrelated
 * to whether anything was happening. Nothing in the platform ever learned that a
 * meeting started: `recording.completed` was the only Zoom webhook handled, and it
 * arrives long after everyone has left.
 *
 * The two rules most worth pinning are the ones that stop this becoming a NEW way to
 * lie: a meeting whose `ended` never arrives must not stay live forever, and a late
 * `ended` must not switch off the call that is running now.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import {
  MAX_LIVE_MS,
  LIVE_METADATA_KEY,
  isStillLive,
  nextLiveState,
  wouldChange,
  applyZoomLiveEvent,
  liveSince,
  type RoomLive,
} from '../roomLiveState';

const query = sequelize.query as unknown as jest.Mock;

const NOW = new Date('2026-11-02T15:00:00.000Z');
const live = (over: Partial<RoomLive> = {}): RoomLive => ({
  occurrence_uuid: 'occ-1', meeting_id: '123', since: '2026-11-02T14:30:00.000Z', ...over,
});

/** The room row the service reads, then a successful UPDATE. */
function givenRoom(metadata: unknown) {
  query.mockReset();
  query.mockResolvedValueOnce([[{ metadata }], {}]).mockResolvedValue([[], {}]);
}

const updates = () => query.mock.calls.filter((c) => String(c[0]).includes('UPDATE community_rooms'));

beforeEach(() => jest.clearAllMocks());

describe('an unclosed meeting does not stay live forever', () => {
  it('is live inside the window (happy path)', () => {
    expect(isStillLive(live({ since: new Date(NOW.getTime() - 60_000).toISOString() }), NOW)).toBe(true);
  });

  it('EXPIRES past the window even though nothing ever ended it', () => {
    // The dangerous failure: a dropped `meeting.ended`, a redeploy mid-call, a Zoom
    // outage. Trusting the stored row forever would reproduce the original lie.
    expect(isStillLive(live({ since: new Date(NOW.getTime() - MAX_LIVE_MS - 1).toISOString() }), NOW)).toBe(false);
  });

  it('is still live exactly at the boundary (boundary)', () => {
    expect(isStillLive(live({ since: new Date(NOW.getTime() - MAX_LIVE_MS).toISOString() }), NOW)).toBe(true);
  });

  it('refuses a start in the future rather than pinning the room open (boundary)', () => {
    // Clock skew, not a meeting. Treating it as live would hold the badge on until
    // the skew exceeded the whole window.
    expect(isStillLive(live({ since: new Date(NOW.getTime() + 60_000).toISOString() }), NOW)).toBe(false);
  });

  it('treats an unreadable timestamp as not live (failure path)', () => {
    expect(isStillLive(live({ since: 'whenever' }), NOW)).toBe(false);
    expect(isStillLive(null, NOW)).toBe(false);
  });
});

describe('out-of-order deliveries', () => {
  it('starts a meeting', () => {
    const next = nextLiveState(null, { kind: 'started', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() });
    expect(next).toEqual({ occurrence_uuid: 'occ-1', meeting_id: '123', since: NOW.toISOString() });
  });

  it('a repeat of the same start does NOT move the start time', () => {
    // Zoom retries deliveries. A retry that re-stamped `since` would quietly extend
    // the meeting and defeat the expiry above.
    const current = live({ since: '2026-11-02T10:00:00.000Z' });
    const next = nextLiveState(current, { kind: 'started', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() });
    expect(next).toBe(current);
  });

  it('a NEW occurrence supersedes the old one', () => {
    const next = nextLiveState(live(), { kind: 'started', occurrenceUuid: 'occ-2', meetingId: '123', atMs: NOW.getTime() });
    expect(next).toMatchObject({ occurrence_uuid: 'occ-2', since: NOW.toISOString() });
  });

  it('ends the meeting it names', () => {
    expect(nextLiveState(live(), { kind: 'ended', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() })).toBeNull();
  });

  it('a LATE end for a finished meeting does not switch off the one running now', () => {
    // Zoom does not guarantee order. Clearing on any `ended` would let an hour-old
    // delivery close a call that is genuinely in progress.
    const current = live({ occurrence_uuid: 'occ-2' });
    expect(nextLiveState(current, { kind: 'ended', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() })).toBe(current);
  });

  it('ending a room that is not live is a no-op (boundary)', () => {
    expect(nextLiveState(null, { kind: 'ended', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() })).toBeNull();
  });

  it('knows when nothing would change, so a retry costs no write', () => {
    const current = live();
    expect(wouldChange(current, current)).toBe(false);
    expect(wouldChange(null, null)).toBe(false);
    expect(wouldChange(null, current)).toBe(true);
    expect(wouldChange(current, null)).toBe(true);
  });
});

describe('recording it against the room', () => {
  it('writes the liveness on a start', async () => {
    givenRoom({});
    const applied = await applyZoomLiveEvent('room-1', { kind: 'started', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() });

    expect(applied).toMatchObject({ occurrence_uuid: 'occ-1' });
    expect(updates()).toHaveLength(1);
    const written = JSON.parse((updates()[0][1] as { replacements: { live: string } }).replacements.live);
    expect(written).toEqual({ occurrence_uuid: 'occ-1', meeting_id: '123', since: NOW.toISOString() });
  });

  it('writes NOTHING for a repeated delivery (idempotency)', async () => {
    givenRoom({ [LIVE_METADATA_KEY]: live() });
    await applyZoomLiveEvent('room-1', { kind: 'started', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() });
    expect(updates()).toHaveLength(0);
  });

  it('clears the key when the meeting it names ends', async () => {
    givenRoom({ [LIVE_METADATA_KEY]: live() });
    const applied = await applyZoomLiveEvent('room-1', { kind: 'ended', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() });

    expect(applied).toBeNull();
    expect(updates()).toHaveLength(1);
    expect(String(updates()[0][0])).toContain('- :key');
  });

  it('writes nothing for an end that names another occurrence', async () => {
    givenRoom({ [LIVE_METADATA_KEY]: live({ occurrence_uuid: 'occ-2' }) });
    await applyZoomLiveEvent('room-1', { kind: 'ended', occurrenceUuid: 'occ-1', meetingId: '123', atMs: NOW.getTime() });
    expect(updates()).toHaveLength(0);
  });

  it('reports a room that does not exist instead of throwing (failure path)', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([[], {}]);
    await expect(applyZoomLiveEvent('nope', { kind: 'started', occurrenceUuid: 'occ-1', meetingId: '1', atMs: NOW.getTime() }))
      .resolves.toBeNull();
    expect(updates()).toHaveLength(0);
  });
});

describe('what the hallway reads', () => {
  it('reports the start time while the meeting is running', () => {
    const since = new Date(NOW.getTime() - 60_000).toISOString();
    expect(liveSince({ [LIVE_METADATA_KEY]: live({ since }) }, NOW)).toBe(since);
  });

  it('reports null once the liveness has expired', () => {
    expect(liveSince({ [LIVE_METADATA_KEY]: live({ since: '2026-01-01T00:00:00.000Z' }) }, NOW)).toBeNull();
  });

  it('reports null for a room that has never been live (boundary)', () => {
    expect(liveSince({}, NOW)).toBeNull();
    expect(liveSince(null, NOW)).toBeNull();
    expect(liveSince({ [LIVE_METADATA_KEY]: 'nonsense' }, NOW)).toBeNull();
  });
});
