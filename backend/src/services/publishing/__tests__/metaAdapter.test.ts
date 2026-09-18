import { MetaAdapter } from '../metaAdapter';
import { isPermanentMetaError, metaErrorOf, type MetaHttp, type MetaHttpResponse } from '../metaGraph';
import { DEDUP_WINDOW_MS } from '../metaPublish';
import type { PublishPayload, PublishMedia } from '../socialProviderAdapter';

/**
 * Publishing to a Facebook Page and an Instagram account, against a fake Graph API.
 *
 * Two properties carry the most weight here:
 *
 *   RETRY SAFETY. Meta has no idempotency key, and the worker retries a publish it could not
 *   confirm - a timeout AFTER Meta accepted the post is exactly that. A second POST would put
 *   the same words on the Page twice, in public. The flows look for an identical recent post
 *   first; these tests prove no second POST is made when one is found.
 *
 *   CLASSIFICATION. A failure marked permanent is dead-lettered; one marked temporary is
 *   retried. Backwards in either direction is expensive, so the Meta error codes are pinned.
 */

const NOW = new Date('2026-09-18T15:00:00Z');
const ACCOUNT = 'acct-1';
const PAGE = '1122334455';

interface Call { method: string; url: string; form: Record<string, string> }

function fakeGraph(routes: Array<[RegExp, (call: Call) => MetaHttpResponse]>) {
  const calls: Call[] = [];
  const http: MetaHttp = async ({ method, url, body }) => {
    const form = Object.fromEntries(new URLSearchParams(body ?? '').entries());
    const call = { method, url, form };
    calls.push(call);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new Error(`unexpected ${method} ${url}`);
    return hit[1](call);
  };
  return { http, calls };
}

const ok = (body: unknown) => () => ({ status: 200, body } as MetaHttpResponse);
const posts = (method: 'POST' | 'GET' = 'POST', calls: Call[] = []) => calls.filter((c) => c.method === method);

function adapter(provider: 'meta_facebook_page' | 'meta_instagram', http: MetaHttp) {
  return new MetaAdapter({
    provider,
    getToken: async () => 'page-token',
    getTargetId: async () => PAGE,
    signedUrlFor: async (ref) => `https://www.refactored.ai/m/brand/${ref.split('/').pop()}?e=1&s=sig`,
    http,
    clock: () => NOW,
    sleep: async () => {},
  });
}

function media(over: Partial<PublishMedia> = {}): PublishMedia {
  return { ref: 'media/brand/abc.jpg', mimeType: 'image/jpeg', altText: 'A classroom', byteSize: 500_000, ...over };
}

function payload(over: Partial<PublishPayload> = {}): PublishPayload {
  return {
    jobId: 'job-1', provider: 'meta_facebook_page', contentItemId: 'ci-1', variantId: 'v-1',
    accountId: ACCOUNT, text: 'Free AI class Thursday.', mediaRefs: [], media: [], poll: null,
    linkUrl: null, disclosureText: null, scheduledFor: NOW.toISOString(), contentRevision: 3,
    ...over,
  };
}

/** No recent post matches, so every flow proceeds to publish. */
const NO_DUPLICATES: [RegExp, (c: Call) => MetaHttpResponse] = [/\/(feed|media)\?fields=id/, ok({ data: [] })];
const PERMALINK: [RegExp, (c: Call) => MetaHttpResponse] = [/\?fields=permalink/, ok({ permalink_url: 'https://www.facebook.com/1122334455_999', permalink: 'https://www.instagram.com/p/XYZ/' })];

describe('classifying Meta failures', () => {
  it.each([
    [190, 400, true, 'an expired token will not fix itself'],
    [200, 403, true, 'a missing permission needs a person'],
    [100, 400, true, 'a malformed request repeats identically'],
    [368, 400, true, 'a policy block is not a blip'],
    [220_401, 400, true, 'an Instagram media error describes the file'],
    [4, 400, false, 'an application rate limit passes'],
    [32, 400, false, 'a page rate limit passes'],
    [2, 500, false, 'Meta\'s own temporary failure'],
    [null, 503, false, 'a gateway failure'],
    [null, 429, false, 'a throttle'],
    [null, 404, true, 'a 4xx with no code we know'],
  ])('code %s / HTTP %s -> permanent=%s (%s)', (code, status, expected) => {
    expect(isPermanentMetaError(code as number | null, status as number)).toBe(expected);
  });

  it('reads the trace id, which is what Meta support asks for first', () => {
    const e = metaErrorOf({ error: { message: 'Bad', code: 100, error_subcode: 33, fbtrace_id: 'AbC123' } })!;
    expect(e).toMatchObject({ code: 100, subcode: 33, traceId: 'AbC123' });
  });
});

