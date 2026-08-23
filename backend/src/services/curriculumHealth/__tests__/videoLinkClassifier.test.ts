/**
 * The fixture in ./fixtures/liveCorpusProbe.json is not invented. It is the real
 * oEmbed status and player-probe signal measured for all 154 YouTube videos the
 * production curriculum references, captured 2026-08-21. 151 of them are healthy,
 * so this file is the regression guard against a checker that manufactures
 * failures: if a refactor makes any of those 151 look broken, the suite fails.
 */
import {
  classify,
  extractPlayerResponse,
  isBotChallenge,
  isOurChannel,
  ownershipOf,
  readPlayerResponse,
  youtubeId,
  type PlayerProbe,
} from '../videoLinkClassifier';
import corpus from './fixtures/liveCorpusProbe.json';

const player = (over: Partial<PlayerProbe> = {}): PlayerProbe => ({
  reachable: true,
  status: 'OK',
  embeddable: true,
  owner: 'Anthropic',
  availableCountries: ['US', 'GB'],
  ...over,
});

describe('youtubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=6wkFb2_cUik', '6wkFb2_cUik'],
    ['https://youtu.be/6wkFb2_cUik', '6wkFb2_cUik'],
    ['https://www.youtube.com/embed/6wkFb2_cUik', '6wkFb2_cUik'],
    ['https://www.youtube.com/shorts/6wkFb2_cUik', '6wkFb2_cUik'],
    ['https://www.youtube.com/watch?list=PL123&v=6wkFb2_cUik', '6wkFb2_cUik'],
  ])('extracts from %s', (url, expected) => {
    expect(youtubeId(url)).toBe(expected);
  });

  it.each([null, undefined, '', 'https://vimeo.com/12345', 'not a url'])(
    'returns null for %s so it is SKIPPED rather than guessed at',
    (url) => {
      expect(youtubeId(url as string | null)).toBeNull();
    },
  );
});

describe('extractPlayerResponse', () => {
  it('brace-matches the object even when a title contains braces and quotes', () => {
    const title = 'Tool use {with} a "quoted" brace }';
    const html = `<script>var ytInitialPlayerResponse = {"videoDetails":{"title":${JSON.stringify(title)}}};</script>`;
    const parsed = extractPlayerResponse(html);
    expect((parsed as any).videoDetails.title).toBe(title);
  });

  it('survives an escaped backslash immediately before the closing quote', () => {
    const html = String.raw`ytInitialPlayerResponse = {"a":"ends with backslash\\","b":1};`;
    expect(extractPlayerResponse(html)).toEqual({ a: 'ends with backslash\\', b: 1 });
  });

  it.each([
    ['marker absent', '<html>no player here</html>'],
    ['unbalanced braces', 'ytInitialPlayerResponse = {"a":1'],
    ['malformed json', 'ytInitialPlayerResponse = {not json};'],
    ['empty document', ''],
  ])('returns null on %s rather than throwing', (_label, html) => {
    expect(extractPlayerResponse(html)).toBeNull();
  });
});

describe('readPlayerResponse', () => {
  it('treats a present microformat.embed key as embeddable', () => {
    const probe = readPlayerResponse({
      playabilityStatus: { status: 'OK' },
      microformat: { playerMicroformatRenderer: { embed: { iframeUrl: 'x' }, ownerChannelName: 'Anthropic' } },
    });
    expect(probe.embeddable).toBe(true);
    expect(probe.owner).toBe('Anthropic');
  });

  it('treats an absent embed key as NOT embeddable', () => {
    const probe = readPlayerResponse({
      playabilityStatus: { status: 'OK' },
      microformat: { playerMicroformatRenderer: { ownerChannelName: 'TOK TIK VENTURES' } },
    });
    expect(probe.embeddable).toBe(false);
  });

  it('reports unreachable for a null parse instead of inventing a failure', () => {
    expect(readPlayerResponse(null)).toEqual({ reachable: false, note: 'no parseable player response' });
  });
});

