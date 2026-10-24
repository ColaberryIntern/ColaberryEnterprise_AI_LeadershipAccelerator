/**
 * cloudflareStreamProvider — the live half of the playback-grant contract.
 *
 * Replay serves MP4 bytes off our own disk through `/bm/` (broadcastMediaRoutes). Live cannot:
 * the bytes never touch this server. Cloudflare packages the HLS and serves it from its own
 * edge, so the only thing we control is WHO MAY FETCH IT AND FOR HOW LONG. That is exactly
 * what this file does, and nothing else.
 *
 * THE CONTRACT IS UNCHANGED, DELIBERATELY. `computeGrantExpiry` in broadcastPlaybackGrant.ts
 * still decides the instant a viewer's access ends — the preview deadline, not the TTL, when
 * the two disagree. This module takes that instant as an INPUT and mints a Cloudflare token
 * whose `exp` is the same instant. So the 900-second preview rule is enforced on live media
 * by the same arithmetic that enforces it on replay, and there is no second place where a
 * deadline could drift.
 *
 * WHY LOCAL SIGNING AND NOT THE /token ENDPOINT. Cloudflare offers two ways to mint a signed
 * playback token. Its own documentation (securing-your-stream, accessed 2026-10-12) says the
 * `POST /accounts/{id}/stream/{uid}/token` endpoint is "recommended for testing purposes or if
 * you are generating less than 1,000 tokens per day" and "is subject to rate limiting", and
 * recommends a signing key "if you have thousands of daily users". Our grant TTL is 120
 * seconds, so one viewer needs ~30 tokens an hour; the 1,000-viewer planning scenario in the
 * request is ~30,000 an hour. The endpoint is not merely slower, it is the wrong order of
 * magnitude — and a network round trip inside the grant path would also put a Cloudflare
 * outage between a viewer and a video they have already paid for. Signing is local, offline
 * and synchronous. The same docs page also leaves it undocumented whether that endpoint even
 * accepts a LIVE INPUT uid, which settles it.
 *
 * THE TOKEN GOES IN THE PATH, NOT A QUERY PARAMETER. Cloudflare's signed URL replaces the
 * video/input id with the JWT: `https://customer-<code>.cloudflarestream.com/<JWT>/manifest/
 * video.m3u8`. This is stated three times in the docs and it is why `assertSafeUid` and
 * `assertSafeSubdomain` exist below — anything interpolated into that URL is a path segment,
 * so an unvalidated env var or uid is a URL-shaped injection, not a cosmetic bug.
 *
 * FAIL CLOSED, EVERY PATH. There is no branch in this file that returns a playable URL when
 * something is missing or malformed. Not a degraded URL, not an unsigned one, not a
 * longer-lived one. request §7 forbids concealing a gap behind "a public unlisted URL", and a
 * fallback is precisely how that happens — so a missing credential, a bad uid, a bad
 * subdomain, an expiry in the past and an expiry beyond Cloudflare's own 24-hour ceiling all
 * throw. The tests named in the PR body prove each one by reversing it.
 *
 * Nothing here logs the API token, the signing key or a minted JWT. `log()` takes a fixed
 * field shape for the same reason githubRepoClient's does: a spread is how a credential ends
 * up in a log line.
 */
import jwt from 'jsonwebtoken';
import type { SignedPlayback } from '../broadcastPlaybackGrant';

/** Bounded, like every outbound call in this repo. Cloudflare is not on the grant path. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Cloudflare's own ceiling: "Cannot be greater than 24 hours in the future". */
export const CLOUDFLARE_MAX_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type CloudflareErrorClass =
  | 'ConfigMissing'
  | 'InvalidInput'
  | 'Unauthorized'
  | 'NotFound'
  | 'RateLimited'
  | 'Timeout'
  | 'MalformedResponse'
  | 'UpstreamUnavailable';

export class CloudflareStreamError extends Error {
  constructor(readonly error_class: CloudflareErrorClass, message: string) {
    super(message);
    this.name = 'CloudflareStreamError';
  }
}

/**
 * FIVE credentials, not the three the ticket named. The extra two are the signing key, and
 * they exist because of the volume finding above — they are minted from the same account with
 * the same API token via `createSigningKey()` below, so this is not a new dependency, it is
 * the documented way to use the one already approved.
 */
export interface CloudflareStreamConfig {
  accountId: string;
  /** `customer-<code>`, the delivery host prefix shown on the Stream dashboard page. */
  subdomain: string;
  apiToken: string;
  signingKeyId: string;
  /** PEM text, already decoded from the base64 Cloudflare hands back. */
  signingKeyPem: string;
}

