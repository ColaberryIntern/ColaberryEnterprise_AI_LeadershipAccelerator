/**
 * Pure classification tests. No network, no DB, no module-registry mocking.
 *
 * The corpus block at the bottom is the load-bearing one: it is a recording of
 * what the YouTube Data API actually said about all 150 curriculum videos on
 * 2026-08-23, taken from inside the production container, and it pins the
 * classifier to 147 healthy and 3 broken. If a future change starts calling
 * healthy videos broken, or - far worse, because it is silent - broken videos
 * healthy, this is the file that goes red.
 */
import {
  classifyAbsent,
  classifyMissingUrl,
  classifyPresent,
  isOurChannel,
  ownershipOf,
  youtubeId,
} from '../videoLinkClassifier';
import type { ApiVideo } from '../videoLinkApiClient';
import corpus from './fixtures/liveApiCorpus.json';

/** A public, embeddable, unrestricted video, which callers then break one field at a time. */
const video = (over: Partial<ApiVideo> = {}): ApiVideo => ({
  id: 'vid000000',
  privacyStatus: 'public',
  uploadStatus: 'processed',
  embeddable: true,
  channelTitle: 'Anthropic',
  channelId: 'UCrDwWp7EBBv4NwvScIpBDOA',
  regionAllowed: null,
  regionBlocked: null,
  ytRating: null,
  ...over,
});

describe('youtubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=6wkFb2_cUik', '6wkFb2_cUik'],
    ['https://youtu.be/w7_yWjYyxjE', 'w7_yWjYyxjE'],
    ['https://www.youtube.com/embed/6wkFb2_cUik', '6wkFb2_cUik'],
    ['https://www.youtube.com/shorts/6wkFb2_cUik', '6wkFb2_cUik'],
  ])('extracts the id from %s', (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });

  it.each([
    ['https://storage.googleapis.com/sample/BigBuckBunny.mp4'],
    [''],
    [null],
    [undefined],
  ])('returns null for %s rather than guessing', (url) => {
    expect(youtubeId(url as string | null)).toBeNull();
  });
});

describe('classifyPresent - the failure modes stay distinct', () => {
  it('HEALTHY when the video is public, embeddable and unrestricted', () => {
    expect(classifyPresent(video()).state).toBe('HEALTHY');
    expect(classifyPresent(video()).actionable).toBe(false);
  });

  it('an unlisted video is healthy: unlisted is how our own curriculum videos ship', () => {
    expect(classifyPresent(video({ privacyStatus: 'unlisted' })).state).toBe('HEALTHY');
  });

  it('EMBEDDING_DISABLED: public on YouTube, dead in our iframe (the mode a naive check misses)', () => {
    const v = classifyPresent(video({ embeddable: false }));
    expect(v.state).toBe('EMBEDDING_DISABLED');
    expect(v.actionable).toBe(true);
  });

  it('PRIVATE when the API reports privacyStatus=private', () => {
    expect(classifyPresent(video({ privacyStatus: 'private' })).state).toBe('PRIVATE');
  });

  it.each(['deleted', 'rejected', 'failed'])('REMOVED when uploadStatus is %s', (uploadStatus) => {
    expect(classifyPresent(video({ uploadStatus })).state).toBe('REMOVED');
  });

  it('REGION_BLOCKED when our home region is on the blocked list', () => {
    const v = classifyPresent(video({ regionBlocked: ['US', 'CA'] }));
    expect(v.state).toBe('REGION_BLOCKED');
    expect(v.actionable).toBe(true);
  });

  it('REGION_BLOCKED when the allowed list exists and excludes us', () => {
    expect(classifyPresent(video({ regionAllowed: ['GB', 'IE'] })).state).toBe('REGION_BLOCKED');
  });

  it('is NOT region blocked when the allowed list includes us', () => {
    expect(classifyPresent(video({ regionAllowed: ['US', 'GB'] })).state).toBe('HEALTHY');
  });

  it('is NOT region blocked when there is no restriction at all', () => {
    expect(classifyPresent(video({ regionAllowed: null, regionBlocked: null })).state).toBe('HEALTHY');
  });

  it('reports the most fundamental failure first: gone outranks private outranks unembeddable', () => {
    expect(classifyPresent(video({ uploadStatus: 'deleted', privacyStatus: 'private', embeddable: false })).state)
      .toBe('REMOVED');
    expect(classifyPresent(video({ privacyStatus: 'private', embeddable: false })).state).toBe('PRIVATE');
    expect(classifyPresent(video({ embeddable: false, regionBlocked: ['US'] })).state).toBe('EMBEDDING_DISABLED');
  });
});