describe('classify — the five failure modes are distinguished', () => {
  it('HEALTHY when both methods agree and the video is embeddable', () => {
    const v = classify(200, player());
    expect(v.state).toBe('HEALTHY');
    expect(v.actionable).toBe(false);
  });

  it('EMBEDDING_DISABLED: public on YouTube, dead in our iframe (the mode a naive check misses)', () => {
    const v = classify(401, player({ embeddable: false, owner: 'TOK TIK VENTURES' }));
    expect(v.state).toBe('EMBEDDING_DISABLED');
    expect(v.actionable).toBe(true);
  });

  it('PRIVATE on LOGIN_REQUIRED', () => {
    expect(classify(403, player({ status: 'LOGIN_REQUIRED', embeddable: false })).state).toBe('PRIVATE');
  });

  it('REMOVED on an ERROR playability status', () => {
    expect(classify(404, player({ status: 'ERROR', embeddable: false, reason: 'Video unavailable' })).state).toBe('REMOVED');
  });

  it('UPLOADER_CLOSED only when the owning channel no longer resolves', () => {
    const probe = player({ status: 'ERROR', embeddable: false });
    expect(classify(404, probe, false).state).toBe('REMOVED');
    expect(classify(404, probe, true).state).toBe('UPLOADER_CLOSED');
  });

  it('REGION_BLOCKED when playable but our home region is excluded', () => {
    const v = classify(200, player({ availableCountries: ['GB', 'DE'] }));
    expect(v.state).toBe('REGION_BLOCKED');
    expect(v.actionable).toBe(true);
  });

  it('does NOT call it region-blocked when the country list is empty (unknown, not excluded)', () => {
    expect(classify(200, player({ availableCountries: [] })).state).toBe('HEALTHY');
  });
});

describe('classify — inconclusive signals never become failures', () => {
  it('an unreachable probe is UNKNOWN and not actionable', () => {
    const v = classify(200, { reachable: false, note: 'watch page HTTP 429' });
    expect(v.state).toBe('UNKNOWN');
    expect(v.actionable).toBe(false);
  });

  it('a rate-limited probe on a healthy video is UNKNOWN, not REMOVED', () => {
    // The exact false positive observed while building this: a 429 storm turned
    // 46 healthy videos "unreachable" in one run.
    const v = classify(200, { reachable: false, note: 'watch page HTTP 429' });
    expect(v.state).not.toBe('REMOVED');
    expect(v.actionable).toBe(false);
  });

  it('a null oEmbed status (network error) with no player data is UNKNOWN', () => {
    expect(classify(null, { reachable: false, note: 'TimeoutError' }).actionable).toBe(false);
  });

  it('an unrecognised combination is UNKNOWN rather than a guess', () => {
    const v = classify(500, player({ status: 'SOMETHING_NEW', embeddable: true }));
    expect(v.state).toBe('UNKNOWN');
    expect(v.actionable).toBe(false);
  });
});

describe('isOurChannel', () => {
  it('matches our channel case-insensitively', () => {
    expect(isOurChannel('Colaberry School Of Data & AI')).toBe(true);
    expect(isOurChannel('colaberry school of data & ai')).toBe(true);
  });

  it.each(['Anthropic', 'TOK TIK VENTURES', null, undefined, ''])('does not match %s', (c) => {
    expect(isOurChannel(c as string | null)).toBe(false);
  });
});