const UID_PATTERN = /^[0-9a-f]{32}$/;
const SUBDOMAIN_PATTERN = /^customer-[a-z0-9]{1,40}$/;

function assertSafeUid(uid: string): string {
  if (!UID_PATTERN.test(uid)) {
    // Never echo the value: it arrives from the database and an error string is a log line.
    throw new CloudflareStreamError('InvalidInput', 'Not a Cloudflare Stream uid.');
  }
  return uid;
}

function assertSafeSubdomain(subdomain: string): string {
  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    throw new CloudflareStreamError('ConfigMissing', 'CLOUDFLARE_STREAM_SUBDOMAIN is not a customer subdomain.');
  }
  return subdomain;
}

/**
 * Cloudflare returns the signing key base64-encoded ("you must decode them before using
 * them"). An operator who decodes it by hand before setting the env var produces valid PEM
 * text, which is the likelier mistake of the two and is unambiguous to detect — a PEM always
 * starts with the armour line, and base64 of a PEM never does. Both are accepted; anything
 * else is refused rather than guessed at.
 */
export function decodeSigningKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-----BEGIN')) return trimmed;
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
  if (decoded.startsWith('-----BEGIN')) return decoded;
  throw new CloudflareStreamError('ConfigMissing', 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM is neither PEM nor base64 PEM.');
}

/**
 * Returns null when ANY credential is absent — not a partial config. A partially configured
 * provider is the state in which a caller is most likely to believe it works.
 */
export function readCloudflareStreamConfig(env: NodeJS.ProcessEnv = process.env): CloudflareStreamConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const subdomain = env.CLOUDFLARE_STREAM_SUBDOMAIN?.trim();
  const apiToken = env.CLOUDFLARE_STREAM_TOKEN?.trim();
  const signingKeyId = env.CLOUDFLARE_STREAM_SIGNING_KEY_ID?.trim();
  const signingKeyPem = env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM?.trim();
  if (!accountId || !subdomain || !apiToken || !signingKeyId || !signingKeyPem) return null;
  return { accountId, subdomain, apiToken, signingKeyId, signingKeyPem: decodeSigningKey(signingKeyPem) };
}

function requireConfig(config: CloudflareStreamConfig | null): CloudflareStreamConfig {
  if (!config) {
    throw new CloudflareStreamError('ConfigMissing', 'Cloudflare Stream is not configured; live playback is unavailable.');
  }
  return config;
}

function log(event: string, outcome: 'success' | 'failure', ctx: {
  uid?: string; status?: number; error_class?: string; duration_ms?: number; correlation_id?: string;
}): void {
  // Fixed field list. No spread — that is how a bearer token reaches a log.
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'broadcast-cloudflare',
    event,
    outcome,
    context: ctx,
  }));
}

export interface CloudflareCallOptions {
  /** Injected in tests. Production uses global fetch. */
  fetchImpl?: typeof fetch;
  correlationId?: string;
  config?: CloudflareStreamConfig | null;
  nowMs?: number;
}

/** Cloudflare's envelope: `{ success, errors: [{code, message}], messages: [], result }`. */
interface CloudflareEnvelope<T> {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
}

/**
 * One bounded, classified API call. The caller never sees a status code, it sees a class —
 * `Unauthorized` and `NotFound` mean completely different things to the producer standing in
 * the Studio, and only one of them is fixable from there.
 *
 * NOT RETRIED. Every caller is either on an interactive producer action or inside a grant
 * request; a retry loop there turns a Cloudflare blip into a hung request. Retry belongs to
 * the caller that can afford to wait, which is none of them today.
 */