describe('Facebook Page: what gets posted', () => {
  it('plain text goes to /feed, with the tracked link inside the message and no separate link param', async () => {
    const { http, calls } = fakeGraph([NO_DUPLICATES, [/\/feed$/, ok({ id: '1122334455_999' })], PERMALINK]);
    const receipt = await adapter('meta_facebook_page', http).publish(
      payload({ linkUrl: 'https://refactored.ai/r/7KQ4MZ' }), 'idem-1',
    );
    const post = posts('POST', calls)[0];
    expect(post.url).toContain(`/${PAGE}/feed`);
    expect(post.form.message).toBe('Free AI class Thursday.\n\nhttps://refactored.ai/r/7KQ4MZ');
    // Passing `link` as well is how a post shows the same URL twice; Facebook builds the card
    // from the URL in the message.
    expect(post.form.link).toBeUndefined();
    expect(receipt).toMatchObject({ externalId: '1122334455_999', mode: 'live', permalink: 'https://www.facebook.com/1122334455_999' });
  });

  it('one photo is posted to /photos and the receipt carries the POST id, not the photo id', async () => {
    const { http, calls } = fakeGraph([NO_DUPLICATES, [/\/photos$/, ok({ id: 'photo-1', post_id: '1122334455_777' })], PERMALINK]);
    const receipt = await adapter('meta_facebook_page', http).publish(payload({ media: [media()] }), 'idem-2');
    const post = posts('POST', calls)[0];
    expect(post.url).toContain(`/${PAGE}/photos`);
    expect(post.form.url).toContain('/m/brand/abc.jpg');
    expect(post.form.published).toBe('true');
    // post_id addresses the post; id addresses the photo. A permalink or a delete needs the post.
    expect(receipt.externalId).toBe('1122334455_777');
  });

  it('several photos are uploaded UNPUBLISHED, then attached to one feed post', async () => {
    let n = 0;
    const { http, calls } = fakeGraph([
      NO_DUPLICATES,
      [/\/photos$/, () => ({ status: 200, body: { id: `photo-${(n += 1)}` } })],
      [/\/feed$/, ok({ id: '1122334455_888' })],
      PERMALINK,
    ]);
    await adapter('meta_facebook_page', http).publish(
      payload({ media: [media({ ref: 'media/brand/a.jpg' }), media({ ref: 'media/brand/b.jpg' })] }), 'idem-3',
    );
    const uploads = posts('POST', calls).filter((c) => c.url.includes('/photos'));
    expect(uploads).toHaveLength(2);
    // Published immediately, each would appear as its own post on the Page.
    expect(uploads.every((c) => c.form.published === 'false')).toBe(true);
    const feed = posts('POST', calls).find((c) => c.url.endsWith('/feed'))!;
    expect(JSON.parse(feed.form.attached_media)).toEqual([{ media_fbid: 'photo-1' }, { media_fbid: 'photo-2' }]);
  });

  it('a video goes to the video host with a file URL Meta fetches', async () => {
    const { http, calls } = fakeGraph([NO_DUPLICATES, [/graph-video\./, ok({ id: 'video-1' })], PERMALINK]);
    await adapter('meta_facebook_page', http).publish(
      payload({ media: [media({ ref: 'media/brand/clip.mp4', mimeType: 'video/mp4', byteSize: 20_000_000 })] }), 'idem-4',
    );
    const post = posts('POST', calls)[0];
    expect(post.url).toContain('graph-video.facebook.com');
    expect(post.url).toContain(`/${PAGE}/videos`);
    expect(post.form.file_url).toContain('/m/brand/clip.mp4');
  });
});

