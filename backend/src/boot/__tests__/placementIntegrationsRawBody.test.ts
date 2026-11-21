const mockAccept = jest.fn();
jest.mock('../../services/placement/inboxEvents', () => ({ acceptInboxEvent: (...a: unknown[]) => mockAccept(...a) }));
// The public router's own services are not under test here; only the mount order is.
jest.mock('../../services/placement/inboxService', () => ({ getInbox: jest.fn(), saveInboxAddress: jest.fn(), listReceived: jest.fn() }));
jest.mock('../../services/placement/inboxTestJob', () => ({ sendTest: jest.fn(), startInboxTestCron: jest.fn() }));

import express, { Router } from 'express';
import request from 'supertest';
import { mountPlacementIntegrations, mountPlacementPublic, PUBLIC_ROUTERS } from '../placementBoot';
import { signInboxRequest } from '../../services/placement/inboxSignature';

/**
 * CP6.2 (T12): the REAL placement mount helpers, called in server.ts's order (placementBootOrder.test.ts proves that
 * order in server.ts itself): mountPlacementIntegrations, then the same global express.json({ limit: '5mb' }), then
 * mountPlacementPublic. A request signed over its exact bytes passes; the same JSON with other whitespace does not, so
 * the global JSON parser never touched the integration route's body. A JSON route mounted after it still parses.
 */
const SECRET = ['raw', 'body', 'order'].join('-');
const EVENT = { event_id: 'evt-1', message_id: '<m1@x>', type: 'email.classified', to_address: 'ann.lee.careers@gmail.com', received_at: '2026-11-21T18:00:00Z' };
function serverOrderApp(): express.Express {
  const app = express();
  mountPlacementIntegrations(app);
  app.use(express.json({ limit: '5mb' }));
  mountPlacementPublic(app);
  return app;
}
const ts = () => String(Math.floor(Date.now() / 1000));

let probe: Router;
beforeEach(() => {
  process.env.INBOX_INTEGRATION_SECRET = SECRET;
  mockAccept.mockReset().mockResolvedValue({ duplicate: false });
  for (const k of ['log', 'warn'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
  probe = Router();
  probe.post('/api/probe-json', (req, res) => { res.json({ got: req.body }); });
  PUBLIC_ROUTERS.push(probe);
});
afterEach(() => { PUBLIC_ROUTERS.splice(PUBLIC_ROUTERS.indexOf(probe), 1); delete process.env.INBOX_INTEGRATION_SECRET; jest.restoreAllMocks(); });

describe('placement integrations see the raw bytes in the real mount order', () => {
  it('signed over the exact bytes: 202', async () => {
    const body = JSON.stringify(EVENT); const t = ts();
    const res = await request(serverOrderApp()).post('/api/integrations/inbox/events').set('Content-Type', 'application/json')
      .set('X-Timestamp', t).set('X-Signature', signInboxRequest(SECRET, t, body)).send(body);
    expect(res.status).toBe(202);
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });
  it('the same JSON re-serialized with other whitespace, same signature header: 401', async () => {
    const body = JSON.stringify(EVENT); const t = ts();
    const res = await request(serverOrderApp()).post('/api/integrations/inbox/events').set('Content-Type', 'application/json')
      .set('X-Timestamp', t).set('X-Signature', signInboxRequest(SECRET, t, body)).send(JSON.stringify(EVENT, null, 1));
    expect(res.status).toBe(401);
    expect(mockAccept).not.toHaveBeenCalled();
  });
  it('a JSON route mounted after the integrations still gets its parsed body', async () => {
    const res = await request(serverOrderApp()).post('/api/probe-json').send({ a: 1 });
    expect(res.body).toEqual({ got: { a: 1 } });
  });
});
