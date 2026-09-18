import { ProviderPublishError } from './socialProviderAdapter';
import type { PublishMedia } from './socialProviderAdapter';
import { callGraph, graphUrl, graphVideoUrl, type MetaHttp } from './metaGraph';

/**
 * metaPublish - the actual posting, for a Facebook Page and for an Instagram professional
 * account. Kept out of the adapter class so each flow reads as the sequence of calls it is.
 *
 * MEDIA IS PULLED, NOT PUSHED. Unlike LinkedIn, Meta fetches the file itself from a URL we give
 * it. That is what `mediaFetchRoutes` (`/m/...`) exists for: a short-lived signed URL, public
 * because Meta's fetcher carries no session, unguessable and dead within minutes.
 *
 * RETRY SAFETY, because Meta has no idempotency key. The worker retries a publish it could not
 * confirm - a timeout after Meta already accepted the post is exactly that case - and a second
 * POST would put the same words on the Page twice, in public. So each flow LOOKS FIRST: it reads
 * the account's recent posts and, if one carries the identical text inside the window, returns
 * that post instead of creating another. Same shape as the Basecamp rule in CLAUDE.md: check
 * before you POST.
 */

/** How far back a duplicate is looked for. Longer than any retry chain, shorter than a day. */
export const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;
/** How many recent posts to read when looking. A page posting more than this in six hours is not ours. */
const DEDUP_LIMIT = 25;

/** Instagram builds the post asynchronously; this is how long we wait for it. */
export const CONTAINER_POLL_ATTEMPTS = 60;
export const CONTAINER_POLL_INTERVAL_MS = 5_000;

