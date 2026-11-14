/**
 * The judgement at the centre of the 2026-11-02 dead-room incident.
 *
 * Two meetings were minted in the same second, by the same code, asking for the same
 * settings. One was enterable and one was not, and nothing in the platform could tell
 * them apart because nothing looked. These tests pin the three-way answer — yes, no,
 * and cannot tell — because collapsing the third into either of the others is how the
 * fix itself would become the next incident.
 *
 * Pure: no fetch, no ORM, no clock.
 */

import {
  OPEN_ROOM_REQUIRED_SETTINGS,
  ZoomMeetingNotEnterableError,
  isEnterableWithoutHost,
  settingsMismatches,
  unenterableReason,
} from '../zoomMeetingSettings';

const REQUESTED = { auto_recording: 'cloud', join_before_host: true, waiting_room: false };

describe('settingsMismatches', () => {
  it('reports nothing when Zoom stored exactly what was asked for (the healthy mint)', () => {
    // This is meeting 84776284115, the standup room, which worked.
    expect(settingsMismatches(REQUESTED, {
      auto_recording: 'cloud', join_before_host: true, waiting_room: false,
    })).toEqual([]);
  });

  it('reports the forced waiting room that made the public room unenterable', () => {
    // This is meeting 85910290895 as Zoom actually stored it on 2026-11-02.
    expect(settingsMismatches(REQUESTED, {
      auto_recording: 'cloud', join_before_host: true, waiting_room: true,
    })).toEqual([{ setting: 'waiting_room', requested: false, stored: true }]);
  });

  it('reports every field that differs, not just the first', () => {
    const found = settingsMismatches(REQUESTED, {
      auto_recording: 'none', join_before_host: false, waiting_room: true,
    });
    expect(found.map((m) => m.setting).sort()).toEqual(
      ['auto_recording', 'join_before_host', 'waiting_room'],
    );
  });

  it('treats a field Zoom did not return as unverifiable, NOT as a mismatch', () => {
    // The whole safety property: an API response that stops carrying `waiting_room`
    // must not start failing every mint on the platform.
    expect(settingsMismatches(REQUESTED, { auto_recording: 'cloud' })).toEqual([]);
  });

  it('ignores settings Zoom returned that we never asked about', () => {
    expect(settingsMismatches({ waiting_room: false }, {
      waiting_room: false, mute_upon_entry: true, host_video: false,
    })).toEqual([]);
  });

  it('returns nothing rather than throwing when either side is missing', () => {
    expect(settingsMismatches(REQUESTED, null)).toEqual([]);
    expect(settingsMismatches(REQUESTED, undefined)).toEqual([]);
    expect(settingsMismatches(null, { waiting_room: true })).toEqual([]);
    expect(settingsMismatches({}, {})).toEqual([]);
  });

  it('skips a requested key explicitly set to undefined', () => {
    expect(settingsMismatches({ waiting_room: undefined }, { waiting_room: true })).toEqual([]);
  });
});

describe('isEnterableWithoutHost', () => {
  it('is true only when the waiting room is off AND join-before-host is on', () => {
    expect(isEnterableWithoutHost({ waiting_room: false, join_before_host: true })).toBe(true);
  });

  it('is false when a waiting room is on, EVEN WITH join-before-host on', () => {
    // The misreading that cost eleven days: join_before_host: true looks like an open
    // room, and a waiting room overrides it completely.
    expect(isEnterableWithoutHost({ waiting_room: true, join_before_host: true })).toBe(false);
  });

  it('is false when join-before-host is off, with no waiting room involved', () => {
    // support@colaberry.com carries exactly this shape.
    expect(isEnterableWithoutHost({ waiting_room: false, join_before_host: false })).toBe(false);
  });

  it('is null — not false — when Zoom returned nothing to judge', () => {
    expect(isEnterableWithoutHost(null)).toBeNull();
    expect(isEnterableWithoutHost(undefined)).toBeNull();
    expect(isEnterableWithoutHost({})).toBeNull();
    expect(isEnterableWithoutHost({ auto_recording: 'cloud' })).toBeNull();
  });

  it('is null when only half the answer came back', () => {
    // waiting_room off is not on its own enough: join-before-host decides the rest.
    expect(isEnterableWithoutHost({ waiting_room: false })).toBeNull();
    expect(isEnterableWithoutHost({ join_before_host: true })).toBeNull();
  });
});

describe('unenterableReason', () => {
  it('names the waiting room, because that fix is a different console page', () => {
    expect(unenterableReason({ waiting_room: true })).toContain('waiting room');
  });

  it('names join-before-host when that is the cause', () => {
    expect(unenterableReason({ waiting_room: false, join_before_host: false }))
      .toContain('join-before-host');
  });

  it('says it could not tell, rather than inventing a cause', () => {
    expect(unenterableReason(null)).toContain('did not return enough settings');
  });
});

describe('ZoomMeetingNotEnterableError', () => {
  it('carries the host, the meeting and a stable error_class for the logs', () => {
    const err = new ZoomMeetingNotEnterableError(
      'program.102@colaberry.com', '85910290895', { waiting_room: true },
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.error_class).toBe('ZoomMeetingNotEnterable');
    expect(err.hostEmail).toBe('program.102@colaberry.com');
    expect(err.meetingId).toBe('85910290895');
    expect(err.message).toContain('program.102@colaberry.com');
    expect(err.message).toContain('waiting room');
  });

  it('survives an absent meeting id and absent settings', () => {
    const err = new ZoomMeetingNotEnterableError('h@x.com', null, null);
    expect(err.meetingId).toBeNull();
    expect(err.stored).toBeNull();
  });
});

describe('OPEN_ROOM_REQUIRED_SETTINGS', () => {
  it('is the pair a persistent room cannot work without, and is frozen', () => {
    expect(OPEN_ROOM_REQUIRED_SETTINGS).toEqual({ waiting_room: false, join_before_host: true });
    expect(Object.isFrozen(OPEN_ROOM_REQUIRED_SETTINGS)).toBe(true);
  });

  it('agrees with isEnterableWithoutHost, so the two cannot drift apart', () => {
    expect(isEnterableWithoutHost({ ...OPEN_ROOM_REQUIRED_SETTINGS })).toBe(true);
  });
});