describe('Instagram: container, wait, publish', () => {
  it('builds a container, waits for it to finish, then publishes it', async () => {
    const statuses = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'];
    let i = 0;
    const { http, calls } = fakeGraph([
      NO_DUPLICATES,
      [/\/media$/, ok({ id: 'container-1' })],
      [/\/container-1\?fields=status_code/, () => ({ status: 200, body: { status_code: statuses[i++] } })],
      [/\/media_publish$/, ok({ id: 'ig-media-1' })],
      PERMALINK,
    ]);
    const receipt = await adapter('meta_instagram', http).publish(payload({ provider: 'meta_instagram', media: [media()] }), 'idem-5');
    expect(calls.filter((c) => c.url.includes('status_code'))).toHaveLength(3);
    const publish = posts('POST', calls).find((c) => c.url.endsWith('/media_publish'))!;
    expect(publish.form.creation_id).toBe('container-1');
    expect(receipt).toMatchObject({ externalId: 'ig-media-1', permalink: 'https://www.instagram.com/p/XYZ/' });
  });

  it('a video becomes a REELS container', async () => {
    const { http, calls } = fakeGraph([
      NO_DUPLICATES,
      [/\/media$/, ok({ id: 'c-1' })],
      [/status_code/, ok({ status_code: 'FINISHED' })],
      [/\/media_publish$/, ok({ id: 'ig-2' })],
      PERMALINK,
    ]);
    await adapter('meta_instagram', http).publish(
      payload({ provider: 'meta_instagram', media: [media({ ref: 'media/brand/clip.mp4', mimeType: 'video/mp4' })] }), 'idem-6',
    );
    const container = posts('POST', calls)[0];
    expect(container.form.media_type).toBe('REELS');
    expect(container.form.video_url).toContain('/m/brand/clip.mp4');
  });

  it('several images become carousel children then one CAROUSEL parent', async () => {
    let n = 0;
    const { http, calls } = fakeGraph([
      NO_DUPLICATES,
      [/\/media$/, () => ({ status: 200, body: { id: `c-${(n += 1)}` } })],
      [/status_code/, ok({ status_code: 'FINISHED' })],
      [/\/media_publish$/, ok({ id: 'ig-3' })],
      PERMALINK,
    ]);
    await adapter('meta_instagram', http).publish(
      payload({ provider: 'meta_instagram', media: [media({ ref: 'media/brand/a.jpg' }), media({ ref: 'media/brand/b.jpg' })] }), 'idem-7',
    );
    const containers = posts('POST', calls).filter((c) => c.url.endsWith('/media'));
    expect(containers[0].form.is_carousel_item).toBe('true');
    expect(containers[1].form.is_carousel_item).toBe('true');
    expect(containers[2].form).toMatchObject({ media_type: 'CAROUSEL', children: 'c-1,c-2' });
  });

  it('a container that ERRORs is permanent - the file will not become valid on a retry', async () => {
    const { http } = fakeGraph([
      NO_DUPLICATES,
      [/\/media$/, ok({ id: 'c-1' })],
      [/status_code/, ok({ status_code: 'ERROR', status: 'The aspect ratio is not supported.' })],
    ]);
    await expect(adapter('meta_instagram', http).publish(payload({ provider: 'meta_instagram', media: [media()] }), 'idem-8'))
      .rejects.toMatchObject({ permanent: true, message: expect.stringContaining('aspect ratio') });
  });

  it('a container still processing when the wait runs out is TEMPORARY, so the worker retries', async () => {
    const { http } = fakeGraph([
      NO_DUPLICATES,
      [/\/media$/, ok({ id: 'c-1' })],
      [/status_code/, ok({ status_code: 'IN_PROGRESS' })],
    ]);
    await expect(adapter('meta_instagram', http).publish(payload({ provider: 'meta_instagram', media: [media()] }), 'idem-9'))
      .rejects.toMatchObject({ permanent: false, providerCode: 'container_timeout' });
  });
});

describe('retry safety: never post the same thing twice', () => {
  it('an identical post from minutes ago is returned instead of posting again', async () => {
    const { http, calls } = fakeGraph([
      [/\/feed\?fields=id/, ok({ data: [
        { id: 'other', message: 'Something else', created_time: new Date(NOW.getTime() - 60_000).toISOString() },
        { id: '1122334455_555', message: 'Free AI class Thursday.', created_time: new Date(NOW.getTime() - 120_000).toISOString() },
      ] })],
      PERMALINK,
    ]);
    const receipt = await adapter('meta_facebook_page', http).publish(payload(), 'idem-10');
    expect(receipt.externalId).toBe('1122334455_555');
    expect(posts('POST', calls)).toHaveLength(0);
    expect(receipt.requestMetadata.steps).toEqual(['found an identical post already on the Page']);
  });

  it('the same words from OUTSIDE the window are not treated as the same post', async () => {
    const { http, calls } = fakeGraph([
      [/\/feed\?fields=id/, ok({ data: [
        { id: 'old', message: 'Free AI class Thursday.', created_time: new Date(NOW.getTime() - DEDUP_WINDOW_MS - 1000).toISOString() },
      ] })],
      [/\/feed$/, ok({ id: 'new-post' })],
      PERMALINK,
    ]);
    const receipt = await adapter('meta_facebook_page', http).publish(payload(), 'idem-11');
    expect(receipt.externalId).toBe('new-post');
    expect(posts('POST', calls)).toHaveLength(1);
  });

  it('Instagram checks its own recent media the same way', async () => {
    const { http, calls } = fakeGraph([
      [/\/media\?fields=id/, ok({ data: [{ id: 'ig-old', caption: 'Free AI class Thursday.', timestamp: new Date(NOW.getTime() - 60_000).toISOString() }] })],
      PERMALINK,
    ]);
    const receipt = await adapter('meta_instagram', http).publish(payload({ provider: 'meta_instagram', media: [media()] }), 'idem-12');
    expect(receipt.externalId).toBe('ig-old');
    expect(posts('POST', calls)).toHaveLength(0);
  });

  it('when the check itself fails, the post still goes out', async () => {
    // Refusing here would turn a missing read permission into a post that never publishes -
    // the worse of the two failures.
    const { http, calls } = fakeGraph([
      [/\/feed\?fields=id/, () => ({ status: 403, body: { error: { message: 'No permission to read', code: 200 } } })],
      [/\/feed$/, ok({ id: 'published-anyway' })],
      PERMALINK,
    ]);
    const receipt = await adapter('meta_facebook_page', http).publish(payload(), 'idem-13');
    expect(receipt.externalId).toBe('published-anyway');
    expect(posts('POST', calls)).toHaveLength(1);
  });
});

