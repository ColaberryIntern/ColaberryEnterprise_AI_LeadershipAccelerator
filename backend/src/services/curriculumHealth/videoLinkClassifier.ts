/**
 * videoLinkClassifier — pure decision logic for curriculum video link health.
 *
 * No I/O. Every function here takes already-fetched inputs and returns a verdict,
 * so the whole failure taxonomy is unit-testable without touching the network.
 *
 * WHY TWO METHODS. oEmbed alone cannot tell "healthy" from "public but not
 * embeddable": the 2026-08-21 sweep found `AqGFDPVsG1A` returning oEmbed 401
 * while the video plays perfectly on youtube.com and dies silently in our
 * iframe. The watch-page player probe alone is worse — it is rate-limited, and
 * a throttled response is indistinguishable from a dead video unless something
 * independent corroborates it. So both run, and disagreement resolves to
 * UNKNOWN rather than to a guess.
 *
 * WHY UNKNOWN NEVER ALERTS. A rate limit, a DNS blip or a YouTube markup change
 * must never be reported as a dead video. The 2026-08-21 sweep's first pass
 * invented 6 network failures and 6 HTTP 400s that were nothing but CSV commas
 * inside video titles, and a later pass in this same investigation turned 46
 * healthy videos into "unreachable" purely by probing them too fast. A checker
 * that cries wolf gets muted, and a muted checker is worth less than no checker.
 * Every inconclusive signal therefore lands in UNKNOWN, which is reported but
 * never paged on.
 *
 * WHY A CHALLENGE IS NOT A VERDICT. On 2026-08-22 a dry run over 149 videos
 * reported 149 failures. 146 were provably healthy from an unthrottled
 * workstation minutes later. Every one carried the same detail — "Sign in to
 * confirm you're not a bot" — because YouTube reuses playabilityStatus
 * LOGIN_REQUIRED for BOTH "this video is private" and "we don't believe you are
 * a person", and reuses ERROR the same way. Status alone therefore cannot tell
 * a dead video from a refused question; only the reason text can. That text was
 * being carried as display copy and never read as signal, so a refusal to answer
 * was recorded as an answer, with `actionable: true` on it.
 *
 * The UNKNOWN net did not catch this, and the reason matters: it guarded
 * `!player.reachable` (we got nothing) and unrecognised signal combinations (we
 * got something strange). A challenge is neither. It arrives as HTTP 200 with a
 * well-formed player response carrying a status the classifier recognises with
 * total confidence. The net was wired to transport failure when the failure mode
 * that actually occurred was a confident answer to a question we were never
 * allowed to ask. `isBotChallenge` is what wires it to that case.
 *
 * The observed oEmbed status codes are counter-intuitive and were measured, not
 * assumed: 401 is embedding-disabled, 403 is private, 404 is removed.
 */

/** Failure modes are separated because the remedy differs completely. */
export type VideoState =
  | 'HEALTHY'
  | 'EMBEDDING_DISABLED'
  | 'PRIVATE'
  | 'REMOVED'
  | 'UPLOADER_CLOSED'
  | 'REGION_BLOCKED'
  | 'UNKNOWN';

/** Outcome of scraping the watch page. Never throws; failure is a value. */
export interface PlayerProbe {
  reachable: boolean;
  /** playabilityStatus.status, e.g. OK | ERROR | LOGIN_REQUIRED | UNPLAYABLE. */
  status?: string | null;
  reason?: string | null;
  /** microformat.embed present <=> the video may be played in an iframe. */
  embeddable?: boolean;
  owner?: string | null;
  channelId?: string | null;
  lengthSeconds?: number | null;
  availableCountries?: string[];
  /**
   * YouTube declined to answer and demanded proof we are human. A statement
   * about this run, not about the video. Never a verdict.
   */
  challenged?: boolean;
  /** Why the probe produced nothing useful (rate limit, markup change, ...). */
  note?: string;
}

/**
 * Who owns a video, with "we could not tell" as a first-class answer.
 *
 * A boolean cannot carry that third case, and on 2026-08-22 it lied in the
 * reassuring direction: every failing video reported `ours: false`, read as "none
 * of these are ours", when in truth the owner was simply unreadable. The cases
 * the metric covers — private, removed, challenged — are exactly the cases whose
 * watch page carries no microformat and therefore no owner name.
 */
export type Ownership = 'ours' | 'third_party' | 'unknown';

export interface Verdict {
  state: VideoState;
  /** Whether this verdict is solid enough to raise an alert on. */
  actionable: boolean;
  detail: string;
  remedy: string;
}

export const OUR_CHANNEL = 'Colaberry School Of Data & AI';