export interface MetaPublishDeps {
  http: MetaHttp;
  /** The Page access token. Resolved per call, never held. */
  token: string;
  /** Facebook Page id, or Instagram professional account id. */
  targetId: string;
  /** A short-lived public URL Meta can fetch, for one stored media key. */
  signedUrlFor: (ref: string) => Promise<string>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface MetaPublishResult {
  externalId: string;
  permalink: string | null;
  /** What was done, for the receipt. Never contains a token or a signed URL. */
  steps: string[];
}

const isImage = (m: PublishMedia) => m.mimeType.startsWith('image/');
const isVideo = (m: PublishMedia) => m.mimeType.startsWith('video/');

async function permalinkOf(deps: MetaPublishDeps, id: string, field: 'permalink_url' | 'permalink'): Promise<string | null> {
  try {
    const body = await callGraph(deps.http, {
      method: 'GET',
      url: `${graphUrl(`/${id}`, deps.env)}?fields=${field}&access_token=${encodeURIComponent(deps.token)}`,
      what: 'the post link',
    });
    return typeof body[field] === 'string' ? body[field] : null;
  } catch {
    // The post exists; only its address could not be read. Losing the receipt's link is worth
    // less than failing a publish that already happened.
    return null;
  }
}

/** A post with this exact text, published within the window. The retry-safety check. */
async function findRecent(
  deps: MetaPublishDeps,
  opts: { path: string; textField: 'message' | 'caption'; timeField: 'created_time' | 'timestamp' },
  text: string,
): Promise<string | null> {
  const url = `${graphUrl(opts.path, deps.env)}?fields=id,${opts.textField},${opts.timeField}`
    + `&limit=${DEDUP_LIMIT}&access_token=${encodeURIComponent(deps.token)}`;
  let body: Record<string, any>;
  try {
    body = await callGraph(deps.http, { method: 'GET', url, what: 'the recent posts' });
  } catch {
    // Cannot look: publish anyway. Refusing here would turn a missing read permission into a
    // post that never goes out, which is the worse of the two failures.
    return null;
  }
  const since = deps.now().getTime() - DEDUP_WINDOW_MS;
  const rows = Array.isArray(body.data) ? body.data : [];
  for (const row of rows) {
    if (typeof row?.id !== 'string' || row[opts.textField] !== text) continue;
    const at = Date.parse(row[opts.timeField] ?? '');
    if (!Number.isNaN(at) && at >= since) return row.id;
  }
  return null;
}

/**
 * Publish to a Facebook Page.
 *
 * One video, or one photo, or several photos, or plain text - in that order of precedence, which
 * matches what the composer's content types allow. The tracked link is already inside `text`
 * (see postText), and Facebook renders its preview card from a URL found there, so no separate
 * `link` parameter is sent: passing both is how a post ends up showing the same URL twice.
 */
export async function publishToFacebookPage(
  content: { text: string; media: PublishMedia[] },
  deps: MetaPublishDeps,
): Promise<MetaPublishResult> {
  const existing = await findRecent(deps, { path: `/${deps.targetId}/feed`, textField: 'message', timeField: 'created_time' }, content.text);
  if (existing) {
    return { externalId: existing, permalink: await permalinkOf(deps, existing, 'permalink_url'), steps: ['found an identical post already on the Page'] };
  }

  const video = content.media.find(isVideo);
  const images = content.media.filter(isImage);
  const steps: string[] = [];

  if (video) {
    const url = await deps.signedUrlFor(video.ref);
    const body = await callGraph(deps.http, {
      method: 'POST',
      url: graphVideoUrl(`/${deps.targetId}/videos`, deps.env),
      form: { file_url: url, description: content.text, access_token: deps.token },
      what: 'the video post',
    });
    const id = String(body.id ?? '');
    if (!id) throw new ProviderPublishError('Facebook accepted the video but returned no id.', false, null, 502);
    steps.push('posted a video');
    return { externalId: id, permalink: await permalinkOf(deps, id, 'permalink_url'), steps };
  }

  if (images.length === 1) {
    const url = await deps.signedUrlFor(images[0].ref);
    const body = await callGraph(deps.http, {
      method: 'POST',
      url: graphUrl(`/${deps.targetId}/photos`, deps.env),
      form: { url, caption: content.text, published: 'true', access_token: deps.token },
      what: 'the photo post',
    });
    // A published photo answers with the photo id AND the post id; the post id is what a
    // permalink and a later deletion need.
    const id = String(body.post_id ?? body.id ?? '');
    if (!id) throw new ProviderPublishError('Facebook accepted the photo but returned no id.', false, null, 502);
    steps.push('posted a photo');
    return { externalId: id, permalink: await permalinkOf(deps, id, 'permalink_url'), steps };
  }

  if (images.length > 1) {
    const ids: string[] = [];
    for (const image of images) {
      const url = await deps.signedUrlFor(image.ref);
      const body = await callGraph(deps.http, {
        method: 'POST',
        url: graphUrl(`/${deps.targetId}/photos`, deps.env),
        // Unpublished: uploaded to the Page but not on it, until the feed post attaches them.
        form: { url, published: 'false', access_token: deps.token },
        what: 'a carousel photo',
      });
      if (!body.id) throw new ProviderPublishError('Facebook accepted a carousel photo but returned no id.', false, null, 502);
      ids.push(String(body.id));
    }
    steps.push(`uploaded ${ids.length} photos`);
    const body = await callGraph(deps.http, {
      method: 'POST',
      url: graphUrl(`/${deps.targetId}/feed`, deps.env),
      form: {
        message: content.text,
        attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))),
        access_token: deps.token,
      },
      what: 'the carousel post',
    });
    const id = String(body.id ?? '');
    if (!id) throw new ProviderPublishError('Facebook accepted the carousel but returned no id.', false, null, 502);
    steps.push('posted the carousel');
    return { externalId: id, permalink: await permalinkOf(deps, id, 'permalink_url'), steps };
  }

  const body = await callGraph(deps.http, {
    method: 'POST',
    url: graphUrl(`/${deps.targetId}/feed`, deps.env),
    form: { message: content.text, access_token: deps.token },
    what: 'the post',
  });
  const id = String(body.id ?? '');
  if (!id) throw new ProviderPublishError('Facebook accepted the post but returned no id.', false, null, 502);
  steps.push('posted text');
  return { externalId: id, permalink: await permalinkOf(deps, id, 'permalink_url'), steps };
}

