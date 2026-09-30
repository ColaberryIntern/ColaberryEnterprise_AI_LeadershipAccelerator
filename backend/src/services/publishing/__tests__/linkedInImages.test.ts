/**
 * linkedInImages — the three-step upload, and the adapter's use of it, without a network.
 *
 * What is worth proving: the bytes go to the URL LinkedIn handed back (not to the API host),
 * as a raw body with the bearer token; the post references the URN and carries the alt text
 * in the shape LinkedIn wants for one image vs several; nothing is posted when an upload fails;
 * each failure class retries or dead-letters correctly; and the token never leaks into an
 * error message.
 */

import { LinkedInAdapter, LINKEDIN_API_VERSION, type LinkedInHttp } from '../linkedInAdapter';
import { uploadImages, PROCESSING_POLL, UPLOAD_TIMEOUT_MS } from '../linkedInImages';
import { ProviderPublishError, type PublishMedia, type PublishPayload } from '../socialProviderAdapter';

const TOKEN = ['AQV', 'x1y2z3A4B5C6D7E8F9G0', 'hIjKlMnOpQrStUvWxYz'].join('');
const AUTHOR = 'urn:li:person:abc123';
const POST_URN = 'urn:li:share:7123456789012345678';
const IMAGE_URN = 'urn:li:image:C4D22AQFj9x';
const UPLOAD_URL = 'https://www.linkedin.com/dms-uploads/C4D22AQFj9x/uploadedImage/0?ca=vector_feedshare&cn=uploads&sync=0&v=beta&ut=abc';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)]);

const hero: PublishMedia = { ref: 'media/b/' + 'a'.repeat(64) + '.png', mimeType: 'image/png', altText: 'Two people at a whiteboard', byteSize: PNG.length };
const second: PublishMedia = { ref: 'media/b/' + 'b'.repeat(64) + '.jpg', mimeType: 'image/jpeg', altText: null, byteSize: 900 };

type Call = Parameters<LinkedInHttp>[0];

/**
 * A scripted LinkedIn: answers by (method, url) so a test can override one step and leave the
 * others on the happy path. Records every call for the assertions.
 */
function scripted(overrides: Partial<Record<'init' | 'put' | 'status' | 'post', (c: Call, n: number) => ReturnType<LinkedInHttp>>> = {}) {
  const calls: Call[] = [];
  let statusCalls = 0;
  const http: LinkedInHttp = async (c) => {
    calls.push(c);
    if (c.url.endsWith('?action=initializeUpload')) return overrides.init ? overrides.init(c, 0) : { status: 200, headers: {}, body: { value: { uploadUrl: UPLOAD_URL, image: IMAGE_URN, uploadUrlExpiresAt: 1 } } };
    if (c.method === 'PUT') return overrides.put ? overrides.put(c, 0) : { status: 201, headers: {}, body: '' };
    if (c.url.startsWith('https://api.linkedin.com/rest/images/')) { statusCalls += 1; return overrides.status ? overrides.status(c, statusCalls) : { status: 200, headers: {}, body: { status: 'AVAILABLE' } }; }
    if (c.url === 'https://api.linkedin.com/rest/posts') return overrides.post ? overrides.post(c, 0) : { status: 201, headers: { 'x-restli-id': POST_URN }, body: {} };
    throw new Error('unexpected call ' + c.method + ' ' + c.url);
  };
  return { http, calls };
}

function payload(media: PublishMedia[], provider: PublishPayload['provider'] = 'linkedin_member'): PublishPayload {
  return {
    jobId: 'job-1', provider, contentItemId: 'ci-1', variantId: 'cv-1', accountId: 'acc-1',
    text: 'Free class Thursday.', mediaRefs: media.map((m) => m.ref), media, poll: null,
    linkUrl: null, disclosureText: null, scheduledFor: '2026-09-15T18:00:00.000Z', contentRevision: 1,
  };
}

const sleeps: number[] = [];
function adapter(http: LinkedInHttp, provider: PublishPayload['provider'] = 'linkedin_member', readMedia: (ref: string) => Promise<Buffer> = async () => PNG) {
  return new LinkedInAdapter({
    provider: provider as 'linkedin_member' | 'linkedin_organization', getToken: async () => TOKEN, getAuthorUrn: async () => AUTHOR,
    readMedia, http, clock: () => new Date('2026-09-15T18:00:05.000Z'), sleep: async (ms) => { sleeps.push(ms); },
  });
}