describe('the real production corpus (154 videos measured 2026-08-21)', () => {
  const verdicts = corpus.map((row) => ({
    row,
    verdict: classify(row.oembed as number | null, {
      reachable: row.status !== null,
      status: row.status as string | null,
      embeddable: row.embeddable as boolean,
      owner: row.owner as string | null,
      availableCountries: [],
    }),
  }));

  it('reports all 151 healthy videos as clean, with zero manufactured failures', () => {
    const expectedHealthy = verdicts.filter((v) => v.row.expected === 'HEALTHY');
    expect(expectedHealthy).toHaveLength(151);

    const misreported = expectedHealthy.filter((v) => v.verdict.state !== 'HEALTHY');
    expect(misreported.map((m) => `${m.row.video_id}=>${m.verdict.state}`)).toEqual([]);
  });

  it('nothing healthy is ever actionable, so a clean corpus pages nobody', () => {
    const noisy = verdicts.filter((v) => v.row.expected === 'HEALTHY' && v.verdict.actionable);
    expect(noisy).toHaveLength(0);
  });

  it('classifies each of the 3 real failures into its own distinct mode', () => {
    const actual = verdicts
      .filter((v) => v.row.expected !== 'HEALTHY')
      .map((v) => [v.row.video_id, v.verdict.state]);
    expect(actual).toEqual([
      ['AqGFDPVsG1A', 'EMBEDDING_DISABLED'],
      ['OntMoGj45Tc', 'PRIVATE'],
      ['_RxzOouIcII', 'REMOVED'],
    ]);
  });

  it('identifies all 13 of our own channel videos, all healthy', () => {
    const ours = verdicts.filter((v) => isOurChannel(v.row.owner as string | null));
    expect(ours).toHaveLength(13);
    expect(ours.every((v) => v.verdict.state === 'HEALTHY')).toBe(true);
  });

  it('does not reference Yjfh5jtaLx4: a retired tombstone URL is not a live link', () => {
    // The whole-blob sweep that matched this id inside
    // metadata.replaced_video.previous_url is what archived a healthy Week 3 card.
    expect(corpus.map((r) => r.video_id)).not.toContain('Yjfh5jtaLx4');
  });
});

/**
 * The 2026-08-22 dry run: 149 videos probed, 149 reported as failures, 146 of
 * them provably healthy from an unthrottled workstation moments later. Every one
 * carried the same detail string — "Sign in to confirm you're not a bot".
 *
 * That string is YouTube declining to answer, and the classifier read it as an
 * answer. `playabilityStatus.status` is LOGIN_REQUIRED for a genuinely private
 * video AND for a bot challenge, so status alone cannot tell "you may not see
 * this" from "we don't believe you're a person". The `reason` text is the only
 * discriminator, and it was being used as display copy rather than as signal.
 *
 * These payloads are the real shapes: the private/removed ones were captured
 * from the live watch pages of the two genuinely broken videos on 2026-08-22,
 * and the challenge shape is the one the dry run recorded. Note what the
 * challenge does NOT carry: no microformat, so no owner and no embed key. That
 * absence is also why `channel` came back null for all 149.
 */