/** Wait for a media container to finish building. ERROR and EXPIRED are permanent. */
async function awaitContainer(deps: MetaPublishDeps, containerId: string): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
    const body = await callGraph(deps.http, {
      method: 'GET',
      url: `${graphUrl(`/${containerId}`, deps.env)}?fields=status_code,status&access_token=${encodeURIComponent(deps.token)}`,
      what: 'the media status',
    });
    const status = String(body.status_code ?? '');
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new ProviderPublishError(
        `Instagram could not process the media (${status}): ${body.status ?? 'no detail given'}`,
        true,
        status,
        null,
      );
    }
    await deps.sleep(CONTAINER_POLL_INTERVAL_MS);
  }
  // Temporary on purpose: the container may still finish, and the retry's duplicate check will
  // find the post if it did.
  throw new ProviderPublishError(
    `Instagram was still processing the media after ${(CONTAINER_POLL_ATTEMPTS * CONTAINER_POLL_INTERVAL_MS) / 1000}s.`,
    false,
    'container_timeout',
    null,
  );
}

/**
 * Publish to an Instagram professional account: build a container, wait for it, publish it.
 *
 * Instagram has no text-only post, so a draft with no media cannot go here at all - refused
 * permanently rather than retried. Links are not clickable in a caption; the tracked link still
 * travels in the text so the copy matches every other network and the destination is readable.
 */
export async function publishToInstagram(
  content: { text: string; media: PublishMedia[] },
  deps: MetaPublishDeps,
): Promise<MetaPublishResult> {
  const images = content.media.filter(isImage);
  const video = content.media.find(isVideo);
  if (!video && images.length === 0) {
    throw new ProviderPublishError(
      'Instagram has no text-only post. Attach an image or a video, or publish this one by hand.',
      true,
      'no_media',
      null,
    );
  }

  const existing = await findRecent(deps, { path: `/${deps.targetId}/media`, textField: 'caption', timeField: 'timestamp' }, content.text);
  if (existing) {
    return { externalId: existing, permalink: await permalinkOf(deps, existing, 'permalink'), steps: ['found an identical post already on the account'] };
  }

  const steps: string[] = [];
  const createContainer = async (form: Record<string, string>, what: string): Promise<string> => {
    const body = await callGraph(deps.http, {
      method: 'POST',
      url: graphUrl(`/${deps.targetId}/media`, deps.env),
      form: { ...form, access_token: deps.token },
      what,
    });
    const id = String(body.id ?? '');
    if (!id) throw new ProviderPublishError(`Instagram accepted ${what} but returned no container id.`, false, null, 502);
    return id;
  };

  let containerId: string;
  if (video) {
    containerId = await createContainer(
      { media_type: 'REELS', video_url: await deps.signedUrlFor(video.ref), caption: content.text },
      'the video',
    );
    steps.push('created a reel container');
  } else if (images.length === 1) {
    containerId = await createContainer(
      { image_url: await deps.signedUrlFor(images[0].ref), caption: content.text },
      'the image',
    );
    steps.push('created an image container');
  } else {
    const children: string[] = [];
    for (const image of images) {
      children.push(await createContainer(
        { image_url: await deps.signedUrlFor(image.ref), is_carousel_item: 'true' },
        'a carousel image',
      ));
    }
    containerId = await createContainer(
      { media_type: 'CAROUSEL', caption: content.text, children: children.join(',') },
      'the carousel',
    );
    steps.push(`created a carousel of ${children.length}`);
  }

  await awaitContainer(deps, containerId);
  steps.push('media finished processing');

  const body = await callGraph(deps.http, {
    method: 'POST',
    url: graphUrl(`/${deps.targetId}/media_publish`, deps.env),
    form: { creation_id: containerId, access_token: deps.token },
    what: 'the publish',
  });
  const id = String(body.id ?? '');
  if (!id) throw new ProviderPublishError('Instagram published the post but returned no id.', false, null, 502);
  steps.push('published');
  return { externalId: id, permalink: await permalinkOf(deps, id, 'permalink'), steps };
}
