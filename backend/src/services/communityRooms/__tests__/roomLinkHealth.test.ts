/**
 * roomLinkHealth: only Zoom's explicit "Meeting does not exist" may ever mark a
 * stored room link dead. Everything else (timeouts, 5xx, missing scope, non-Zoom
 * links) must read 'unknown' so the caller keeps the link it has.
 */
jest.mock('../../zoomService', () => ({
  ...jest.requireActual('../../zoomService'),
  isZoomConfigured: jest.fn(() => true),
  getMeetingJoinUrl: jest.fn(),
}));

import { getMeetingJoinUrl, isZoomConfigured } from '../../zoomService';
import {
  ALIVE_TTL_MS,
  __resetRoomLinkHealthCacheForTests,
  checkRoomLink,
  isMeetingGoneError,
} from '../roomLinkHealth';

const getMeeting = getMeetingJoinUrl as jest.Mock;
const configured = isZoomConfigured as jest.Mock;

const LINK = 'https://colaberry.zoom.us/j/86221767778?pwd=abc';
// The exact message zoomApiClient throws, captured from production on 2026-11-13.
const GONE = new Error('Zoom API error 404: {"code":3001,"message":"Meeting does not exist: 86221767778."}');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  configured.mockReturnValue(true);
  __resetRoomLinkHealthCacheForTests();
});

describe('isMeetingGoneError', () => {
  it('matches only 404 with code 3001', () => {
    expect(isMeetingGoneError(GONE)).toBe(true);
    expect(isMeetingGoneError(new Error('Zoom API error 404: {"code":1001,"message":"User does not exist"}'))).toBe(false);
    expect(isMeetingGoneError(new Error('Zoom API error 500: {"code":3001}'))).toBe(false);
    expect(isMeetingGoneError(new Error('The operation was aborted'))).toBe(false);
    expect(isMeetingGoneError('not an error')).toBe(false);
  });
});

describe('checkRoomLink', () => {
  it('alive when Zoom returns the meeting', async () => {
    getMeeting.mockResolvedValue('https://colaberry.zoom.us/j/86221767778');
    await expect(checkRoomLink(LINK)).resolves.toBe('alive');
    expect(getMeeting).toHaveBeenCalledWith('86221767778');
  });

  it('dead when Zoom says the meeting does not exist', async () => {
    getMeeting.mockRejectedValue(GONE);
    await expect(checkRoomLink(LINK)).resolves.toBe('dead');
  });

  it.each([
    ['timeout', new Error('The operation was aborted')],
    ['server error', new Error('Zoom API error 502: bad gateway')],
    ['missing scope', new Error('Zoom API error 403: {"code":4711,"message":"Invalid access token, does not contain scopes"}')],
  ])('unknown on %s, never dead', async (_label, err) => {
    getMeeting.mockRejectedValue(err);
    await expect(checkRoomLink(LINK)).resolves.toBe('unknown');
  });

  it('unknown for non-Zoom links and when Zoom is not configured, without calling Zoom', async () => {
    await expect(checkRoomLink('https://meet.google.com/abc-defg-hij')).resolves.toBe('unknown');
    configured.mockReturnValue(false);
    await expect(checkRoomLink(LINK)).resolves.toBe('unknown');
    expect(getMeeting).not.toHaveBeenCalled();
  });

  it('caches alive for the TTL, then re-checks (and a later death is seen)', async () => {
    getMeeting.mockResolvedValue('x');
    const t0 = 1_000_000;
    await checkRoomLink(LINK, t0);
    await checkRoomLink(LINK, t0 + ALIVE_TTL_MS - 1);
    expect(getMeeting).toHaveBeenCalledTimes(1);

    getMeeting.mockRejectedValue(GONE);
    await expect(checkRoomLink(LINK, t0 + ALIVE_TTL_MS + 1)).resolves.toBe('dead');
    expect(getMeeting).toHaveBeenCalledTimes(2);
  });

  it('never caches dead: a second check asks Zoom again', async () => {
    getMeeting.mockRejectedValue(GONE);
    await checkRoomLink(LINK);
    await checkRoomLink(LINK);
    expect(getMeeting).toHaveBeenCalledTimes(2);
  });
});
