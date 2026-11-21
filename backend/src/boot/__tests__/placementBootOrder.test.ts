const mockEnsure = jest.fn();
jest.mock('../../db/ensurePlacementSchema', () => ({ ensurePlacementSchema: (...a: unknown[]) => mockEnsure(...a) }));
// The real routers import the app config; the wiring under test only needs something mountable.
jest.mock('../../routes/careerPrepInboxRoutes', () => { const { Router: R } = jest.requireActual('express'); return { __esModule: true, default: R() }; });
jest.mock('../../routes/integrationsInboxRoutes', () => { const { Router: R } = jest.requireActual('express'); return { __esModule: true, default: R() }; });
jest.mock('../../routes/publicBookingRoutes', () => { const { Router: R } = jest.requireActual('express'); return { bookingRouters: { view: R(), confirm: R() } }; });
const mockStartInboxTests = jest.fn();
jest.mock('../../services/placement/inboxTestJob', () => ({ startInboxTestCron: mockStartInboxTests }));
const mockStartBackfill = jest.fn();
jest.mock('../../services/placement/inboxBackfill', () => ({ startInboxBackfill: mockStartBackfill }));
const mockStartReplay = jest.fn();
jest.mock('../../services/placement/inboxEvents', () => ({ startInboxReplay: mockStartReplay }));
const mockStartSweep = jest.fn();
jest.mock('../../services/placement/bookingLinkSweep', () => ({ startBookingLinkSweep: mockStartSweep }));
const mockStartConfirmSweep = jest.fn();
jest.mock('../../services/placement/bookingConfirmSweep', () => ({ startBookingConfirmSweep: mockStartConfirmSweep }));

import fs from 'fs';
import path from 'path';
import express, { Router } from 'express';
import { INTEGRATION_ROUTERS, mountPlacementIntegrations, mountPlacementPublic, PUBLIC_ROUTERS, SCHEDULERS, startPlacement } from '../placementBoot';

/**
 * Career Prep R2/R3 (T09): server.ts calls the three placement hooks in the ONLY order that works. The integration
 * routes verify an HMAC over the raw bytes, so they must mount BEFORE the global express.json(); the public routes
 * must mount before adminRoutes (whose guard would 401 them); the placement schema boots after Career Prep's.
 */
const SERVER = fs.readFileSync(path.join(__dirname, '..', '..', 'server.ts'), 'utf8');
const at = (needle: string) => { const i = SERVER.indexOf(needle); if (i < 0) throw new Error(`server.ts lacks ${needle}`); return i; };

describe('server.ts placement wiring (order)', () => {
  it('integrations mount after the webhooks and BEFORE the global JSON parser', () => {
    expect(at('app.use(unsubscribeRoutes);')).toBeLessThan(at('mountPlacementIntegrations(app);'));
    expect(at('mountPlacementIntegrations(app);')).toBeLessThan(at("app.use(express.json({ limit: '5mb' }));"));
  });
  it('public routes mount after the JSON parser and BEFORE adminRoutes', () => {
    expect(at("app.use(express.json({ limit: '5mb' }));")).toBeLessThan(at('mountPlacementPublic(app);'));
    expect(at('mountPlacementPublic(app);')).toBeLessThan(at('app.use(adminRoutes);'));
  });
  it('the placement schema boots right after the Career Prep schema', () => {
    expect(at('await ensureCareerPrepSchema();')).toBeLessThan(at('await startPlacement();'));
    expect(SERVER.split('mountPlacementIntegrations(app);').length - 1).toBe(1);
    expect(SERVER.split('mountPlacementPublic(app);').length - 1).toBe(1);
  });
});

describe('placementBoot', () => {
  // Each test works on empty lists and puts the registered routers back afterwards.
  let saved: { i: Router[]; p: Router[]; s: typeof SCHEDULERS } = { i: [], p: [], s: [] };
  beforeEach(() => { saved = { i: INTEGRATION_ROUTERS.splice(0), p: PUBLIC_ROUTERS.splice(0), s: SCHEDULERS.splice(0) }; });
  afterEach(() => { INTEGRATION_ROUTERS.splice(0, Infinity, ...saved.i); PUBLIC_ROUTERS.splice(0, Infinity, ...saved.p); SCHEDULERS.splice(0, Infinity, ...saved.s); jest.restoreAllMocks(); });

  it('registers the CP6.1 inbox routes as a public (participant-gated) router', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(saved.p).toEqual([require('../../routes/careerPrepInboxRoutes').default, require('../../routes/publicBookingRoutes').bookingRouters.view]); // T17: the booking page's data
  });

  it('T12: registers the signed inbox events router as an INTEGRATION router (mounted before the JSON parser)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(saved.i).toEqual([require('../../routes/integrationsInboxRoutes').default, require('../../routes/publicBookingRoutes').bookingRouters.confirm]); // T17: the confirm parses its own 10kb body first
  });

  it('T11: registers the daily forwarding test + broken alerts as a scheduler', () => {
    expect(saved.s.map((s) => s.name)).toEqual(['inbox-tests', 'inbox-backfill', 'inbox-replay', 'booking-link-sweep', 'booking-confirm-sweep']);
    expect(saved.s[3].start).toBe(mockStartSweep); // T16: retries owed booking-link replies
    expect(saved.s[4].start).toBe(mockStartConfirmSweep); // T18: finishes a booking's room and invites
    expect(saved.s[2].start).toBe(mockStartReplay); // T15: one boot pass over unprocessed stored events
    expect(saved.s[0].start).toBe(mockStartInboxTests);
    expect(saved.s[1].start).toBe(mockStartBackfill); // T13: it registers nothing while unconfigured (inboxBackfill.test.ts)
  });

  it('mounts every registered router, in order', () => {
    const app = express();
    const use = jest.spyOn(app, 'use');
    const a = Router(); const b = Router(); const c = Router();
    INTEGRATION_ROUTERS.push(a); PUBLIC_ROUTERS.push(b, c);
    mountPlacementIntegrations(app);
    mountPlacementPublic(app);
    expect(use.mock.calls.map((x) => x[0])).toEqual([a, b, c]);
  });

  it('starts the schema first, then every scheduler; one failing scheduler does not stop the others', async () => {
    const order: string[] = [];
    mockEnsure.mockReset().mockImplementation(async () => { order.push('schema'); });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    SCHEDULERS.push({ name: 'bad', start: () => { throw new Error('boom'); } }, { name: 'good', start: () => { order.push('good'); } });
    await startPlacement();
    expect(order).toEqual(['schema', 'good']);
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('placement_scheduler_start_failed');
  });
});
