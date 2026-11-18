import { displayTitle, parseYoutubeId } from '../tvModel';

/**
 * Campus v20 N3 (C134): which links are shorts, and what title to show for one.
 *
 * TV-2 removed the rest of this suite with the code it covered. `audienceSees` and `toViewerList`
 * described a per-audience, positioned playlist that only `colaberry_tv_videos` ever had; the
 * library has no audience, no position and no on-air flag. `nextPositions` and the four Zod bodies
 * served the manage routes. `fetchShortTitle` went with `tvOembed.ts`, whose only caller was the
 * write path.
 *
 * What is left is what the LIVE path still calls: `tvLibrarySource` parses each asset's
 * `source_url` with `parseYoutubeId` and names it with `displayTitle`. Both are load-bearing, so
 * both keep full coverage.
 */
const ID = 'Pa5J5T6MZok';

describe('parseYoutubeId', () => {
  it.each([
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?t=3&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
    `https://m.youtube.com/shorts/${ID}`,
    `youtube.com/shorts/${ID}`,
  ])('reads %s', (url) => { expect(parseYoutubeId(url)).toBe(ID); });

  it.each([
    ['empty', ''],
    ['another site', `https://vimeo.com/${ID}`],
    ['a lookalike host', `https://youtube.com.evil.test/shorts/${ID}`],
    ['a short id', 'https://www.youtube.com/shorts/abc'],
    ['a channel page', 'https://www.youtube.com/@colaberry'],
    ['an oversized string', `https://www.youtube.com/shorts/${ID}?x=${'a'.repeat(600)}`],
  ])('rejects %s', (_n, url) => { expect(parseYoutubeId(url)).toBeNull(); });
});

describe('displayTitle', () => {
  it('an empty or blank title is never shown as blank', () => {
    expect(displayTitle({ title: '   ' })).toBe('Colaberry short');
    expect(displayTitle({ title: null })).toBe('Colaberry short');
  });

  it('a real title is shown as stored', () => {
    expect(displayTitle({ title: 'Week 1 recap' })).toBe('Week 1 recap');
  });
});

describe('what TV-2 removed from this module', () => {
  /**
   * Asserted rather than merely deleted. These symbols described a second playlist that nothing
   * reads any more; if one reappears it should be because somebody decided to bring the table
   * back, not because an import was restored to make something compile.
   */
  it('exports nothing from the retired playlist', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('../tvModel');
    for (const gone of ['AUDIENCES', 'audienceSees', 'toViewerList', 'nextPositions', 'AddBody', 'UpdateBody', 'OrderBody', 'IdParam']) {
      expect(mod[gone]).toBeUndefined();
    }
  });

  it('tvOembed is gone from the tree', () => {
    expect(() => require('../tvOembed')).toThrow();
  });
});
