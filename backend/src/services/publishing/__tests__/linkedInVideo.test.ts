/**
 * linkedInVideo — the chunked Videos API path and the adapter's use of it, without a network.
 *
 * What decides whether a video post is lost, corrupted or duplicated: the parts are the exact
 * byte ranges LinkedIn asked for, in order; every ETag is collected and finalised in part
 * order; nothing is posted until AVAILABLE; each failure class retries or dead-letters
 * correctly; and instructions that do not describe the file are refused before any bytes move.
 */

import { LinkedInAdapter, type LinkedInHttp } from '../linkedInAdapter';
import { uploadVideo, VIDEO_PROCESSING_POLL } from '../linkedInVideo';
import { UPLOAD_TIMEOUT_MS } from '../linkedInImages';
import { ProviderPublishError, type PublishMedia, type PublishPayload } from '../socialProviderAdapter';

const TOKEN = ['AQV', 'v1d30T0k3n', 'xyz'].join('');
const AUTHOR = 'urn:li:person:abc123';
const VIDEO_URN = 'urn:li:video:C5F10AQGx';
const POST_URN = 'urn:li:share:7100000000000000001';
const PART = 4_194_304; // LinkedIn's part size
const BYTES = Buffer.alloc(PART * 2 + 1000, 7); // three parts: 4 MB, 4 MB, 1000 B
BYTES[0] = 0; BYTES[PART] = 1; BYTES[PART * 2] = 2; // a marker at the start of each part

const clip: PublishMedia = { ref: 'media/b/' + 'd'.repeat(64) + '.mp4', mimeType: 'video/mp4', altText: 'A twelve second class recap', byteSize: BYTES.length, durationMs: 12_000 };

type Call = Parameters<LinkedInHttp>[0];

function instructions(size: number) {
  const out = [];
  for (let first = 0; first < size; first += PART) out.push({ uploadUrl: `https://www.linkedin.com/dms-uploads/vid/part${out.length}`, firstByte: first, lastByte: Math.min(first + PART, size) - 1 });
  return out;
}

function scripted(overrides: Partial<Record<'init' | 'put' | 'finalize' | 'status' | 'post', (c: Call, n: number) => ReturnType<LinkedInHttp>>> = {}) {
  const calls: Call[] = [];
  let statusCalls = 0; let puts = 0;
  const http: LinkedInHttp = async (c) => {
    calls.push(c);
    if (c.url.endsWith('/rest/videos?action=initializeUpload')) return overrides.init ? overrides.init(c, 0) : { status: 200, headers: {}, body: { value: { video: VIDEO_URN, uploadToken: 'tok-1', uploadInstructions: instructions(BYTES.length) } } };
    if (c.method === 'PUT') { puts += 1; return overrides.put ? overrides.put(c, puts) : { status: 200, headers: { etag: `etag-${puts}` }, body: '' }; }
    if (c.url.endsWith('/rest/videos?action=finalizeUpload')) return overrides.finalize ? overrides.finalize(c, 0) : { status: 200, headers: {}, body: {} };
    if (c.url.startsWith('https://api.linkedin.com/rest/videos/')) { statusCalls += 1; return overrides.status ? overrides.status(c, statusCalls) : { status: 200, headers: {}, body: { status: 'AVAILABLE' } }; }
    if (c.url === 'https://api.linkedin.com/rest/posts') return overrides.post ? overrides.post(c, 0) : { status: 201, headers: { 'x-restli-id': POST_URN }, body: {} };
    throw new Error('unexpected ' + c.method + ' ' + c.url);
  };
  return { http, calls };
}

function payload(media: PublishMedia[]): PublishPayload {
  return {
    jobId: 'job-1', provider: 'linkedin_member', contentItemId: 'ci-1', variantId: 'cv-1', accountId: 'acc-1',
    text: 'Class recap.', mediaRefs: media.map((m) => m.ref), media, poll: null,
    linkUrl: null, disclosureText: null, scheduledFor: '2026-09-16T14:00:00.000Z', contentRevision: 1,
  };
}

const sleeps: number[] = [];
function adapter(http: LinkedInHttp, readMedia: (ref: string) => Promise<Buffer> = async () => BYTES) {
  return new LinkedInAdapter({ provider: 'linkedin_member', getToken: async () => TOKEN, getAuthorUrn: async () => AUTHOR, readMedia, http, clock: () => new Date('2026-09-16T14:00:05Z'), sleep: async (ms) => { sleeps.push(ms); } });
}
const uploadInput = (http: LinkedInHttp) => ({ http, token: TOKEN, owner: AUTHOR, apiVersion: '202609', media: [clip], readMedia: async () => BYTES, sleep: async (ms: number) => { sleeps.push(ms); } });

beforeEach(() => { sleeps.length = 0; });

