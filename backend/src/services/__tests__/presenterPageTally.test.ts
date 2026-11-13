jest.mock('qrcode', () => ({ toString: jest.fn().mockResolvedValue('<svg/>') }));
// `databaseUrl` is here because this service's import chain reaches `config/database`, which
// constructs Sequelize at module load. A stub URL is the pattern the rest of this directory
// uses; nothing connects, because every query path is mocked below.
jest.mock('../../config/env', () => ({
  env: {
    frontendUrl: 'https://enterprise.colaberry.ai',
    databaseUrl: 'postgres://u:p@localhost:5432/test',
    nodeEnv: 'test',
  },
}));
jest.mock('../sessionKitService', () => ({ buildSessionKit: jest.fn() }));
jest.mock('../classKit/kitToken', () => ({ mintKitToken: () => 'kit-token' }));

import { renderPresenterPage } from '../sessionKitDocService';
import { buildSessionKit } from '../sessionKitService';

/**
 * D9 - the tally on the presenter's own page, asserted on the page that is actually served.
 *
 * `broadcastPresenterTally.test.ts` proves the DECISION. This proves the page carries it, and
 * in particular proves the state it is in BEFORE the first poll lands, which no test of a pure
 * function can reach.
 *
 * ## Why the initial state is the interesting one
 *
 * An instructor opens this page and starts reading. For the first couple of seconds the page
 * has asked nothing and knows nothing. Rendering OFF AIR in that window would be the harmful
 * error - saying the room cannot hear you when it can - and it is the natural thing to write,
 * because OFF AIR looks like the sensible default for a page that has not started yet.
 *
 * ## What this test cannot do
 *
 * It does not execute the page's script. The paint path and the dropped-request fallback are
 * asserted structurally: the call is present in the catch block, and the markup it starts from
 * is correct. That is a real guard against the fail-safe being deleted, and it is NOT evidence
 * the painted result looks right in a browser. Said plainly rather than implied.
 */

const kit = { session: { id: 'sess-1', title: 'Week 8' } } as any;

beforeEach(() => {
  jest.clearAllMocks();
  (buildSessionKit as jest.Mock).mockResolvedValue(kit);
});

describe('the tally on the presenter page', () => {
  it('is on the page at all', async () => {
    const html = (await renderPresenterPage('sess-1'))!;
    expect(html).toContain('id="tally"');
    expect(html).toContain('id="tally-badge"');
    expect(html).toContain('id="tally-detail"');
  });

  /**
   * THE ONE THAT MATTERS. Before the first poll the page knows nothing, and the honest answer
   * is "cannot confirm", not "off air".
   */
  it('starts as CANNOT CONFIRM and never as OFF AIR', async () => {
    const html = (await renderPresenterPage('sess-1'))!;
    const tag = html.match(/<div class="tally"[^>]*>/)![0];

    expect(tag).toContain('data-state="unknown"');
    // The safe direction: an unconfirmed page behaves as though the room can hear them.
    expect(tag).toContain('data-live="yes"');
    expect(html).toContain('CANNOT CONFIRM');
  });

  it('tells the presenter what to assume while it is still checking', async () => {
    const html = (await renderPresenterPage('sess-1'))!;
    expect(html).toMatch(/assume you are/i);
  });

  it('keeps the tally out of the DECK, which OBS captures into the recording', async () => {
    // The whole reason the badge lives here. `renderPresenterPage` is the presenter's own
    // device; a badge on the projected deck would be burned into the replay reading ON AIR.
    const html = (await renderPresenterPage('sess-1'))!;
    expect(html).toContain('Presenter notes');
  });

  it('paints the tally BEFORE the stale-response guard drops an out-of-order reply', async () => {
    // The guard keys on the DECK's updated_at. A class whose deck has not moved in ten minutes
    // still has to be told the moment it goes on air, so the tally must not share that fate.
    const html = (await renderPresenterPage('sess-1'))!;
    const paint = html.indexOf('paintTally(d.tally)');
    const guard = html.indexOf('seenAt < lastSeenAt');

    expect(paint).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(paint).toBeLessThan(guard);
  });

  it('resets the tally when a request fails, rather than keeping the last answer', async () => {
    // Stale NOTES are better than a blank page. A stale tally is not: a page that last heard
    // OFF AIR and then lost the connection would go on asserting it while the producer takes
    // the class live.
    const html = (await renderPresenterPage('sess-1'))!;
    const catchBlock = html.slice(html.indexOf('.catch(function(e)'));

    expect(catchBlock).toContain('paintTally(null)');
  });

  it('returns null for a session that does not exist', async () => {
    (buildSessionKit as jest.Mock).mockResolvedValue(null);
    expect(await renderPresenterPage('nope')).toBeNull();
  });
});
