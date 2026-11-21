const mockEnsure = jest.fn();
jest.mock('../../db/ensurePlacementSchema', () => ({ ensurePlacementSchema: (...a: unknown[]) => mockEnsure(...a) }));

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
  afterEach(() => { INTEGRATION_ROUTERS.length = 0; PUBLIC_ROUTERS.length = 0; SCHEDULERS.length = 0; jest.restoreAllMocks(); });

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
