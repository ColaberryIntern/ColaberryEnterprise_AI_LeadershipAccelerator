import type { LinkedInHttp } from './linkedInHttp';
import { isPermanentStatus, messageOf, providerCodeOf } from './linkedInErrors';
import { ProviderPublishError, type PublishMedia } from './socialProviderAdapter';

/**
 * LinkedIn's Images API: the three steps between "bytes on our disk" and "an image URN a post
 * can reference". Kept apart from the adapter because the adapter's job is the post, and this
 * is a transfer with its own failure modes.
 *
 *   1. `POST /rest/images?action=initializeUpload` with the OWNER (the author URN). LinkedIn
 *      answers with a one-time upload URL and the image's future URN. The owner is what ties
 *      the image to the member or organization; a mismatch with the post's author is a 403 on
 *      step three, after the bytes have already been sent.
 *   2. `PUT <uploadUrl>` with the raw bytes. Not JSON, not multipart: the body IS the file. The
 *      bearer token goes with it. The URL is on a different host (dms-uploads) and expires.
 *   3. Processing is asynchronous. `GET /rest/images/{urn}` reports PROCESSING, AVAILABLE or
 *      PROCESSING_FAILED, and a post that references an image before it is AVAILABLE is refused.
 *      So the upload waits, briefly and boundedly, and hands back only URNs it has seen become
 *      AVAILABLE. Still PROCESSING after the budget is a transient failure: the worker's retry
 *      re-runs all three steps, and an orphaned upload on LinkedIn's side costs nothing.
 *
 * DOCUMENTS (PDF, the swipeable carousel post) use the same three steps against
 * `/rest/documents`, with the URN under `document` instead of `image`. One code path, one
 * table of the two differences, so a fix to the image flow is a fix to the document flow.
 *
 * What is NOT here: video. LinkedIn's Videos API is a different, chunked protocol
 * (initialize with a byte count, upload parts, finalize with ETags) and lives in
 * linkedInVideo.ts, which shares `restHeaders` and `refuse` from here.
 */

export type UploadKind = 'image' | 'document';

/** The two things that differ between the Images API and the Documents API. */
const API: Record<UploadKind, { url: string; urnField: 'image' | 'document'; codePrefix: string }> = {
  image: { url: 'https://api.linkedin.com/rest/images', urnField: 'image', codePrefix: 'Image' },
  document: { url: 'https://api.linkedin.com/rest/documents', urnField: 'document', codePrefix: 'Document' },
};

/** Bytes to LinkedIn's upload host are a transfer, not an API call: a longer budget than the 20 s default. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** How long to wait for LinkedIn to finish processing an image before giving up on this attempt. */
export const PROCESSING_POLL = { attempts: 6, intervalMs: 1_500 } as const;

export const LINKEDIN_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif']);
export const LINKEDIN_DOCUMENT_MIME_TYPES: ReadonlySet<string> = new Set(['application/pdf']);

export interface UploadedImage {
  urn: string;
  altText: string | null;
}

export interface UploadImagesInput {
  http: LinkedInHttp;
  token: string;
  /** The post's author; the image's owner must be the same principal. */
  owner: string;
  apiVersion: string;
  media: PublishMedia[];
  readMedia: (ref: string) => Promise<Buffer>;
  sleep: (ms: number) => Promise<void>;
}