async function callApi<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body: unknown,
  opts: CloudflareCallOptions,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const config = requireConfig(opts.config === undefined ? readCloudflareStreamConfig() : opts.config);
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}${path}`;
  const started = Date.now();

  let res: Response;
  try {
    res = await doFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // An abort and a DNS failure are different problems with the same remedy from here, but
    // they are classified apart so the logs can tell a slow Cloudflare from an unreachable one.
    const aborted = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
    const error_class: CloudflareErrorClass = aborted ? 'Timeout' : 'UpstreamUnavailable';
    log('cloudflare_call_failed', 'failure', { error_class, duration_ms: Date.now() - started, correlation_id: opts.correlationId });
    throw new CloudflareStreamError(error_class, aborted ? 'Cloudflare did not respond in time.' : 'Cloudflare is unreachable.');
  }

  const duration_ms = Date.now() - started;
  if (!res.ok) {
    const error_class: CloudflareErrorClass = res.status === 401 || res.status === 403
      ? 'Unauthorized'
      : res.status === 404 ? 'NotFound'
        : res.status === 429 ? 'RateLimited'
          : 'UpstreamUnavailable';
    log('cloudflare_call_failed', 'failure', { status: res.status, error_class, duration_ms, correlation_id: opts.correlationId });
    // The upstream body is deliberately not surfaced: it can carry account detail, and this
    // message reaches a producer's screen.
    throw new CloudflareStreamError(error_class, `Cloudflare refused the request (${error_class}).`);
  }

  let envelope: CloudflareEnvelope<T>;
  try {
    envelope = (await res.json()) as CloudflareEnvelope<T>;
  } catch {
    log('cloudflare_call_failed', 'failure', { status: res.status, error_class: 'MalformedResponse', duration_ms, correlation_id: opts.correlationId });
    throw new CloudflareStreamError('MalformedResponse', 'Cloudflare returned a response this server could not read.');
  }

  // A 200 with `success: false` is a real Cloudflare shape, and treating it as a success is
  // how a null result becomes a crash three lines later.
  if (envelope?.success !== true || envelope.result === undefined || envelope.result === null) {
    log('cloudflare_call_failed', 'failure', { status: res.status, error_class: 'MalformedResponse', duration_ms, correlation_id: opts.correlationId });
    throw new CloudflareStreamError('MalformedResponse', 'Cloudflare returned a response this server could not read.');
  }

  log('cloudflare_call', 'success', { status: res.status, duration_ms, correlation_id: opts.correlationId });
  return envelope.result;
}

/* ──────────────────────────────────────────────────────────────────── live inputs ─ */

export interface LiveInput {
  uid: string;
  rtmpsUrl: string;
  rtmpsStreamKey: string;
  requireSignedURLs: boolean;
  /** Cloudflare's connection-status enum, or null for an input that has never been used. */
  status: string | null;
}

interface RawLiveInput {
  uid?: unknown;
  rtmps?: { url?: unknown; streamKey?: unknown };
  recording?: { requireSignedURLs?: unknown };
  status?: unknown;
}

/**
 * Shape-check rather than trust. A field that silently becomes undefined here resurfaces as
 * `rtmps://undefined` in a producer's Zoom configuration, which fails at airtime instead of
 * at the API call.
 */
function toLiveInput(raw: RawLiveInput): LiveInput {
  const uid = typeof raw?.uid === 'string' ? raw.uid : '';
  const rtmpsUrl = typeof raw?.rtmps?.url === 'string' ? raw.rtmps.url : '';
  const rtmpsStreamKey = typeof raw?.rtmps?.streamKey === 'string' ? raw.rtmps.streamKey : '';
  if (!UID_PATTERN.test(uid) || !rtmpsUrl || !rtmpsStreamKey) {
    throw new CloudflareStreamError('MalformedResponse', 'Cloudflare returned a live input without the fields this server needs.');
  }
  return {
    uid,
    rtmpsUrl,
    rtmpsStreamKey,
    requireSignedURLs: raw?.recording?.requireSignedURLs === true,
    status: typeof raw?.status === 'string' ? raw.status : null,
  };
}

export interface CreateLiveInputRequest {
  /** Shown in the Cloudflare dashboard. `meta` is typed `unknown`; `name` is convention only. */
  name: string;
  /**
   * The occurrence this input belongs to. Used ONLY as the idempotency key, so a retried or
   * double-clicked "create input" does not leave two inputs and one orphan — CLAUDE.md's
   * idempotency rule applies to this call as much as to a database write.
   */
  idempotencyKey: string;
}

/**
 * Create a live input, configured so it is actually playable and actually protected.
 *
 * TWO SETTINGS ARE LOAD-BEARING AND BOTH DEFAULT TO THE WRONG VALUE FOR US:
 *   - `recording.mode` defaults to `off`, and Cloudflare documents that an input in that mode
 *     "will not be recorded or available for playback". Not a recording preference — with the
 *     default, live playback does not work at all.
 *   - `recording.requireSignedURLs` defaults to false, which would make every manifest public
 *     to anyone holding the uid. For a live input this is nested under `recording` and, per
 *     Cloudflare, "takes effect over any video-level settings".
 */