describe('the four steps, with the right bodies', () => {
  it('initializes with owner + byte count, PUTs each part as the exact byte range, finalizes with the ETags in order, waits, posts the URN', async () => {
    const { http, calls } = scripted();
    const receipt = await adapter(http).publish(payload([clip]), 'idem-1');
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PUT', 'PUT', 'PUT', 'POST', 'GET', 'POST']);

    expect(calls[0].body).toEqual({ initializeUploadRequest: { owner: AUTHOR, fileSizeBytes: BYTES.length, uploadCaptions: false, uploadThumbnail: false } });

    const parts = calls.slice(1, 4);
    expect(parts.map((c) => c.url)).toEqual(['https://www.linkedin.com/dms-uploads/vid/part0', 'https://www.linkedin.com/dms-uploads/vid/part1', 'https://www.linkedin.com/dms-uploads/vid/part2']);
    expect(parts.map((c) => (c.body as Buffer).length)).toEqual([PART, PART, 1000]);
    expect(parts.map((c) => (c.body as Buffer)[0])).toEqual([0, 1, 2]);                      // each part starts where it should
    expect(parts.every((c) => c.headers['Content-Type'] === 'application/octet-stream' && c.timeoutMs === UPLOAD_TIMEOUT_MS)).toBe(true);

    expect(calls[4].body).toEqual({ finalizeUploadRequest: { video: VIDEO_URN, uploadToken: 'tok-1', uploadedPartIds: ['etag-1', 'etag-2', 'etag-3'] } });
    expect(calls[5].url).toBe('https://api.linkedin.com/rest/videos/' + encodeURIComponent(VIDEO_URN));

    const post = calls[6].body as { content: unknown; commentary: string };
    expect(post.content).toEqual({ media: { id: VIDEO_URN, title: 'A twelve second class recap' } });
    expect(post.commentary).toBe('Class recap.');
    expect(receipt.requestMetadata).toMatchObject({ video_urn: VIDEO_URN, image_urns: [], document_urn: null, media_count: 1 });
  });

  it('a single-part file (smaller than one part) is one PUT', async () => {
    const small = Buffer.alloc(5000, 9);
    const { http, calls } = scripted({ init: () => Promise.resolve({ status: 200, headers: {}, body: { value: { video: VIDEO_URN, uploadToken: '', uploadInstructions: instructions(5000) } } }) });
    await uploadVideo({ ...uploadInput(http), readMedia: async () => small }, { ...clip, byteSize: 5000 });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    expect(((calls[4] ?? calls[2]).body as { finalizeUploadRequest: { uploadedPartIds: string[] } }).finalizeUploadRequest.uploadedPartIds).toEqual(['etag-1']);
  });
});

