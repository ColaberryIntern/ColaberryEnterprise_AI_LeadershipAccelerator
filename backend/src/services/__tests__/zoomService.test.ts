jest.mock('../../config/env', () => ({
  env: {
    zoomAccountId: 'acct-1',
    zoomClientId: 'client-1',
    zoomClientSecret: 'secret-1',
    zoomWebhookSecretToken: 'webhook-secret',
    zoomHostEmail: 'ali@refactored.ai',
  },
}));

import crypto from 'crypto';

/**
 * zoomService unit tests — the Zoom Server-to-Server OAuth + Cloud Recording
 * provider that replaces driveService.ts. All Zoom API calls go through the
 * global fetch, mocked here; no real network I/O. Covers: OAuth token
 * fetch+cache, meeting creation (the auto_recording:'cloud' setting is the
 * whole point — this is what removes the "did a human click Record" failure
 * mode), recording matching (exact meeting-ID match, largest-MP4-wins when
 * pause/resume produced more than one file), and the two download-auth
 * paths (webhook download_token vs S2S bearer for the backfill cron).
 *
 * zoomService.ts keeps its OAuth token and recordings-list cache as
 * module-level state (by design — see its own header comment on why that's
 * safe for this single-process backend). That means each test here needs a
 * genuinely fresh module instance, not just cleared jest.fn() mocks, or an
 * earlier test's cached token/list would silently short-circuit a later
 * test's fetch expectations. jest.resetModules() + a fresh require() per
 * test achieves that; a plain top-of-file import would not.
 */
function loadZoomService() {
  jest.resetModules();
  return require('../zoomService') as typeof import('../zoomService');
}

function jsonResponse(body: any, ok = true, status = 200): any {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function streamResponse(ok = true, status = 200): any {
  // A real fetch Response so .body is a genuine ReadableStream —
  // Readable.fromWeb() rejects a plain object.
  const res = new Response('fake-mp4-bytes', { status });
  return { ok, status, body: res.body };
}

const session: any = {
  id: 'session-1',
  title: 'Week 1 · Build Day',
  session_number: 3,
  session_date: '2026-07-30',
  description: 'Claude Code Foundations',
  zoom_meeting_id: '123456789',
};

describe('isZoomConfigured', () => {
  it('is true when all 5 env vars are set (per the mocked env above)', () => {
    const { isZoomConfigured } = loadZoomService();
    expect(isZoomConfigured()).toBe(true);
  });
});

describe('OAuth token fetch + cache', () => {
  it('fetches a token via Basic auth from client id/secret, then reuses the cached token on a second call', async () => {
    const { createMeetingForSession } = loadZoomService();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 })) // OAuth call
      .mockResolvedValueOnce(jsonResponse({ id: 111, join_url: 'https://zoom.us/j/111' })) // create meeting #1
      .mockResolvedValueOnce(jsonResponse({ id: 222, join_url: 'https://zoom.us/j/222' })); // create meeting #2
    global.fetch = fetchMock as any;

    await createMeetingForSession(session, { startDateTime: '2026-07-30T18:30:00', durationMinutes: 120 });
    await createMeetingForSession(session, { startDateTime: '2026-07-30T18:30:00', durationMinutes: 120 });

    // Only ONE OAuth call across both meeting creations — the second reused the cached token.
    const oauthCalls = fetchMock.mock.calls.filter(([url]: any[]) => String(url).includes('/oauth/token'));
    expect(oauthCalls).toHaveLength(1);
    const [oauthUrl, oauthInit] = oauthCalls[0];
    expect(String(oauthUrl)).toContain('grant_type=account_credentials');
    expect(String(oauthUrl)).toContain('account_id=acct-1');
    expect((oauthInit.headers as any).Authorization).toBe(`Basic ${Buffer.from('client-1:secret-1').toString('base64')}`);
  });
});

describe('createMeetingForSession', () => {
  it('creates the meeting under ZOOM_HOST_EMAIL with cloud auto-recording, and returns joinUrl/meetingId', async () => {
    const { createMeetingForSession } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: 987654321, join_url: 'https://zoom.us/j/987654321' })) as any;

    const result = await createMeetingForSession(session, { startDateTime: '2026-07-30T18:30:00', durationMinutes: 120 });

    expect(result).toEqual({ joinUrl: 'https://zoom.us/j/987654321', meetingId: '987654321' });

    const createCall = (global.fetch as jest.Mock).mock.calls.find(([url]: any[]) => String(url).includes('/meetings'));
    expect(String(createCall[0])).toBe('https://api.zoom.us/v2/users/ali%40refactored.ai/meetings');
    const body = JSON.parse(createCall[1].body);
    // The critical setting: recording must not depend on a human clicking Record.
    expect(body.settings.auto_recording).toBe('cloud');
    expect(body.start_time).toBe('2026-07-30T18:30:00');
    expect(body.duration).toBe(120);
  });
});

