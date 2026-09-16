import type { LinkedInHttp } from './linkedInHttp';
import { headerValue } from './linkedInErrors';
import { refuse, restHeaders, UPLOAD_TIMEOUT_MS, type UploadedImage, type UploadImagesInput } from './linkedInImages';
import { ProviderPublishError, type PublishMedia } from './socialProviderAdapter';

/**
 * LinkedIn's Videos API: a different protocol from images, which is why the adapter refused
 * video until now rather than pretending the image steps would do.
 *
 *   1. `POST /rest/videos?action=initializeUpload` with the owner AND the byte count. LinkedIn
 *      answers with the video URN and a list of UPLOAD INSTRUCTIONS: one pre-signed URL per
 *      part, each with the byte range it wants (parts are ~4 MB; the last is shorter).
 *   2. `PUT` each part's bytes to its URL. Every response carries an `ETag` header; those are
 *      the receipts. A part with no ETag cannot be finalised, so it is a failure at this step,
 *      not a mystery at the next.
 *   3. `POST /rest/videos?action=finalizeUpload` with the URN, the upload token, and the ETags
 *      IN PART ORDER. Out of order is a corrupt video, accepted with a 200.
 *   4. Processing is asynchronous and slower than images: transcoding a 200 MB file takes
 *      real time. `GET /rest/videos/{urn}` reports PROCESSING, AVAILABLE, PROCESSING_FAILED or
 *      WAITING_UPLOAD. The wait here is longer than the image wait and still bounded; past it,
 *      the attempt fails TRANSIENT and the worker's retry re-runs all four steps. Re-uploading
 *      200 MB on a retry is the honest cost of not guessing; an orphaned upload on LinkedIn's
 *      side costs nothing.
 *
 * The post then references the video as `content.media { id, title }`, like a document.
 *
 * Memory: the whole file is read into a Buffer and sliced per part. That is the store's
 * contract today (the same 200 MB in-memory note as the upload route); a streaming read is the
 * follow-up if video becomes routine.
 */

const VIDEOS_URL = 'https://api.linkedin.com/rest/videos';

/** Longer than images: transcoding is real work. 20 checks 3 s apart = 60 s per attempt. */
export const VIDEO_PROCESSING_POLL = { attempts: 20, intervalMs: 3_000 } as const;

export const LINKEDIN_VIDEO_MIME_TYPES: ReadonlySet<string> = new Set(['video/mp4']);

interface UploadInstruction { uploadUrl: string; firstByte: number; lastByte: number }

function parseInstructions(value: unknown, byteSize: number): UploadInstruction[] | null {
  const raw = (value as { uploadInstructions?: unknown } | null)?.uploadInstructions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: UploadInstruction[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    if (typeof r?.uploadUrl !== 'string' || !Number.isInteger(r.firstByte) || !Number.isInteger(r.lastByte)) return null;
    // Narrowed above; TypeScript does not follow Number.isInteger.
    if (typeof r.firstByte !== 'number' || typeof r.lastByte !== 'number') return null;
    if (r.firstByte < 0 || r.lastByte < r.firstByte || r.lastByte >= byteSize) return null;
    out.push({ uploadUrl: r.uploadUrl, firstByte: r.firstByte, lastByte: r.lastByte });
  }
  // Contiguous from 0 to the end, or the parts do not describe this file.
  out.sort((a, b) => a.firstByte - b.firstByte);
  let expect = 0;
  for (const p of out) { if (p.firstByte !== expect) return null; expect = p.lastByte + 1; }
  return expect === byteSize ? out : null;
}

export async function uploadVideo(input: UploadImagesInput, item: PublishMedia): Promise<UploadedImage> {
  const { http, token, owner, apiVersion, readMedia, sleep } = input;

  let bytes: Buffer;
  try {
    bytes = await readMedia(item.ref);
  } catch (err) {
    throw new ProviderPublishError(
      `The attached video ${item.ref} could not be read (${(err as Error)?.message ?? err}). The post cannot publish with it.`,
      true, 'MediaUnreadable', null,
    );
  }

  // Step 1: initialize, with the size - LinkedIn plans the parts from it.
  const init = await http({
    method: 'POST',
    url: `${VIDEOS_URL}?action=initializeUpload`,
    headers: restHeaders(token, apiVersion),
    body: { initializeUploadRequest: { owner, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } },
  });
  if (init.status >= 400) refuse('initialize', 'VideoInitializeFailed', init.status, init.body, item.ref, 'video');
  const value = (init.body as { value?: Record<string, unknown> } | null)?.value;
  const urn = typeof value?.video === 'string' ? value.video : null;
  const uploadToken = typeof value?.uploadToken === 'string' ? value.uploadToken : '';
  const parts = parseInstructions(value, bytes.length);
  if (!urn || !parts) {
    throw new ProviderPublishError(
      `LinkedIn's video initializeUpload response for ${item.ref} had no video URN or no usable upload instructions for ${bytes.length} bytes.`,
      true, 'VideoInitializeMalformed', init.status,
    );
  }

  // Step 2: the parts, in order, collecting ETags.
  const etags: string[] = [];
  for (const [i, part] of parts.entries()) {
    const put = await http({
      method: 'PUT',
      url: part.uploadUrl,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: bytes.subarray(part.firstByte, part.lastByte + 1),
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
    if (put.status >= 400) refuse(`upload of part ${i + 1}/${parts.length}`, 'VideoUploadFailed', put.status, put.body, item.ref, 'video');
    const etag = headerValue(put.headers, 'etag');
    if (!etag) {
      throw new ProviderPublishError(
        `LinkedIn accepted part ${i + 1}/${parts.length} of ${item.ref} but returned no ETag, so the upload cannot be finalised.`,
        true, 'VideoUploadNoEtag', put.status,
      );
    }
    etags.push(etag);
  }

  // Step 3: finalize with the receipts, in part order.
  const fin = await http({
    method: 'POST',
    url: `${VIDEOS_URL}?action=finalizeUpload`,
    headers: restHeaders(token, apiVersion),
    body: { finalizeUploadRequest: { video: urn, uploadToken, uploadedPartIds: etags } },
  });
  if (fin.status >= 400) refuse('finalize', 'VideoFinalizeFailed', fin.status, fin.body, item.ref, 'video');

  // Step 4: wait for AVAILABLE, boundedly.
  const statusUrl = `${VIDEOS_URL}/${encodeURIComponent(urn)}`;
  for (let attempt = 1; attempt <= VIDEO_PROCESSING_POLL.attempts; attempt += 1) {
    const check = await http({ method: 'GET', url: statusUrl, headers: restHeaders(token, apiVersion) });
    if (check.status >= 400) refuse('status check', 'VideoStatusCheckFailed', check.status, check.body, item.ref, 'video');
    const status = (check.body as { status?: unknown } | null)?.status;
    if (status === 'AVAILABLE') return { urn, altText: item.altText };
    if (status === 'PROCESSING_FAILED') {
      throw new ProviderPublishError(
        `LinkedIn could not process the video ${item.ref}. Re-export it as H.264 MP4 (under 200 MB, under 10 minutes) and attach it again.`,
        true, 'VideoProcessingFailed', check.status,
      );
    }
    if (attempt < VIDEO_PROCESSING_POLL.attempts) await sleep(VIDEO_PROCESSING_POLL.intervalMs);
  }
  throw new ProviderPublishError(
    `LinkedIn was still processing the video ${item.ref} after ${VIDEO_PROCESSING_POLL.attempts} checks. The post will be retried.`,
    false, 'VideoStillProcessing', null,
  );
}

export type { LinkedInHttp };