beforeEach(() => { sleeps.length = 0; });

describe('the three steps, in order, with the right bodies', () => {
  it('initializes with the author as owner, PUTs the raw bytes to the returned URL, waits for AVAILABLE, then posts the URN', async () => {
    const { http, calls } = scripted();
    const receipt = await adapter(http).publish(payload([hero]), 'idem-1');

    expect(calls.map((c) => c.method)).toEqual(['POST', 'PUT', 'GET', 'POST']);

    const init = calls[0];
    expect(init.url).toBe('https://api.linkedin.com/rest/images?action=initializeUpload');
    expect(init.headers['LinkedIn-Version']).toBe(LINKEDIN_API_VERSION);
    expect(init.body).toEqual({ initializeUploadRequest: { owner: AUTHOR } });

    const put = calls[1];
    expect(put.url).toBe(UPLOAD_URL);                       // LinkedIn's URL, not ours
    expect(Buffer.isBuffer(put.body) && (put.body as Buffer).equals(PNG)).toBe(true); // raw, not JSON
    expect(put.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(put.headers['Content-Type']).toBe('application/octet-stream');
    expect(put.timeoutMs).toBe(UPLOAD_TIMEOUT_MS);          // a transfer gets a transfer's budget

    expect(calls[2].url).toBe('https://api.linkedin.com/rest/images/' + encodeURIComponent(IMAGE_URN));

    const post = calls[3].body as Record<string, unknown>;
    expect(post.content).toEqual({ media: { id: IMAGE_URN, altText: 'Two people at a whiteboard' } });
    expect(post.commentary).toBe('Free class Thursday.');
    expect(receipt.externalId).toBe(POST_URN);
    expect(receipt.requestMetadata).toMatchObject({ media_count: 1, image_urns: [IMAGE_URN] });
  });

  it('reads the bytes by storage key through the injected reader, not from the ref string', async () => {
    const readMedia = jest.fn(async () => PNG);
    const { http } = scripted();
    await adapter(http, 'linkedin_member', readMedia).publish(payload([hero]), 'idem-1');
    expect(readMedia).toHaveBeenCalledWith(hero.ref);
  });

  it('uses multiImage, with one entry per image and alt text only where there is one, for two or more', async () => {
    const { http, calls } = scripted();
    await adapter(http, 'linkedin_organization').publish(payload([hero, second], 'linkedin_organization'), 'idem-1');
    const post = calls[calls.length - 1].body as { content: unknown };
    expect(post.content).toEqual({ multiImage: { images: [{ id: IMAGE_URN, altText: 'Two people at a whiteboard' }, { id: IMAGE_URN }] } });
    // Two uploads happened, each with all three steps.
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
  });

  it('a text-only post makes exactly one call and carries no content key', async () => {
    const { http, calls } = scripted();
    await adapter(http).publish(payload([]), 'idem-1');
    expect(calls).toHaveLength(1);
    expect('content' in (calls[0].body as object)).toBe(false);
  });
});

describe('waiting for LinkedIn to process the image', () => {
  it('polls until AVAILABLE, sleeping between checks, and posts only then', async () => {
    const { http, calls } = scripted({ status: (_c, n) => Promise.resolve({ status: 200, headers: {}, body: { status: n < 3 ? 'PROCESSING' : 'AVAILABLE' } }) });
    await adapter(http).publish(payload([hero]), 'idem-1');
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(3);
    expect(sleeps).toEqual([PROCESSING_POLL.intervalMs, PROCESSING_POLL.intervalMs]);
    expect(calls[calls.length - 1].url).toBe('https://api.linkedin.com/rest/posts');
  });

  it('gives up after the budget as TRANSIENT, with no post created', async () => {
    const { http, calls } = scripted({ status: () => Promise.resolve({ status: 200, headers: {}, body: { status: 'PROCESSING' } }) });
    await expect(adapter(http).publish(payload([hero]), 'idem-1')).rejects.toMatchObject({ permanent: false, providerCode: 'ImageStillProcessing' });
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(PROCESSING_POLL.attempts);
    expect(calls.some((c) => c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);
  });

  it('PROCESSING_FAILED is permanent and tells the operator what to do', async () => {
    const { http } = scripted({ status: () => Promise.resolve({ status: 200, headers: {}, body: { status: 'PROCESSING_FAILED' } }) });
    const err = await adapter(http).publish(payload([hero]), 'idem-1').then(() => null, (e: ProviderPublishError) => e);
    expect(err).toMatchObject({ permanent: true, providerCode: 'ImageProcessingFailed' });
    expect(err?.message).toMatch(/Re-export it/);
  });
});

describe('failures at each step: no post, correct retry class, no token in the message', () => {
  it('initializeUpload 401 is permanent and nothing is uploaded or posted', async () => {
    const { http, calls } = scripted({ init: () => Promise.resolve({ status: 401, headers: {}, body: { message: 'Invalid access token', serviceErrorCode: 65600 } }) });
    const err = await adapter(http).publish(payload([hero]), 'idem-1').then(() => null, (e: ProviderPublishError) => e);
    expect(err).toMatchObject({ permanent: true, providerCode: '65600', httpStatus: 401 });
    expect(calls).toHaveLength(1);
    expect(err?.message).not.toContain(TOKEN);
  });

  it('initializeUpload 429 is transient', async () => {
    const { http } = scripted({ init: () => Promise.resolve({ status: 429, headers: {}, body: {} }) });
    await expect(adapter(http).publish(payload([hero]), 'idem-1')).rejects.toMatchObject({ permanent: false });
  });

  it('a 200 from initializeUpload with no uploadUrl is permanent: a contract change, not a blip', async () => {
    const { http } = scripted({ init: () => Promise.resolve({ status: 200, headers: {}, body: { value: {} } }) });
    await expect(adapter(http).publish(payload([hero]), 'idem-1')).rejects.toMatchObject({ permanent: true, providerCode: 'ImageInitializeMalformed' });
  });

  it('the byte upload failing with 503 is transient and no post is created', async () => {
    const { http, calls } = scripted({ put: () => Promise.resolve({ status: 503, headers: {}, body: '' }) });
    await expect(adapter(http).publish(payload([hero]), 'idem-1')).rejects.toMatchObject({ permanent: false, httpStatus: 503 });
    expect(calls.some((c) => c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);
  });

  it('a file that cannot be read is OUR permanent failure, and LinkedIn is never called', async () => {
    const { http, calls } = scripted();
    const unreadable = async () => { throw new Error('Stored bytes do not match their key.'); };
    const err = await adapter(http, 'linkedin_member', unreadable).publish(payload([hero]), 'idem-1').then(() => null, (e: ProviderPublishError) => e);
    expect(err).toMatchObject({ permanent: true, providerCode: 'MediaUnreadable' });
    expect(err?.message).toMatch(/do not match their key/);
    expect(calls).toHaveLength(0);
  });

  it('with two images, a failure on the second leaves no post (the first upload is an orphan LinkedIn will expire)', async () => {
    let puts = 0;
    const { http, calls } = scripted({ put: () => { puts += 1; return Promise.resolve(puts === 2 ? { status: 500, headers: {}, body: '' } : { status: 201, headers: {}, body: '' }); } });
    await expect(adapter(http, 'linkedin_organization').publish(payload([hero, second], 'linkedin_organization'), 'idem-1')).rejects.toMatchObject({ permanent: false });
    expect(calls.some((c) => c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);
  });
});

describe('the status check itself failing', () => {
  it('a gateway page on the status GET gets a real error class, not a mangled one', async () => {
    const { http } = scripted({ status: () => Promise.resolve({ status: 502, headers: {}, body: { message: '<html>Bad Gateway</html>' } }) });
    await expect(adapter(http).publish(payload([hero]), 'idem-1')).rejects.toMatchObject({ permanent: false, providerCode: 'ImageStatusCheckFailed', httpStatus: 502 });
  });
});

describe('uploadImages on its own', () => {
  it('returns URNs in attachment order', async () => {
    let n = 0;
    const http: LinkedInHttp = async (c) => {
      if (c.url.endsWith('initializeUpload')) { n += 1; return { status: 200, headers: {}, body: { value: { uploadUrl: UPLOAD_URL, image: `urn:li:image:${n}` } } }; }
      if (c.method === 'PUT') return { status: 201, headers: {}, body: '' };
      return { status: 200, headers: {}, body: { status: 'AVAILABLE' } };
    };
    const out = await uploadImages({ http, token: TOKEN, owner: AUTHOR, apiVersion: LINKEDIN_API_VERSION, media: [hero, second], readMedia: async () => PNG, sleep: async () => undefined });
    expect(out).toEqual([{ urn: 'urn:li:image:1', altText: hero.altText }, { urn: 'urn:li:image:2', altText: null }]);
  });
});
