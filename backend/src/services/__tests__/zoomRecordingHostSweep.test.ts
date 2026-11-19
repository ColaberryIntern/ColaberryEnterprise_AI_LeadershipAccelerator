jest.mock('../../config/env', () => ({
  env: {
    zoomAccountId: 'acct-1',
    zoomClientId: 'client-1',
    zoomClientSecret: 'secret-1',
    zoomWebhookSecretToken: 'webhook-secret',
    zoomHostEmail: 'ali@refactored.ai',
  },
}));

/**
 * Two faults, both found on production 2026-11-18 while chasing "why is this
 * recording 44 KB", and both about looking in the wrong place rather than about
 * downloading, storing or playing anything.
 *
 *  1. THE LOOKUP ASKED ONE IDENTITY. `/users/{id}/recordings` answers for a single
 *     Zoom user. The Open House is run from a recurring meeting owned by a shared
 *     `support` identity while the platform created and watched a second meeting of
 *     its own that attendees never joined, so the sweep could only ever see the
 *     platform's empty room. The host pool has always known every identity; it was
 *     simply never consulted here.
 *
 *  2. NOTHING ASKED HOW LONG A RECORDING WAS. Zoom opens a new recording instance
 *     for every brief visit to a meeting, so somebody clicking a link and closing
 *     the tab leaves a complete, valid 44 KB MP4. The class path has filtered these
 *     by window overlap since 2026-08-06; the room and booking paths had no filter,
 *     which is how 60 recordings under 100 KB accumulated and how two Open Houses
 *     ended up with a clip of a few seconds as their only recording.
 *
 * zoomService keeps its OAuth token and recordings-list cache as module-level
 * state, so each test needs a genuinely fresh module instance rather than cleared
 * mocks — hence resetModules() + require() per test, matching zoomService.test.ts.
 */
function loadZoomService() {
  jest.resetModules();
  return require('../zoomService') as typeof import('../zoomService');
}

function jsonResponse(body: any, ok = true, status = 200): any {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function mockHostPool(hosts: Array<{ host_email: string; enabled: boolean }>) {
  jest.doMock('../zoom/zoomHostRegistry', () => ({
    listHosts: jest.fn().mockResolvedValue(hosts),
    allocatableHostEmails: jest.fn().mockResolvedValue(hosts.map((h) => h.host_email)),
  }));
}

function mockHostPoolFailure(message: string) {
  jest.doMock('../zoom/zoomHostRegistry', () => ({
    listHosts: jest.fn().mockRejectedValue(new Error(message)),
    allocatableHostEmails: jest.fn().mockRejectedValue(new Error(message)),
  }));
}

/** The real 29 Oct Open House: 1.49 GB on the shared support identity. */
const openHouseInstance = (overrides: Record<string, any> = {}) => ({
  id: 97320683688,
  uuid: 'real-open-house',
  topic: 'Career Switch Open House Session',
  recording_files: [{
    file_type: 'MP4',
    file_size: 1485599725,
    download_url: 'https://zoom.us/rec/real',
    recording_type: 'shared_screen_with_speaker_view',
    recording_start: '2026-10-29T23:04:03Z',
    recording_end: '2026-10-30T00:12:00Z',
  }],
  ...overrides,
});

const instanceLasting = (uuid: string, startIso: string, endIso: string, size: number) => ({
  id: 83508993324,
  uuid,
  topic: 'Colaberry Rooms — Coconut Club',
  recording_files: [{
    file_type: 'MP4',
    file_size: size,
    download_url: `https://zoom.us/rec/${uuid}`,
    recording_type: 'active_speaker',
    recording_start: startIso,
    recording_end: endIso,
  }],
});

function recordingCallUrls(): string[] {
  return (global.fetch as jest.Mock).mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes('/recordings'));
}

afterEach(() => {
  jest.dontMock('../zoom/zoomHostRegistry');
});