export function restHeaders(token: string, apiVersion: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': apiVersion,
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

/**
 * `fallbackCode` is the dead-letter reason when LinkedIn's body carries no code of its own (a
 * gateway page, an empty 502); `noun` names what was being sent, so a video's dead-letter row
 * does not say "image".
 */
export function refuse(step: string, fallbackCode: string, status: number, body: unknown, ref: string, noun: UploadKind | 'video' = 'image'): never {
  throw new ProviderPublishError(
    messageOf(body, `LinkedIn refused the ${noun} ${step} for ${ref} (HTTP ${status}).`),
    isPermanentStatus(status),
    providerCodeOf(body) ?? fallbackCode,
    status,
  );
}

/** Upload every attachment, in order, and return URNs that LinkedIn has confirmed AVAILABLE. */
export async function uploadImages(input: UploadImagesInput): Promise<UploadedImage[]> {
  const out: UploadedImage[] = [];
  for (const item of input.media) out.push(await uploadOne(input, item, 'image'));
  return out;
}

/** The document post carries exactly one PDF; `altText` is what the operator typed as its title. */
export async function uploadDocument(input: UploadImagesInput, item: PublishMedia): Promise<UploadedImage> {
  return uploadOne(input, item, 'document');
}

async function uploadOne(input: UploadImagesInput, item: PublishMedia, kind: UploadKind): Promise<UploadedImage> {
  const api = API[kind];
  const { http, token, owner, apiVersion, readMedia, sleep } = input;

  // Read first: a missing or corrupt file is our defect, not LinkedIn's, and it is permanent.
  // Reading before initializeUpload also means a failure here leaves nothing behind on their
  // side.
  let bytes: Buffer;
  try {
    bytes = await readMedia(item.ref);
  } catch (err) {
    throw new ProviderPublishError(
      `The attached file ${item.ref} could not be read (${(err as Error)?.message ?? err}). The post cannot publish with it.`,
      true,
      'MediaUnreadable',
      null,
    );
  }

  // Step 1: initialize.
  const init = await http({
    method: 'POST',
    url: `${api.url}?action=initializeUpload`,
    headers: restHeaders(token, apiVersion),
    body: { initializeUploadRequest: { owner } },
  });
  if (init.status >= 400) refuse('initialize', `${api.codePrefix}InitializeFailed`, init.status, init.body, item.ref, kind);
  const value = (init.body as { value?: Record<string, unknown> } | null)?.value;
  const uploadUrl = typeof value?.uploadUrl === 'string' ? value.uploadUrl : null;
  const urn = typeof value?.[api.urnField] === 'string' ? (value[api.urnField] as string) : null;
  if (!uploadUrl || !urn) {
    // A 200 without the two fields is a contract change on their side. Permanent: retrying
    // sends the same request to the same API.
    throw new ProviderPublishError(
      `LinkedIn's initializeUpload response for ${item.ref} had no uploadUrl or ${api.urnField} URN.`,
      true,
      `${api.codePrefix}InitializeMalformed`,
      init.status,
    );
  }

  // Step 2: the bytes. A raw PUT, bearer token, no JSON, no REST headers.
  const put = await http({
    method: 'PUT',
    url: uploadUrl,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: bytes,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
  if (put.status >= 400) refuse('upload', `${api.codePrefix}UploadFailed`, put.status, put.body, item.ref, kind);

  // Step 3: wait for AVAILABLE, boundedly.
  const statusUrl = `${api.url}/${encodeURIComponent(urn)}`;
  for (let attempt = 1; attempt <= PROCESSING_POLL.attempts; attempt += 1) {
    const check = await http({ method: 'GET', url: statusUrl, headers: restHeaders(token, apiVersion) });
    if (check.status >= 400) refuse('status check', `${api.codePrefix}StatusCheckFailed`, check.status, check.body, item.ref, kind);
    const status = (check.body as { status?: unknown } | null)?.status;
    if (status === 'AVAILABLE') return { urn, altText: item.altText };
    if (status === 'PROCESSING_FAILED') {
      throw new ProviderPublishError(
        kind === 'image'
          ? `LinkedIn could not process the image ${item.ref}. Re-export it (PNG or JPEG, under 8 MB) and attach it again.`
          : `LinkedIn could not process the document ${item.ref}. Re-export it as a PDF under 100 MB and 300 pages and attach it again.`,
        true,
        `${api.codePrefix}ProcessingFailed`,
        check.status,
      );
    }
    if (attempt < PROCESSING_POLL.attempts) await sleep(PROCESSING_POLL.intervalMs);
  }
  throw new ProviderPublishError(
    `LinkedIn was still processing the ${kind} ${item.ref} after ${PROCESSING_POLL.attempts} checks. The post will be retried.`,
    false,
    `${api.codePrefix}StillProcessing`,
    null,
  );
}
