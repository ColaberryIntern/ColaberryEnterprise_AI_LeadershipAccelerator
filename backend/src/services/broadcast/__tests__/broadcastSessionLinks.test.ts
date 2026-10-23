const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));
jest.mock('../../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai' } }));
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

import {
  buildSessionLinks, sessionWorkspaceUrl, sessionCompanionUrl, sessionPersistentUrl,
  resolveSessionMoment, appOrigin,
} from '../broadcastSessionLinks';

/**
 * The audience-facing entry points, and the server's answer to "what is happening now".
 *
 * The assertions that matter most are about the NOT-STARTED state. A session promoted a week
 * early gets scanned a week early, and a viewer who meets an error page concludes the link is
 * broken and does not come back.
 */

const SID = '7aa7ce89-187d-4604-9b86-a3b2a69579ce';

const rows = (r: any[]) => { mockQuery.mockResolvedValue([r]); };

beforeEach(() => { jest.clearAllMocks(); rows([]); });

describe('the URL shape', () => {
  it('is absolute, so a phone camera can open it directly', () => {
    expect(sessionWorkspaceUrl(SID)).toBe(`https://enterprise.colaberry.ai/portal/live/${SID}`);
    expect(sessionCompanionUrl(SID)).toBe(`https://enterprise.colaberry.ai/portal/live/${SID}/companion`);
  });

  it('is keyed on the SESSION, not the occurrence', () => {
    // A printed or scheduled link has to survive the show being re-timed or re-created, and an
    // occurrence key changes when the start instant does.
    expect(sessionWorkspaceUrl(SID)).toContain(SID);
    expect(sessionWorkspaceUrl(SID)).not.toMatch(/occurrence/i);
  });

  it('reuses the EXISTING persistent check-in url as the QR target', () => {
    // Re-minting would make every already-printed and already-posted link wrong.
    expect(sessionPersistentUrl(SID)).toBe(`https://enterprise.colaberry.ai/portal/class-checkin/${SID}`);
  });

  it('never doubles a slash when the origin carries a trailing one', () => {
    expect(appOrigin('https://example.com/')).toBe('https://example.com');
    expect(sessionWorkspaceUrl(SID, 'https://example.com/')).toBe(`https://example.com/portal/live/${SID}`);
  });

  it('escapes the id rather than interpolating it raw', () => {
    expect(sessionWorkspaceUrl('a b/c')).toContain('a%20b%2Fc');
  });

  it('returns all three together', () => {
    const l = buildSessionLinks(SID);
    expect(Object.keys(l).sort()).toEqual(['companion_url', 'persistent_url', 'workspace_url']);
  });
});

describe('what the persistent url should show right now', () => {
  it('says not_started when live was never enabled for the session', () => {
    rows([]);
    return resolveSessionMoment(SID).then((r) => {
      expect(r).toEqual({ moment: 'not_started', occurrenceId: null, watchUrl: null });
    });
  });

  it('says not_started for a scheduled occurrence, and offers nothing to watch', async () => {
    rows([{ id: 'occ-1', editorial_state: 'scheduled' }]);
    const r = await resolveSessionMoment(SID);
    expect(r.moment).toBe('not_started');
    expect(r.occurrenceId).toBe('occ-1');
    expect(r.watchUrl).toBeNull();
  });

  it('says not_started for backstage — the audience must not be sent in early', async () => {
    rows([{ id: 'occ-1', editorial_state: 'backstage' }]);
    expect((await resolveSessionMoment(SID)).moment).toBe('not_started');
  });

  it('says live, with somewhere to go, when it is on air', async () => {
    rows([{ id: 'occ-1', editorial_state: 'live' }]);
    const r = await resolveSessionMoment(SID);
    expect(r.moment).toBe('live');
    expect(r.watchUrl).toBe(sessionWorkspaceUrl(SID));
  });

  it('treats reconnecting as live, matching what discovery treats as on air', async () => {
    // Discovery surfaces live and reconnecting. If this disagreed, a viewer would be told the
    // class had ended during a thirty-second blip.
    rows([{ id: 'occ-1', editorial_state: 'reconnecting' }]);
    expect((await resolveSessionMoment(SID)).moment).toBe('live');
  });

  it('says ended once it is over, and offers nothing to watch', async () => {
    for (const st of ['ended', 'processing', 'replay_ready']) {
      rows([{ id: 'occ-1', editorial_state: st }]);
      const r = await resolveSessionMoment(SID);
      expect(r.moment).toBe('ended');
      expect(r.watchUrl).toBeNull();
    }
  });

  it('says unknown rather than throwing when the database is unreachable', async () => {
    // This answers a public landing page. A blip should render "we cannot tell you right now",
    // never a stack trace.
    mockQuery.mockRejectedValue(new Error('connection terminated'));
    const r = await resolveSessionMoment(SID);
    expect(r).toEqual({ moment: 'unknown', occurrenceId: null, watchUrl: null });
  });

  it('looks the occurrence up by the SESSION source ref, not by room or title', async () => {
    rows([{ id: 'occ-1', editorial_state: 'live' }]);
    await resolveSessionMoment(SID);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/broadcast_source_refs/);
    expect(sql).toMatch(/source_type\s*=\s*'live_session'/);
  });
});

describe('the generated URLs are actually ROUTED', () => {
  /**
   * A generated link that 404s is worse than no link: it is promoted, printed and scanned
   * before anyone checks it, and whoever clicks it early concludes the product is broken.
   *
   * This reads the frontend route table as source, because that is the only layer where
   * "the backend builds a path nobody serves" is visible at all. Comments are stripped first:
   * a commented-out route is not a route, and an earlier wiring test of mine passed against
   * exactly that until a mutation exposed it.
   */
  const fs = require('fs');
  const path = require('path');
  const ROUTES = path.resolve(__dirname, '../../../../../frontend/src/routes/portalRoutes.tsx');

  const routeSource = (): string => fs.readFileSync(ROUTES, 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('the workspace path the builder generates is declared in the portal router', () => {
    // Derive the pattern from the builder rather than retyping it, or the two can drift and
    // the test would keep passing while the link broke.
    const generated = new URL(sessionWorkspaceUrl('SESSION_ID')).pathname;
    const pattern = generated.replace('SESSION_ID', ':sessionId');
    expect(pattern).toBe('/portal/live/:sessionId');
    expect(routeSource()).toContain(`path="${pattern}"`);
  });

  it('the companion path is declared too', () => {
    const generated = new URL(sessionCompanionUrl('SESSION_ID')).pathname;
    const pattern = generated.replace('SESSION_ID', ':sessionId');
    expect(routeSource()).toContain(`path="${pattern}"`);
  });

  it('the persistent QR target is declared, since it is the one already printed', () => {
    const generated = new URL(sessionPersistentUrl('SESSION_ID')).pathname;
    expect(routeSource()).toContain(`path="${generated.replace('SESSION_ID', ':sessionId')}"`);
  });

  it('CONTROL: a path that is NOT routed is not found', () => {
    // Without this the three assertions above could be passing on a substring quirk.
    expect(routeSource()).not.toContain('path="/portal/live/:sessionId/nonexistent"');
  });
});