describe('recordingHostEmails', () => {
  it('puts the configured host first, then every enabled pool host, lowercased and deduped', async () => {
    mockHostPool([
      { host_email: 'program.101@colaberry.com', enabled: true },
      { host_email: 'SUPPORT@colaberry.com', enabled: true },
      { host_email: 'retired@colaberry.com', enabled: false },
      { host_email: 'ali@refactored.ai', enabled: true },
    ]);
    const { recordingHostEmails } = loadZoomService();

    await expect(recordingHostEmails()).resolves.toEqual([
      'ali@refactored.ai',
      'program.101@colaberry.com',
      'support@colaberry.com',
    ]);
  });

  it('degrades to the configured host alone when the pool cannot be read', async () => {
    mockHostPoolFailure('relation "zoom_hosts" does not exist');
    const { recordingHostEmails } = loadZoomService();
    await expect(recordingHostEmails()).resolves.toEqual(['ali@refactored.ai']);
  });

  it('memoizes, so a cron sweeping many sessions does not re-read the pool each time', async () => {
    const hosts = [{ host_email: 'support@colaberry.com', enabled: true }];
    mockHostPool(hosts);
    const { recordingHostEmails } = loadZoomService();
    const registry = require('../zoom/zoomHostRegistry');

    await recordingHostEmails();
    await recordingHostEmails();
    await recordingHostEmails();

    expect(registry.listHosts).toHaveBeenCalledTimes(1);
  });
});

describe('the cross-host recordings sweep', () => {
  it('finds a recording that lives on a pool host rather than the configured one', async () => {
    mockHostPool([{ host_email: 'support@colaberry.com', enabled: true }]);
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [] }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [openHouseInstance()] })) as any;

    const instances = await findRecordingInstancesByMeetingId('97320683688', '2026-10-29', '2026-10-30');

    expect(instances).toHaveLength(1);
    expect(instances[0].uuid).toBe('real-open-house');
    expect(instances[0].match.downloadUrl).toBe('https://zoom.us/rec/real');

    const urls = recordingCallUrls();
    expect(urls.some((u) => u.includes('ali%40refactored.ai'))).toBe(true);
    expect(urls.some((u) => u.includes('support%40colaberry.com'))).toBe(true);
  });

  it('dedupes on the instance uuid, never on the meeting id, so a two-part class survives', async () => {
    mockHostPool([{ host_email: 'support@colaberry.com', enabled: true }]);
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [openHouseInstance({ uuid: 'part-1' })] }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          openHouseInstance({ uuid: 'part-1' }),
          openHouseInstance({ uuid: 'part-2' }),
        ],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('97320683688', '2026-10-29', '2026-10-30');
    expect(instances.map((i) => i.uuid)).toEqual(['part-1', 'part-2']);
  });

  it('keeps sweeping when one host errors, so a dead identity cannot hide the others', async () => {
    mockHostPool([{ host_email: 'support@colaberry.com', enabled: true }]);
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ code: 1001, message: 'User does not exist' }, false, 404))
      .mockResolvedValueOnce(jsonResponse({ meetings: [openHouseInstance()] })) as any;

    const instances = await findRecordingInstancesByMeetingId('97320683688', '2026-10-29', '2026-10-30');
    expect(instances).toHaveLength(1);
  });

  it('throws when EVERY host errors, rather than reporting an outage as "no recording"', async () => {
    mockHostPool([{ host_email: 'support@colaberry.com', enabled: true }]);
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ code: 124, message: 'Invalid access token' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({ code: 124, message: 'Invalid access token' }, false, 401)) as any;

    await expect(
      findRecordingInstancesByMeetingId('97320683688', '2026-10-29', '2026-10-30'),
    ).rejects.toThrow();
  });

  it('makes exactly one recordings call when the pool is unreadable', async () => {
    mockHostPoolFailure('connection refused');
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [openHouseInstance()] })) as any;

    const instances = await findRecordingInstancesByMeetingId('97320683688', '2026-10-29', '2026-10-30');
    expect(instances).toHaveLength(1);
    expect(recordingCallUrls()).toHaveLength(1);
  });
});