describe('what the receipt carries', () => {
  it('never a token and never a signed URL', async () => {
    const { http } = fakeGraph([NO_DUPLICATES, [/\/photos$/, ok({ post_id: 'p-1' })], PERMALINK]);
    const receipt = await adapter('meta_facebook_page', http).publish(payload({ media: [media()] }), 'idem-14');
    const json = JSON.stringify(receipt);
    expect(json).not.toContain('page-token');
    expect(json).not.toContain('s=sig');
    expect(receipt.requestMetadata).toMatchObject({ provider: 'meta_facebook_page', media_count: 1, idempotency_key: 'idem-14' });
  });

  it('a post with no account connected refuses permanently and calls nothing', async () => {
    const { http, calls } = fakeGraph([]);
    await expect(adapter('meta_facebook_page', http).publish(payload({ accountId: null }), 'idem-15'))
      .rejects.toMatchObject({ permanent: true, providerCode: 'no_account' });
    expect(calls).toHaveLength(0);
  });
});

describe('what validate refuses before anything is sent', () => {
  const fb = () => adapter('meta_facebook_page', fakeGraph([]).http);
  const ig = () => adapter('meta_instagram', fakeGraph([]).http);

  it('Instagram has no text-only post', async () => {
    const r = await ig().validate(payload({ provider: 'meta_instagram' }));
    expect(r).toMatchObject({ ok: false, permanent: true });
    expect((r as { reasons: string[] }).reasons.join(' ')).toMatch(/no text-only post/);
  });

  it('but Facebook does', async () => {
    expect(await fb().validate(payload())).toEqual({ ok: true });
  });

  it('refuses a file type Meta will not take, naming it', async () => {
    const r = await fb().validate(payload({ media: [media({ mimeType: 'application/pdf' })] }));
    expect((r as { reasons: string[] }).reasons.join(' ')).toMatch(/does not accept application\/pdf/);
  });

  it('refuses mixing a video with images, and two videos', async () => {
    const v = media({ ref: 'media/brand/c.mp4', mimeType: 'video/mp4' });
    const mixed = await fb().validate(payload({ media: [v, media()] }));
    expect((mixed as { reasons: string[] }).reasons.join(' ')).toMatch(/cannot mix a video and images/);
    const two = await fb().validate(payload({ media: [v, { ...v, ref: 'media/brand/d.mp4' }] }));
    expect((two as { reasons: string[] }).reasons.join(' ')).toMatch(/takes one video per post/);
  });

  it('measures the caption on what will be SENT, tracked link included', async () => {
    const caps = 2200; // Instagram
    const r = await ig().validate(payload({
      provider: 'meta_instagram',
      media: [media()],
      text: 'x'.repeat(caps - 10),
      linkUrl: 'https://refactored.ai/r/7KQ4MZ',
    }));
    expect((r as { reasons: string[] }).reasons.join(' ')).toMatch(/including the tracked link/);
  });

  it('the image size limit is not applied to video', async () => {
    // The LinkedIn adapter shipped this defect; a 20 MB video must not be refused by an 8 MB
    // image cap.
    const r = await ig().validate(payload({
      provider: 'meta_instagram',
      media: [media({ ref: 'media/brand/clip.mp4', mimeType: 'video/mp4', byteSize: 20 * 1024 * 1024 })],
    }));
    expect(r).toEqual({ ok: true });
  });

  it('refuses a poll, which neither network has', async () => {
    const r = await fb().validate(payload({ poll: { question: 'Which?', options: ['A', 'B'], durationDays: 3 } as never }));
    expect((r as { reasons: string[] }).reasons.join(' ')).toMatch(/does not accept polls/);
  });
});