export async function createLiveInput(req: CreateLiveInputRequest, opts: CloudflareCallOptions = {}): Promise<LiveInput> {
  const raw = await callApi<RawLiveInput>(
    'POST',
    '/stream/live_inputs',
    {
      meta: { name: req.name },
      recording: { mode: 'automatic', requireSignedURLs: true },
    },
    opts,
    { 'Idempotency-Key': req.idempotencyKey },
  );
  const input = toLiveInput(raw);
  // Trust the response, not the request: if Cloudflare ever ignores the flag, this is where we
  // find out, rather than discovering it from an unprotected manifest in production.
  if (!input.requireSignedURLs) {
    throw new CloudflareStreamError('MalformedResponse', 'Cloudflare created an input without signed-URL protection.');
  }
  log('cloudflare_live_input_created', 'success', { uid: input.uid, correlation_id: opts.correlationId });
  return input;
}

export async function readLiveInput(uid: string, opts: CloudflareCallOptions = {}): Promise<LiveInput> {
  const safe = assertSafeUid(uid);
  return toLiveInput(await callApi<RawLiveInput>('GET', `/stream/live_inputs/${safe}`, undefined, opts));
}

/**
 * The state of a RECORDING, as opposed to a live input (L8.4).
 *
 * Returns Cloudflare's raw `status.state` string rather than a narrowed enum, because the
 * narrowing is a rule and rules in this subsystem live in pure policy files that can be
 * argued with in a test. `broadcastReplayPolicy.narrowRecordingState` owns that mapping,
 * including what to do with a value Cloudflare has not documented yet.
 */
export async function readVideoState(uid: string, opts: CloudflareCallOptions = {}): Promise<string | null> {
  const safe = assertSafeUid(uid);
  const raw = await callApi<{ status?: { state?: unknown } }>('GET', `/stream/${safe}`, undefined, opts);
  const state = raw && raw.status ? raw.status.state : null;
  return typeof state === 'string' ? state : null;
}

export interface LiveLifecycle {
  live: boolean;
  /** A NEW video uid per broadcast; null while the input is idle. */
  videoUid: string | null;
}

/**
 * Is this input receiving video RIGHT NOW?
 *
 * Deliberately not `readLiveInput().status`. That enum (`connected`, `reconnecting`,
 * `client_disconnect`, `ttl_exceeded`, …) describes the ingest connection's history and has no
 * `live` member at all; Cloudflare's documented answer to "is it streaming" is this endpoint's
 * boolean. It lives on the DELIVERY domain, not the API domain, which is why it does not go
 * through `callApi`.
 *
 * This is the fact `provider_health` is folded from — and per broadcastStateMachine, a provider
 * event may change health freely but never publishes content on its own.
 */
/** `status.state` on a per-broadcast video while it is still being received. */
const LIVE_IN_PROGRESS = 'live-inprogress';

interface RawLiveVideo {
  uid?: unknown;
  status?: { state?: unknown };
}

/**
 * WHY THIS NO LONGER CALLS `/lifecycle`.
 *
 * It used to, on the delivery domain, exactly as Cloudflare's own documentation shows. During
 * the first production airing (15 Oct 2026) that endpoint returned **401 Unauthorized** the
 * moment the input was actually broadcasting with `requireSignedURLs` on — while answering
 * perfectly a few minutes earlier when the same input was idle. Cloudflare documents nothing
 * about this; the L5.1 research flagged it as an open question and the airing answered it.
 *
 * The failure mode was the dangerous kind: a healthy, broadcasting input reported as not
 * ready, which makes the state machine refuse `go_live` on a class that is airing perfectly
 * well. An outage reading as "nothing is live".
 *
 * So readiness now comes from the API domain, which authenticates with the API token and
 * worked throughout the airing. Two things are deliberately NOT used:
 *   - `/lifecycle`, for the reason above.
 *   - the live input's own `status` field, which stayed **null** for the entire broadcast and
 *     is therefore not a readiness signal at all, whatever its name suggests.
 *
 * `GET /live_inputs/{uid}/videos` is documented only in Cloudflare's guide, not its API
 * reference, so the response is shape-checked rather than trusted.
 */
export async function readLiveLifecycle(uid: string, opts: CloudflareCallOptions = {}): Promise<LiveLifecycle> {
  const safe = assertSafeUid(uid);
  const result = await callApi<unknown>('GET', `/stream/live_inputs/${safe}/videos`, undefined, opts);

  // A live input with no broadcasts yet returns an empty list. That is "not live", not an error.
  const list: RawLiveVideo[] = Array.isArray(result) ? (result as RawLiveVideo[]) : [];
  const first = list[0];

  // Only the documented in-progress state counts as live. Anything else — `ready` (a finished
  // recording), `not-started`, `not-found`, an absent status, a non-string — is NOT live.
  // The safe direction for an unreadable answer is "not ready", because the state machine
  // refuses go_live on an unready provider and a wrong "ready" would publish backstage content.
  const live = first?.status?.state === LIVE_IN_PROGRESS;
  const rawUid = first?.uid;
  return {
    live,
    // The per-broadcast video uid, and only while that broadcast is actually live. Returning
    // the uid of a finished recording would invite a caller to treat a replay as a stream.
    videoUid: live && typeof rawUid === 'string' && UID_PATTERN.test(rawUid) ? rawUid : null,
  };
}