describe('classifyPresent - a missing signal is never a verdict in either direction', () => {
  it('UNKNOWN when the response carried no status.embeddable, rather than assuming embeddable', () => {
    const v = classifyPresent(video({ embeddable: null }));
    expect(v.state).toBe('UNKNOWN');
    expect(v.actionable).toBe(false);
  });

  it('a null embeddable is not EMBEDDING_DISABLED either: it would alert on the whole corpus', () => {
    expect(classifyPresent(video({ embeddable: null })).state).not.toBe('EMBEDDING_DISABLED');
  });

  it('UNKNOWN when the response carried no status.privacyStatus', () => {
    expect(classifyPresent(video({ privacyStatus: null })).state).toBe('UNKNOWN');
  });
});

/**
 * `videos.list` omits ids it cannot return instead of erroring on them. These are
 * the tests that keep that omission from being read as a pass.
 */
describe('classifyAbsent - an id the API did not return is never healthy', () => {
  it('THE HEADLINE: absence with no corroborating evidence is a failure, not a pass', () => {
    const v = classifyAbsent({ oembedStatus: null, throttled: false });
    expect(v.state).not.toBe('HEALTHY');
    expect(v.state).toBe('UNAVAILABLE');
    expect(v.actionable).toBe(true);
  });

  it('is still not healthy when the follow-up lookup was itself refused', () => {
    const v = classifyAbsent({ oembedStatus: null, throttled: true });
    expect(v.state).toBe('UNAVAILABLE');
    expect(v.actionable).toBe(true);
    expect(v.detail).toMatch(/unconfirmed/);
  });

  it.each([
    [403, 'PRIVATE'],
    [404, 'REMOVED'],
  ])('oEmbed %s refines absence to %s', (oembedStatus, state) => {
    expect(classifyAbsent({ oembedStatus, throttled: false }).state).toBe(state);
  });

  it('UPLOADER_CLOSED only when the owning channel no longer resolves', () => {
    expect(classifyAbsent({ oembedStatus: 404, throttled: false, knownChannelGone: true }).state)
      .toBe('UPLOADER_CLOSED');
    expect(classifyAbsent({ oembedStatus: 404, throttled: false, knownChannelGone: false }).state)
      .toBe('REMOVED');
  });

  it('two sources disagreeing is UNKNOWN, and specifically not HEALTHY', () => {
    const v = classifyAbsent({ oembedStatus: 200, throttled: false });
    expect(v.state).toBe('UNKNOWN');
    expect(v.state).not.toBe('HEALTHY');
    expect(v.actionable).toBe(false);
  });

  it('never returns HEALTHY for any evidence a caller could hand it', () => {
    const evidence = [null, 200, 401, 403, 404, 429, 500].flatMap((oembedStatus) => [
      { oembedStatus, throttled: false },
      { oembedStatus, throttled: true },
    ]);
    expect(evidence.map((e) => classifyAbsent(e).state)).not.toContain('HEALTHY');
  });
});

describe('ownership is tri-state, because "we could not tell" is not "not ours"', () => {
  it('matches our channel case-insensitively', () => {
    expect(isOurChannel('Colaberry School Of Data & AI')).toBe(true);
    expect(isOurChannel('colaberry school of data & ai')).toBe(true);
  });

  it.each(['Anthropic', 'TOK TIK VENTURES', null, undefined, ''])('does not match %s', (c) => {
    expect(isOurChannel(c as string | null)).toBe(false);
  });

  it('reports unknown, not third_party, when the owner could not be read', () => {
    expect(ownershipOf(null)).toBe('unknown');
    expect(ownershipOf('  ')).toBe('unknown');
    expect(ownershipOf('Anthropic')).toBe('third_party');
    expect(ownershipOf('Colaberry School Of Data & AI')).toBe('ours');
  });
});

/**
 * The real corpus, as the YouTube Data API described it from inside the
 * production container on 2026-08-23: 150 distinct video ids across 160
 * video-bearing cards.
 *
 * Cross-checked against the scraped measurement taken on 2026-08-21 from an
 * unthrottled workstation: of the 148 ids common to both, ZERO changed verdict.
 * Two methods, two days, same answers - which is what makes 147/3 a fact about
 * the curriculum rather than a fact about the checker.
 */