/** The market we serve. A video unavailable here is unavailable to students. */
export const HOME_REGION = 'US';

/**
 * Accepts watch?v=, youtu.be/, /embed/ and /shorts/ forms. Returns null for a
 * non-YouTube URL so those are reported as SKIPPED rather than guessed at.
 *
 * Canonical copy. `scripts/auditCurriculumVideoLinks.ts` re-exports this rather
 * than keeping its own, so the CLI audit and the scheduled check can never
 * disagree about what counts as a video reference.
 */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /\/embed\/([A-Za-z0-9_-]{6,})/,
    /\/shorts\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Extract the JSON object that follows `ytInitialPlayerResponse =` by matching
 * braces, rather than by a non-greedy regex to a guessed terminator.
 *
 * The regex approach breaks the moment YouTube changes what follows the object,
 * and it breaks *silently* — it yields "no player response", which a careless
 * classifier would read as a dead video. Brace matching is string-quote and
 * escape aware so a `}` inside a video title cannot truncate the object.
 * Returns null when the object is absent or unbalanced; the caller degrades to
 * UNKNOWN.
 */
export function extractPlayerResponse(html: string): Record<string, unknown> | null {
  const marker = 'ytInitialPlayerResponse';
  const at = html.indexOf(marker);
  if (at === -1) return null;

  const start = html.indexOf('{', at);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null; // malformed => UNKNOWN, never a failure verdict
        }
      }
    }
  }
  return null; // unbalanced => UNKNOWN
}

/**
 * Phrases YouTube uses when it is refusing to answer rather than answering.
 *
 * Deliberately narrow. "Sign in to confirm your age" is age-gating — a real
 * problem with a real remedy — and must NOT be swallowed here, so the patterns
 * key on the bot/traffic/quota vocabulary rather than on "sign in to confirm".
 * `\bnot a bot\b` matches whichever apostrophe YouTube serves in "you're"
 * (it serves U+2019) without the regex having to care.
 */
const CHALLENGE_PATTERNS: RegExp[] = [
  /\bnot\s+a\s+bot\b/i,
  /\bunusual\s+traffic\b/i,
  /\btoo\s+many\s+requests\b/i,
  /\bverify\s+(that\s+)?you.{0,4}re\s+(a\s+)?human\b/i,
  /\bconfirm\s+you.{0,4}re\s+(a\s+)?human\b/i,
];

/**
 * Does this playabilityStatus say "prove you are a person" rather than anything
 * about the video?
 *
 * Matches against the serialised status rather than against a fixed field path.
 * YouTube has moved this text between `reason`, `messages[]` and the error
 * screen's `subreason` more than once, and a detector that reads one path would
 * fail open into exactly the false PRIVATE this exists to prevent. Being wrong
 * here is asymmetric: a missed challenge pages 149 people, a spurious challenge
 * only delays one verdict by a run.
 */
export function isBotChallenge(playabilityStatus: unknown): boolean {
  if (!playabilityStatus || typeof playabilityStatus !== 'object') return false;
  let text: string;
  try {
    text = JSON.stringify(playabilityStatus);
  } catch {
    return false; // circular/unserialisable: not evidence of a challenge
  }
  return CHALLENGE_PATTERNS.some((re) => re.test(text));
}

/** Shape a parsed player response into a PlayerProbe. Pure. */
export function readPlayerResponse(parsed: Record<string, unknown> | null): PlayerProbe {
  if (!parsed) return { reachable: false, note: 'no parseable player response' };

  const ps = (parsed.playabilityStatus ?? {}) as Record<string, unknown>;
  const micro = (parsed.microformat ?? {}) as Record<string, unknown>;
  const mf = (micro.playerMicroformatRenderer ?? {}) as Record<string, unknown>;
  const details = (parsed.videoDetails ?? {}) as Record<string, unknown>;

  const rawLength = mf.lengthSeconds ?? details.lengthSeconds;
  const length = rawLength == null ? null : Number(rawLength);

  return {
    reachable: true,
    status: (ps.status as string) ?? null,
    reason: (ps.reason as string) ?? null,
    challenged: isBotChallenge(ps),
    // The `embed` key is present exactly when the video may be iframed.
    embeddable: Object.prototype.hasOwnProperty.call(mf, 'embed'),
    owner: (mf.ownerChannelName as string) ?? (details.author as string) ?? null,
    channelId: (mf.externalChannelId as string) ?? (details.channelId as string) ?? null,
    lengthSeconds: Number.isFinite(length) ? (length as number) : null,
    availableCountries: (mf.availableCountries as string[]) ?? [],
  };
}