describe('updateMeeting / cancelMeeting / getMeetingJoinUrl (used by communityRooms/meetingProvider.ts)', () => {
  it('updateMeeting PATCHes only the provided fields and handles a 204 no-content response', async () => {
    const { updateMeeting } = loadZoomService();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
    global.fetch = fetchMock as any;

    await updateMeeting('123', { topic: 'New title', durationMinutes: 45 });

    const patchCall = fetchMock.mock.calls.find(([url]: any[]) => String(url).includes('/meetings/123'));
    expect(patchCall[1].method).toBe('PATCH');
    expect(JSON.parse(patchCall[1].body)).toEqual({ topic: 'New title', duration: 45 });
  });

  it('cancelMeeting DELETEs the meeting and handles a 204 no-content response', async () => {
    const { cancelMeeting } = loadZoomService();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
    global.fetch = fetchMock as any;

    await cancelMeeting('123');

    const delCall = fetchMock.mock.calls.find(([url]: any[]) => String(url).includes('/meetings/123'));
    expect(delCall[1].method).toBe('DELETE');
  });

  it('getMeetingJoinUrl returns the join_url from a real (non-204) meeting lookup', async () => {
    const { getMeetingJoinUrl } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: 123, join_url: 'https://zoom.us/j/123' })) as any;

    await expect(getMeetingJoinUrl('123')).resolves.toBe('https://zoom.us/j/123');
  });
});

describe('findRecordingForSession', () => {
  it('returns null without an API call when the session has no zoom_meeting_id yet', async () => {
    const { findRecordingForSession } = loadZoomService();
    global.fetch = jest.fn() as any;

    const result = await findRecordingForSession({ ...session, zoom_meeting_id: undefined });
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('matches by exact numeric meeting ID and picks the largest MP4 when more than one exists (pause/resume)', async () => {
    const { findRecordingForSession } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          { id: 111111, topic: 'Other class', recording_files: [{ file_type: 'MP4', file_size: 999, download_url: 'https://zoom.us/rec/other' }] },
          {
            id: 123456789,
            topic: 'Week 1 Build Day',
            recording_files: [
              { file_type: 'MP4', file_size: 100, download_url: 'https://zoom.us/rec/small' },
              { file_type: 'MP4', file_size: 900, download_url: 'https://zoom.us/rec/large' },
              { file_type: 'CHAT', file_size: 5, download_url: 'https://zoom.us/rec/chat' },
            ],
          },
        ],
      })) as any;

    const match = await findRecordingForSession(session);

    expect(match).toEqual({
      downloadUrl: 'https://zoom.us/rec/large',
      name: 'Week 1 Build Day.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 900,
    });
  });

  it('returns null (not an error) when no meeting in the window matches this session\'s ID', async () => {
    const { findRecordingForSession } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [] })) as any;

    const match = await findRecordingForSession(session);
    expect(match).toBeNull();
  });

  it('memoizes the list call: two sessions in the same date window collapse to one real HTTP list request', async () => {
    const { findRecordingForSession } = loadZoomService();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [] }));
    global.fetch = fetchMock as any;

    const otherSession = { ...session, id: 'session-2', zoom_meeting_id: '999' };
    await findRecordingForSession(session);
    await findRecordingForSession(otherSession);

    const listCalls = fetchMock.mock.calls.filter(([url]: any[]) => String(url).includes('/recordings'));
    expect(listCalls).toHaveLength(1); // second call reused the memoized response, not a fresh request
  });
});

describe('findRecordingByMeetingId (the generic entry point behind findRecordingForSession, and used directly by ingestRecordingForBooking for general Room bookings)', () => {
  it('matches by meeting ID + a date hint with no LiveSession involved at all', async () => {
    const { findRecordingByMeetingId } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [{ id: 456, topic: 'Study Group', recording_files: [{ file_type: 'MP4', file_size: 300, download_url: 'https://zoom.us/rec/booking' }] }],
      })) as any;

    const match = await findRecordingByMeetingId('456', '2026-08-04', 'fallback title');

    expect(match).toEqual({
      downloadUrl: 'https://zoom.us/rec/booking',
      name: 'Study Group.mp4', // Zoom's own topic wins over the fallback when present
      mimeType: 'video/mp4',
      sizeBytes: 300,
    });
  });

  it('falls back to the provided name when Zoom has no topic on the meeting', async () => {
    const { findRecordingByMeetingId } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [{ id: 456, topic: '', recording_files: [{ file_type: 'MP4', file_size: 300, download_url: 'https://zoom.us/rec/booking' }] }],
      })) as any;

    const match = await findRecordingByMeetingId('456', '2026-08-04', 'Study Group (fallback)');
    expect(match?.name).toBe('Study Group (fallback).mp4');
  });
});