describe('waiting for LinkedIn to transcode', () => {
  it('polls with the longer video budget, then posts', async () => {
    const { http, calls } = scripted({ status: (_c, n) => Promise.resolve({ status: 200, headers: {}, body: { status: n < 4 ? 'PROCESSING' : 'AVAILABLE' } }) });
    await adapter(http).publish(payload([clip]), 'idem-1');
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(4);
    expect(sleeps).toEqual([VIDEO_PROCESSING_POLL.intervalMs, VIDEO_PROCESSING_POLL.intervalMs, VIDEO_PROCESSING_POLL.intervalMs]);
  });

  it('gives up after the budget as TRANSIENT with no post; PROCESSING_FAILED is permanent with the fix', async () => {
    const stuck = scripted({ status: () => Promise.resolve({ status: 200, headers: {}, body: { status: 'PROCESSING' } }) });
    await expect(adapter(stuck.http).publish(payload([clip]), 'idem-1')).rejects.toMatchObject({ permanent: false, providerCode: 'VideoStillProcessing' });
    expect(stuck.calls.filter((c) => c.method === 'GET')).toHaveLength(VIDEO_PROCESSING_POLL.attempts);
    expect(stuck.calls.some((c) => c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);

    const failed = scripted({ status: () => Promise.resolve({ status: 200, headers: {}, body: { status: 'PROCESSING_FAILED' } }) });
    const err = await adapter(failed.http).publish(payload([clip]), 'idem-1').then(() => null, (e: ProviderPublishError) => e);
    expect(err).toMatchObject({ permanent: true, providerCode: 'VideoProcessingFailed' });
    expect(err?.message).toMatch(/Re-export it as H\.264 MP4/);
  });
});

describe('failures at each step: no post, right class, no token in the message', () => {
  it('initialize 401 permanent, 429 transient, nothing uploaded', async () => {
    const a = scripted({ init: () => Promise.resolve({ status: 401, headers: {}, body: { message: 'Invalid access token' } }) });
    const err = await adapter(a.http).publish(payload([clip]), 'idem-1').then(() => null, (e: ProviderPublishError) => e);
    expect(err).toMatchObject({ permanent: true, httpStatus: 401 });
    expect(err?.message).not.toContain(TOKEN);
    expect(a.calls).toHaveLength(1);
    await expect(adapter(scripted({ init: () => Promise.resolve({ status: 429, headers: {}, body: {} }) }).http).publish(payload([clip]), 'idem-1')).rejects.toMatchObject({ permanent: false });
  });

  it('instructions that do not describe the file (a gap, an overrun, none) are refused before any PUT', async () => {
    const cases = [
      instructions(BYTES.length).slice(1),                                           // missing the first part
      [{ uploadUrl: 'u', firstByte: 0, lastByte: BYTES.length + 5 }],                  // past the end
      [],                                                                            // none
    ];
    for (const bad of cases) {
      const { http, calls } = scripted({ init: () => Promise.resolve({ status: 200, headers: {}, body: { value: { video: VIDEO_URN, uploadToken: '', uploadInstructions: bad } } }) });
      await expect(uploadVideo(uploadInput(http), clip)).rejects.toMatchObject({ permanent: true, providerCode: 'VideoInitializeMalformed' });
      expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    }
  });

  it('a part PUT 5xx is transient and names the part; a part with no ETag is permanent; neither posts', async () => {
    const five = scripted({ put: (_c, n) => Promise.resolve(n === 2 ? { status: 503, headers: {}, body: '' } : { status: 200, headers: { etag: `e${n}` }, body: '' }) });
    const err = await adapter(five.http).publish(payload([clip]), 'idem-1').then(() => null, (e: ProviderPublishError) => e);
    expect(err).toMatchObject({ permanent: false, providerCode: 'VideoUploadFailed', httpStatus: 503 });
    expect(err?.message).toMatch(/part 2\/3/);
    expect(five.calls.some((c) => c.url.endsWith('finalizeUpload') || c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);

    const noEtag = scripted({ put: () => Promise.resolve({ status: 200, headers: {}, body: '' }) });
    await expect(adapter(noEtag.http).publish(payload([clip]), 'idem-1')).rejects.toMatchObject({ permanent: true, providerCode: 'VideoUploadNoEtag' });
  });

  it('a status GET 5xx is transient, names the VIDEO (not "the image"), and no post is created', async () => {
    const { http, calls } = scripted({ status: () => Promise.resolve({ status: 503, headers: {}, body: '' }) });
    const err = await adapter(http).publish(payload([clip]), 'idem-1').then(() => null, (e: ProviderPublishError) => e);
    expect(err).toMatchObject({ permanent: false, providerCode: 'VideoStatusCheckFailed', httpStatus: 503 });
    expect(err?.message).toMatch(/refused the video status check/);
    expect(calls.some((c) => c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);
  });

  it('a mixed media list reaching publish() without validate is refused, never sent to the Images API', async () => {
    const { http, calls } = scripted();
    const pdf: PublishMedia = { ref: 'media/b/' + 'c'.repeat(64) + '.pdf', mimeType: 'application/pdf', altText: 'Deck', byteSize: 1000 };
    await expect(adapter(http).publish(payload([clip, pdf]), 'idem-1')).rejects.toMatchObject({ permanent: true, providerCode: 'MixedMediaKinds' });
    expect(calls).toHaveLength(0);
  });

  it('fractional byte offsets in the instructions are refused as malformed', async () => {
    const { http, calls } = scripted({ init: () => Promise.resolve({ status: 200, headers: {}, body: { value: { video: VIDEO_URN, uploadToken: '', uploadInstructions: [{ uploadUrl: 'u', firstByte: 0, lastByte: 999.5 }, { uploadUrl: 'u2', firstByte: 1000.5, lastByte: BYTES.length - 1 }] } } }) });
    await expect(uploadVideo(uploadInput(http), clip)).rejects.toMatchObject({ providerCode: 'VideoInitializeMalformed' });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('finalize 4xx is permanent and no post is created', async () => {
    const { http, calls } = scripted({ finalize: () => Promise.resolve({ status: 422, headers: {}, body: { message: 'Upload parts mismatch' } }) });
    await expect(adapter(http).publish(payload([clip]), 'idem-1')).rejects.toMatchObject({ permanent: true, providerCode: 'VideoFinalizeFailed', httpStatus: 422 });
    expect(calls.some((c) => c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);
  });

  it('an unreadable local file is OUR permanent failure and LinkedIn is never called', async () => {
    const { http, calls } = scripted();
    await expect(adapter(http, async () => { throw new Error('Stored bytes do not match their key.'); }).publish(payload([clip]), 'idem-1')).rejects.toMatchObject({ permanent: true, providerCode: 'MediaUnreadable' });
    expect(calls).toHaveLength(0);
  });
});