/**
 * Combine both independent signals into one verdict.
 *
 * `oembedStatus` is null when the oEmbed call itself failed to produce a status
 * (network error), which is inconclusive rather than negative.
 *
 * `knownChannelGone` lets the caller upgrade REMOVED to UPLOADER_CLOSED: a
 * deleted video and a closed account are indistinguishable at the video URL
 * (both 404), so the discriminator is whether the channel we recorded on the
 * last healthy run still resolves.
 */
export function classify(
  oembedStatus: number | null,
  player: PlayerProbe,
  knownChannelGone = false,
): Verdict {
  // Nothing to corroborate with: never guess.
  if (!player.reachable) {
    return {
      state: 'UNKNOWN',
      actionable: false,
      detail: `player probe inconclusive (${player.note ?? 'unreachable'}), oEmbed=${oembedStatus ?? 'n/a'}`,
      remedy: 'No action. Re-checked on the next run; alerts only on a corroborated failure.',
    };
  }

  // A challenge outranks every status below it. YouTube reuses LOGIN_REQUIRED and
  // ERROR for "prove you are human", so those branches would otherwise read a
  // refusal as PRIVATE or REMOVED — which is exactly what produced 146 false
  // positives on 2026-08-22. This must stay ABOVE the status branches.
  if (player.challenged) {
    return {
      state: 'UNKNOWN',
      actionable: false,
      detail: `YouTube served a bot challenge instead of an answer (oEmbed=${oembedStatus ?? 'n/a'}); this is throttling of us, not a broken video`,
      remedy: 'No action on the video. Slow the probe rate; the next run re-checks it.',
    };
  }

  const status = player.status ?? null;

  // Healthy: both methods agree, and the video is iframe-playable in our region.
  if (oembedStatus === 200 && status === 'OK' && player.embeddable) {
    const countries = player.availableCountries ?? [];
    if (countries.length > 0 && !countries.includes(HOME_REGION)) {
      return {
        state: 'REGION_BLOCKED',
        actionable: true,
        detail: `playable but not available in ${HOME_REGION} (${countries.length} allowed regions)`,
        remedy: 'Uploader geo-restricted it. Replace, or host a licensed copy.',
      };
    }
    return { state: 'HEALTHY', actionable: false, detail: 'playable and embeddable', remedy: '' };
  }

  // Public on YouTube, dead in our iframe. The mode a naive checker misses.
  if (status === 'OK' && player.embeddable === false) {
    return {
      state: 'EMBEDDING_DISABLED',
      actionable: true,
      detail: 'public on YouTube but embedding is disabled, so it cannot play in our player',
      remedy: 'Ours: re-enable embedding. Third party: link out or replace the video.',
    };
  }

  if (status === 'LOGIN_REQUIRED' || oembedStatus === 403) {
    return {
      state: 'PRIVATE',
      actionable: true,
      detail: player.reason || 'video is private / login required',
      remedy: 'Ours: set back to unlisted or public. Third party: replace the video.',
    };
  }

  if (status === 'ERROR' || status === 'UNPLAYABLE' || oembedStatus === 404) {
    if (knownChannelGone) {
      return {
        state: 'UPLOADER_CLOSED',
        actionable: true,
        detail: `${player.reason || 'video unavailable'}; the uploading channel no longer resolves`,
        remedy: 'Gone for good. Curriculum owner must choose a replacement.',
      };
    }
    return {
      state: 'REMOVED',
      actionable: true,
      detail: player.reason || 'video unavailable',
      remedy: 'Deleted or taken down. Curriculum owner must choose a replacement.',
    };
  }

  // Signals present but not a combination we recognise: report, do not page.
  return {
    state: 'UNKNOWN',
    actionable: false,
    detail: `unrecognised combination oEmbed=${oembedStatus ?? 'n/a'} playability=${status ?? 'n/a'} embeddable=${player.embeddable}`,
    remedy: 'No action. Investigate if it persists across runs.',
  };
}

/** Is this one of ours? A failure on our channel is a settings mistake we can fix. */
export function isOurChannel(channel: string | null | undefined): boolean {
  return (channel ?? '').trim().toLowerCase() === OUR_CHANNEL.toLowerCase();
}

/**
 * Ownership with an honest third answer.
 *
 * Prefer this over `isOurChannel` anywhere the result is counted or reported.
 * `isOurChannel(null)` is `false`, which is correct as a predicate and wrong as
 * a statistic: aggregate enough of them and you get "0 failures on our channel"
 * from a run that never learned who owned anything.
 */
export function ownershipOf(channel: string | null | undefined): Ownership {
  const name = (channel ?? '').trim();
  if (!name) return 'unknown';
  return isOurChannel(name) ? 'ours' : 'third_party';
}