describe('a bot challenge is not a verdict', () => {
  /** Reason text uses U+2019, as YouTube serves it. Do not "fix" the apostrophe. */
  const botChallenge = (status: string) => ({
    playabilityStatus: {
      status,
      reason: 'Sign in to confirm you’re not a bot',
      errorScreen: {
        playerErrorMessageRenderer: {
          reason: { simpleText: 'Sign in to confirm you’re not a bot' },
          subreason: { runs: [{ text: 'This helps protect our community. ' }, { text: 'Learn more' }] },
        },
      },
    },
  });

  /** Genuinely private. Live capture of OntMoGj45Tc, 2026-08-22. */
  const reallyPrivate = {
    playabilityStatus: {
      status: 'LOGIN_REQUIRED',
      messages: ['This is a private video. Please sign in to verify that you may see it.'],
      errorScreen: {
        playerErrorMessageRenderer: {
          reason: { simpleText: 'Private video' },
          subreason: { simpleText: "Sign in if you've been granted access to this video" },
        },
      },
    },
  };

  /** Genuinely gone. Live capture of _RxzOouIcII, 2026-08-22. */
  const reallyRemoved = {
    playabilityStatus: {
      status: 'ERROR',
      reason: 'Video unavailable',
      errorScreen: {
        playerInterstitialRenderer: {
          content: { interstitialViewModel: { title: { content: 'Video unavailable' } } },
        },
      },
    },
  };

  it('THE HEADLINE: a challenged probe is UNKNOWN, never PRIVATE', () => {
    const verdict = classify(403, readPlayerResponse(botChallenge('LOGIN_REQUIRED')));
    expect(verdict.state).toBe('UNKNOWN');
    expect(verdict.actionable).toBe(false);
  });

  it('a challenge arriving as ERROR is UNKNOWN, never REMOVED', () => {
    const verdict = classify(404, readPlayerResponse(botChallenge('ERROR')));
    expect(verdict.state).toBe('UNKNOWN');
    expect(verdict.actionable).toBe(false);
  });

  it('the challenge is flagged on the probe itself, so callers can count throttling', () => {
    expect(readPlayerResponse(botChallenge('LOGIN_REQUIRED')).challenged).toBe(true);
    expect(readPlayerResponse(reallyPrivate).challenged).toBe(false);
    expect(readPlayerResponse(reallyRemoved).challenged).toBe(false);
  });

  it('says plainly that it is us being throttled, not the video being broken', () => {
    const verdict = classify(403, readPlayerResponse(botChallenge('LOGIN_REQUIRED')));
    expect(verdict.detail).toMatch(/challenge|throttl/i);
    expect(verdict.detail).not.toMatch(/private/i);
  });

  it.each([
    ['curly apostrophe, as served', 'Sign in to confirm you’re not a bot'],
    ['straight apostrophe', "Sign in to confirm you're not a bot"],
    ['unusual traffic', 'Our systems have detected unusual traffic from your computer network.'],
    ['too many requests', 'Too Many Requests'],
  ])('recognises the challenge phrased as %s', (_label, reason) => {
    expect(isBotChallenge({ status: 'LOGIN_REQUIRED', reason })).toBe(true);
  });

  it.each([
    ['a private video', reallyPrivate.playabilityStatus],
    ['a removed video', reallyRemoved.playabilityStatus],
    ['a healthy video', { status: 'OK' }],
  ])('does not mistake %s for a challenge', (_label, status) => {
    expect(isBotChallenge(status)).toBe(false);
  });

  it('still calls a genuinely private video PRIVATE: the fix must not blunt the check', () => {
    const verdict = classify(403, readPlayerResponse(reallyPrivate));
    expect(verdict.state).toBe('PRIVATE');
    expect(verdict.actionable).toBe(true);
  });

  it('still calls a genuinely removed video REMOVED', () => {
    const verdict = classify(404, readPlayerResponse(reallyRemoved));
    expect(verdict.state).toBe('REMOVED');
    expect(verdict.actionable).toBe(true);
  });

  it('the whole 149-video challenge storm yields nothing actionable', () => {
    const storm = corpus.map(() => classify(403, readPlayerResponse(botChallenge('LOGIN_REQUIRED'))));
    expect(storm.filter((v) => v.actionable)).toHaveLength(0);
    expect(storm.every((v) => v.state === 'UNKNOWN')).toBe(true);
  });
});

/**
 * `ours: false` was reported for every failing video, and read as "none of these
 * are ours". It was not a finding: the watch page carries no microformat for a
 * private, removed or challenged video, so `owner` is null in exactly the cases
 * the metric covers. A boolean cannot express "we could not tell", so it lied
 * in the reassuring direction.
 */
describe('ownership is tri-state, because "we could not tell" is not "not ours"', () => {
  it('reports unknown, not third_party, when the owner could not be read', () => {
    expect(ownershipOf(null)).toBe('unknown');
    expect(ownershipOf(undefined)).toBe('unknown');
    expect(ownershipOf('')).toBe('unknown');
  });

  it('still identifies our channel and third parties', () => {
    expect(ownershipOf('Colaberry School Of Data & AI')).toBe('ours');
    expect(ownershipOf('colaberry school of data & ai')).toBe('ours');
    expect(ownershipOf('TOK TIK VENTURES')).toBe('third_party');
  });

  it('agrees with isOurChannel wherever isOurChannel is meaningful', () => {
    for (const row of corpus) {
      const owner = row.owner as string | null;
      if (owner) expect(ownershipOf(owner) === 'ours').toBe(isOurChannel(owner));
    }
  });
});