describe('the substance floor, applied at selection so a clip is never downloaded', () => {
  it('drops the look-in and keeps the session from the same meeting', async () => {
    mockHostPoolFailure('no pool in this test');
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          // The exact shape production holds: a 4-second look-in at 15:59, then
          // the real session a minute later.
          instanceLasting('look-in', '2026-11-10T15:59:01Z', '2026-11-10T15:59:05Z', 97603),
          instanceLasting('the-session', '2026-11-10T16:00:59Z', '2026-11-10T17:40:14Z', 1126586702),
        ],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('83508993324', '2026-11-10', '2026-11-11');
    expect(instances.map((i) => i.uuid)).toEqual(['the-session']);
  });

  it('refuses every clip length actually observed on production', async () => {
    mockHostPoolFailure('no pool in this test');
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          instanceLasting('c4', '2026-11-18T17:58:06Z', '2026-11-18T17:58:10Z', 27847),
          instanceLasting('c9', '2026-10-29T23:54:06Z', '2026-10-29T23:54:15Z', 44942),
          instanceLasting('c32', '2026-11-17T00:46:31Z', '2026-11-17T00:47:03Z', 117564),
          instanceLasting('c95', '2026-11-02T14:33:24Z', '2026-11-02T14:34:59Z', 703022),
        ],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('83508993324', '2026-10-29', '2026-11-19');
    expect(instances).toEqual([]);
  });

  it('keeps a short instance that shared a screen, because that is a real rehearsal', async () => {
    // Production holds three of these: 1080p shared_screen_with_speaker_view at
    // 63, 71 and 79 seconds, students rehearsing in a practice room. Zoom's
    // listing carries no resolution, so the composition is what saves them here.
    mockHostPoolFailure('no pool in this test');
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [{
          id: 83508993324,
          uuid: 'practice-rehearsal',
          topic: 'Practice: Regional Medical Courier System',
          recording_files: [{
            file_type: 'MP4',
            file_size: 9432401,
            download_url: 'https://zoom.us/rec/practice',
            recording_type: 'shared_screen_with_speaker_view',
            recording_start: '2026-10-09T19:00:00Z',
            recording_end: '2026-10-09T19:01:19Z',
          }],
        }],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('83508993324', '2026-10-09', '2026-10-10');
    expect(instances.map((i) => i.uuid)).toEqual(['practice-rehearsal']);
  });

  it('keeps an instance Zoom gave no timings for, because unknown is not short', async () => {
    // A recording still being processed carries no per-file timings; withholding
    // it would lose a real session to a missing field.
    mockHostPoolFailure('no pool in this test');
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [{
          id: 83508993324,
          uuid: 'no-timings',
          topic: 'Colaberry Rooms — Coconut Club',
          recording_files: [{ file_type: 'MP4', file_size: 500, download_url: 'https://zoom.us/rec/x' }],
        }],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('83508993324', '2026-11-10', '2026-11-11');
    expect(instances.map((i) => i.uuid)).toEqual(['no-timings']);
  });

  it('uses the meeting-level start_time and duration when the files carry no timings', async () => {
    mockHostPoolFailure('no pool in this test');
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          {
            id: 83508993324, uuid: 'short-by-meeting-level', topic: 'x',
            start_time: '2026-11-10T15:59:01Z', duration: 0,
            recording_files: [{ file_type: 'MP4', file_size: 97603, download_url: 'https://zoom.us/rec/s' }],
          },
          {
            id: 83508993324, uuid: 'long-by-meeting-level', topic: 'x',
            start_time: '2026-11-10T16:00:59Z', duration: 100,
            recording_files: [{ file_type: 'MP4', file_size: 293588770, download_url: 'https://zoom.us/rec/l' }],
          },
        ],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('83508993324', '2026-11-10', '2026-11-11');
    expect(instances.map((i) => i.uuid)).toEqual(['long-by-meeting-level']);
  });

  it('leaves the real Open House recording through the floor it was never the problem with', async () => {
    mockHostPool([{ host_email: 'support@colaberry.com', enabled: true }]);
    const { findRecordingInstancesByMeetingId } = loadZoomService();

    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [] }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          openHouseInstance(),
          // A 9-second look-in on the SAME meeting, so the floor is what excludes
          // it here and not the meeting-id check.
          openHouseInstance({
            uuid: 'empty-room',
            recording_files: [{
              file_type: 'MP4',
              file_size: 44942,
              download_url: 'https://zoom.us/rec/empty',
              recording_type: 'active_speaker',
              recording_start: '2026-10-29T23:54:06Z',
              recording_end: '2026-10-29T23:54:15Z',
            }],
          }),
        ],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('97320683688', '2026-10-29', '2026-10-30');
    expect(instances.map((i) => i.uuid)).toEqual(['real-open-house']);
  });
});