describe('the real production corpus (150 videos, YouTube Data API, 2026-08-23)', () => {
  const verdicts = corpus.map((row) => ({
    row,
    verdict: row.present
      ? classifyPresent({
          id: row.video_id,
          privacyStatus: row.privacyStatus,
          uploadStatus: row.uploadStatus,
          embeddable: row.embeddable,
          channelTitle: row.channelTitle,
          channelId: null,
          regionAllowed: row.regionAllowed,
          regionBlocked: row.regionBlocked,
          ytRating: row.ytRating,
        })
      : classifyAbsent({ oembedStatus: row.oembedStatus ?? null, throttled: false }),
  }));

  it('reports all 147 healthy videos as clean, with zero manufactured failures', () => {
    const expectedHealthy = verdicts.filter((v) => v.row.expected === 'HEALTHY');
    expect(expectedHealthy).toHaveLength(147);

    const misreported = expectedHealthy.filter((v) => v.verdict.state !== 'HEALTHY');
    expect(misreported.map((m) => `${m.row.video_id}=>${m.verdict.state}`)).toEqual([]);
  });

  it('nothing healthy is ever actionable, so a clean corpus pages nobody', () => {
    expect(verdicts.filter((v) => v.row.expected === 'HEALTHY' && v.verdict.actionable)).toHaveLength(0);
  });

  it('classifies each of the 3 real failures into its own distinct mode', () => {
    const actual = verdicts
      .filter((v) => v.row.expected !== 'HEALTHY')
      // Codepoint order, not locale order: `_` sorts after letters here, and a
      // locale collation would quietly reorder it and make this assertion flaky.
      .map((v) => [v.row.video_id, v.verdict.state])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    expect(actual).toEqual([
      ['AqGFDPVsG1A', 'EMBEDDING_DISABLED'],
      ['OntMoGj45Tc', 'PRIVATE'],
      ['_RxzOouIcII', 'REMOVED'],
    ]);
  });

  it('the two videos absent from the API response are the two that are gone, and neither is healthy', () => {
    const absent = corpus.filter((r) => !r.present).map((r) => r.video_id).sort();
    expect(absent).toEqual(['OntMoGj45Tc', '_RxzOouIcII']);
    const states = verdicts.filter((v) => !v.row.present).map((v) => v.verdict.state);
    expect(states).not.toContain('HEALTHY');
    expect(states.every((s) => s !== 'UNKNOWN')).toBe(true);
  });

  it('catches the embedding-disabled trap, which looks perfectly healthy to a naive check', () => {
    const trap = corpus.find((r) => r.video_id === 'AqGFDPVsG1A');
    // Public, processed, present in the response. Only `embeddable` gives it away.
    expect(trap?.privacyStatus).toBe('public');
    expect(trap?.present).toBe(true);
    expect(trap?.embeddable).toBe(false);
    expect(verdicts.find((v) => v.row.video_id === 'AqGFDPVsG1A')?.verdict.state).toBe('EMBEDDING_DISABLED');
  });

  it('identifies all 13 of our own channel videos, all healthy', () => {
    const ours = verdicts.filter((v) => isOurChannel(v.row.channelTitle));
    expect(ours).toHaveLength(13);
    expect(ours.every((v) => v.verdict.state === 'HEALTHY')).toBe(true);
  });

  it('leaves region-restricted videos healthy when the restriction still allows us', () => {
    const restricted = verdicts.filter((v) => v.row.regionAllowed || v.row.regionBlocked);
    expect(restricted.length).toBeGreaterThan(0);
    expect(restricted.every((v) => v.verdict.state === 'HEALTHY')).toBe(true);
  });

  it('a card with no URL is classified, never left to read as healthy', () => {
    // The API-side twin of this rule is `classifyAbsent`: an id the response
    // omits must be classified deliberately. This is the DB-side twin — a card
    // the query omitted, for want of a URL to select on.
    const verdict = classifyMissingUrl();
    expect(verdict.state).toBe('URL_MISSING');
    expect(verdict.state).not.toBe('HEALTHY');
  });

  it('does not page: a missing URL arms no watch gate, so it strands nobody', () => {
    // The asymmetry that matters. Every other non-healthy state is actionable
    // because it can seal a week; this one cannot, and must not read the same.
    expect(classifyMissingUrl().actionable).toBe(false);
    expect(classifyAbsent({ oembedStatus: 404, throttled: false }).actionable).toBe(true);
  });

  it('names the remedy as a content decision, not a repair', () => {
    // There is nothing to restore: the card never had a video. The only moves are
    // attach one or retire the card, and both belong to the curriculum owner.
    expect(classifyMissingUrl().remedy).toMatch(/attach a video, or retire the card/i);
  });

  it('does not reference Yjfh5jtaLx4: a retired tombstone URL is not a live link', () => {
    // The whole-blob sweep that matched this id inside
    // metadata.replaced_video.previous_url is what archived a healthy Week 3 card.
    expect(corpus.map((r) => r.video_id)).not.toContain('Yjfh5jtaLx4');
  });
});