/* ───────────────────────────────────────────────────────────────── signing keys ─ */

export interface StreamSigningKey {
  id: string;
  /** base64-encoded PEM, exactly as Cloudflare returns it. Shown once, never again. */
  pem: string;
}

/**
 * Mint the RSA signing key the token path needs. Called ONCE by an operator, never on a
 * request path — the result goes into the environment as CLOUDFLARE_STREAM_SIGNING_KEY_ID and
 * CLOUDFLARE_STREAM_SIGNING_KEY_PEM. Cloudflare shows the key material exactly once.
 *
 * Returned, never logged. The caller is responsible for putting it somewhere safe, and the
 * log line below carries the id only.
 */
export async function createSigningKey(opts: CloudflareCallOptions = {}): Promise<StreamSigningKey> {
  const raw = await callApi<{ id?: unknown; pem?: unknown }>('POST', '/stream/keys', {}, opts);
  const id = typeof raw?.id === 'string' ? raw.id : '';
  const pem = typeof raw?.pem === 'string' ? raw.pem : '';
  if (!id || !pem) throw new CloudflareStreamError('MalformedResponse', 'Cloudflare returned a signing key without id or pem.');
  log('cloudflare_signing_key_created', 'success', { uid: id, correlation_id: opts.correlationId });
  return { id, pem };
}

/* ─────────────────────────────────────────────────────────── signed live playback ─ */

/**
 * Convert an ALREADY-DECIDED expiry into a signed Cloudflare HLS url, in the grant shape the
 * player already understands.
 *
 * `expiresAtMs` is not this function's decision. It comes from `computeGrantExpiry`, which
 * applies the preview deadline, and passing it in rather than recomputing it here is the
 * reason the preview rule cannot drift between the two media paths.
 *
 * `exp` IS IN SECONDS AND IS FLOORED. Cloudflare's claim is a unix epoch in seconds; our
 * contract works in milliseconds. Floor is the safe direction — it can only move the deadline
 * EARLIER, by under a second. Ceiling would hand a preview viewer up to 999ms past the
 * deadline the rest of the system enforces to the millisecond, which is a small number and
 * exactly the wrong kind of small number. The test that pins this is named in the PR body.
 *
 * Synchronous and offline: no network call, so a Cloudflare API outage cannot stop a viewer
 * who is already entitled from renewing.
 */
export function signLivePlayback(
  liveInputUid: string,
  expiresAtMs: number,
  nowMs: number = Date.now(),
  config: CloudflareStreamConfig | null = readCloudflareStreamConfig(),
): SignedPlayback {
  const cfg = requireConfig(config);
  const uid = assertSafeUid(liveInputUid);
  const host = assertSafeSubdomain(cfg.subdomain);

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    throw new CloudflareStreamError('InvalidInput', 'The playback window has already closed.');
  }
  // Cloudflare refuses an `exp` more than 24 hours out. Our grant is 120 seconds, so reaching
  // this means a caller computed an expiry some other way — refuse rather than let Cloudflare
  // decide what our paywall means.
  if (expiresAtMs - nowMs > CLOUDFLARE_MAX_TOKEN_LIFETIME_MS) {
    throw new CloudflareStreamError('InvalidInput', 'The requested playback window exceeds the provider maximum.');
  }

  const token = jwt.sign(
    {
      sub: uid,
      kid: cfg.signingKeyId,
      exp: Math.floor(expiresAtMs / 1000),
      nbf: Math.floor(nowMs / 1000),
    },
    cfg.signingKeyPem,
    { algorithm: 'RS256', header: { alg: 'RS256', kid: cfg.signingKeyId } },
  );

  return {
    // The token REPLACES the uid in the path — Cloudflare's signed-url shape, not a query
    // parameter. The uid itself never appears in a url handed to a browser.
    url: `https://${host}.cloudflarestream.com/${token}/manifest/video.m3u8`,
    expiresAt: expiresAtMs,
    // Floor, matching signPlayback: a client must never round past the deadline.
    ttlSeconds: Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000)),
  };
}