describe('findRecordingInstancesByMeetingId (always-open Rooms — same numeric meeting id reused across many distinct recording instances)', () => {
  it('returns every matching instance in the window, each with its own uuid, ignoring non-matching meetings', async () => {
    const { findRecordingInstancesByMeetingId } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          { id: 89581408269, uuid: 'uuid-first', topic: 'Colaberry Rooms — July 2026', recording_files: [{ file_type: 'MP4', file_size: 100, download_url: 'https://zoom.us/rec/1' }] },
          { id: 11111111, uuid: 'uuid-unrelated', topic: 'Other', recording_files: [{ file_type: 'MP4', file_size: 50, download_url: 'https://zoom.us/rec/2' }] },
          { id: 89581408269, uuid: 'uuid-second', topic: 'Colaberry Rooms — July 2026', recording_files: [{ file_type: 'MP4', file_size: 200, download_url: 'https://zoom.us/rec/3' }] },
        ],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('89581408269', '2026-07-31', '2026-08-06', 'fallback');

    expect(instances).toHaveLength(2);
    expect(instances.map((i) => i.uuid)).toEqual(['uuid-first', 'uuid-second']);
    expect(instances[1].match.downloadUrl).toBe('https://zoom.us/rec/3');
  });

  it('skips an instance that has no MP4 file yet, without throwing', async () => {
    const { findRecordingInstancesByMeetingId } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        meetings: [
          { id: 456, uuid: 'uuid-transcript-only', topic: 'x', recording_files: [{ file_type: 'TRANSCRIPT', file_size: 5, download_url: 'https://zoom.us/rec/vtt' }] },
        ],
      })) as any;

    const instances = await findRecordingInstancesByMeetingId('456', '2026-08-01', '2026-08-02');
    expect(instances).toEqual([]);
  });

  it('returns an empty array (not an error) when nothing in the window matches the meeting id', async () => {
    const { findRecordingInstancesByMeetingId } = loadZoomService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ meetings: [] })) as any;

    const instances = await findRecordingInstancesByMeetingId('999', '2026-08-01', '2026-08-02');
    expect(instances).toEqual([]);
  });
});

describe('extractZoomMeetingId', () => {
  it('extracts the numeric meeting id from a Zoom join URL', () => {
    const { extractZoomMeetingId } = loadZoomService();
    expect(extractZoomMeetingId('https://colaberry.zoom.us/j/89581408269?pwd=abc.1')).toBe('89581408269');
  });

  it('returns null for a non-Zoom link (e.g. a legacy Google Meet link)', () => {
    const { extractZoomMeetingId } = loadZoomService();
    expect(extractZoomMeetingId('https://meet.google.com/jda-mjtm-sgm')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    const { extractZoomMeetingId } = loadZoomService();
    expect(extractZoomMeetingId(null)).toBeNull();
    expect(extractZoomMeetingId(undefined)).toBeNull();
  });
});

describe('streamZoomFile', () => {
  it('uses the webhook-supplied download_token as a query param when present (no extra OAuth call)', async () => {
    const { streamZoomFile } = loadZoomService();
    const fetchMock = jest.fn().mockResolvedValue(streamResponse());
    global.fetch = fetchMock as any;

    await streamZoomFile({ downloadUrl: 'https://zoom.us/rec/large', downloadToken: 'short-token', name: 'x.mp4', mimeType: 'video/mp4', sizeBytes: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1); // just the download — no OAuth round-trip
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://zoom.us/rec/large?access_token=short-token');
  });

  it('falls back to the S2S bearer token when no download_token is present (the backfill/polling path)', async () => {
    const { streamZoomFile } = loadZoomService();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 })) // OAuth
      .mockResolvedValueOnce(streamResponse()); // download
    global.fetch = fetchMock as any;

    await streamZoomFile({ downloadUrl: 'https://zoom.us/rec/large', name: 'x.mp4', mimeType: 'video/mp4', sizeBytes: 1 });

    const downloadCall = fetchMock.mock.calls.find(([url]: any[]) => String(url) === 'https://zoom.us/rec/large');
    expect(downloadCall[1].headers.Authorization).toBe('Bearer tok-1');
  });
});

describe('verifyZoomWebhookSignature', () => {
  it('accepts a correctly computed v0=<hex> signature', () => {
    const { verifyZoomWebhookSignature } = loadZoomService();
    const rawBody = '{"event":"recording.completed"}';
    const timestamp = '1700000000';
    const expected = 'v0=' + crypto.createHmac('sha256', 'webhook-secret').update(`v0:${timestamp}:${rawBody}`).digest('hex');

    expect(verifyZoomWebhookSignature(rawBody, timestamp, expected)).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const { verifyZoomWebhookSignature } = loadZoomService();
    const timestamp = '1700000000';
    const expected = 'v0=' + crypto.createHmac('sha256', 'webhook-secret').update(`v0:${timestamp}:{"event":"a"}`).digest('hex');

    expect(verifyZoomWebhookSignature('{"event":"b"}', timestamp, expected)).toBe(false);
  });

  it('rejects when the secret is configured but the signature header is missing (reject, not warn-and-accept)', () => {
    const { verifyZoomWebhookSignature } = loadZoomService();
    expect(verifyZoomWebhookSignature('{}', '1700000000', undefined)).toBe(false);
  });
});

describe('computeZoomWebhookEncryptedToken', () => {
  it('computes the HMAC-SHA256 hex digest of the plainToken with the webhook secret', () => {
    const { computeZoomWebhookEncryptedToken } = loadZoomService();
    const expected = crypto.createHmac('sha256', 'webhook-secret').update('plain-abc').digest('hex');
    expect(computeZoomWebhookEncryptedToken('plain-abc')).toBe(expected);
  });
});
