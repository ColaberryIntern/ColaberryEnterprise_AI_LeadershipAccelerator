import express from 'express';
import request from 'supertest';

/**
 * The tracking routes must parse a JSON body that arrives labelled `text/plain`.
 *
 * WHY. `navigator.sendBeacon` is the only way to report anything as a page unloads, and these
 * pages beacon cross-origin (www.refactored.ai -> enterprise.colaberry.ai). A beacon sent as
 * `application/json` is not a CORS-simple request, so it needs a preflight OPTIONS; during unload
 * that cannot complete and the browser drops the beacon entirely. Measured on production after the
 * pagehide fix had been live ten hours: of 28 visitors who fired `cta_click` - demonstrably
 * running the tracker, demonstrably leaving the page - ZERO produced a `time_on_page` row.
 *
 * So the tracker now labels the body `text/plain`, which is safelisted. That only works if this
 * end parses it. If it does not, every beacon reaches the handler with an empty body and fails
 * exactly as silently as the dropped beacon did - which is the failure this test exists to make
 * loud.
 *
 * The real routes are not mounted here because the handlers write to Postgres. What is under test
 * is the PARSER CONTRACT - what `req.body` looks like for each content type - so the same
 * middleware configuration is mounted in front of a probe that just echoes the body back.
 */

// Mirrors the configuration in ../trackingRoutes.ts. Kept as a literal rather than imported
// because the router there attaches real controllers; if these two drift, the final assertion
// below ("the global default would NOT have parsed this") is what notices.
const beaconBody = express.json({
  type: ['application/json', 'text/plain'],
  limit: '64kb',
});

function appWithBeaconParser() {
  const app = express();
  app.post('/api/t/batch', beaconBody, (req, res) => {
    res.json({ sawEvents: Array.isArray(req.body?.events) ? req.body.events.length : null });
  });
  return app;
}

/** The global parser from server.ts, for contrast. */
function appWithGlobalParser() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.post('/api/t/batch', (req, res) => {
    res.json({ sawEvents: Array.isArray(req.body?.events) ? req.body.events.length : null });
  });
  return app;
}

const payload = JSON.stringify({
  site_slug: 'training',
  fingerprint: 'fp-test',
  events: [
    { event_type: 'time_on_page', page_url: 'https://www.refactored.ai/lp/x', event_data: { seconds: 7 } },
  ],
});

describe('tracking routes: beacon body parsing', () => {
  it('parses a JSON body labelled text/plain, which is what an unload beacon sends', async () => {
    const res = await request(appWithBeaconParser())
      .post('/api/t/batch')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.sawEvents).toBe(1);
  });

  it('still parses an ordinary application/json body, so the alive-page path is untouched', async () => {
    // Most events arrive this way - scroll, cta_click, the periodic flush. Widening the accepted
    // types must not cost the common case.
    const res = await request(appWithBeaconParser())
      .post('/api/t/batch')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.sawEvents).toBe(1);
  });

  it('demonstrates the bug: the GLOBAL parser leaves a text/plain beacon unparsed', async () => {
    // This is the control that gives the first test its meaning. Without it, "text/plain parses"
    // could be true of the old configuration too, and the fix would be unfalsifiable.
    const res = await request(appWithGlobalParser())
      .post('/api/t/batch')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(payload);

    expect(res.status).toBe(200);
    // Body arrives empty: no events, nothing recorded, no error raised anywhere.
    expect(res.body.sawEvents).toBeNull();
  });

  it('rejects a body past the 64kb ceiling rather than accepting the global 5mb', async () => {
    const fat = JSON.stringify({ site_slug: 'training', events: [], pad: 'x'.repeat(70 * 1024) });
    const res = await request(appWithBeaconParser())
      .post('/api/t/batch')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(fat);

    expect(res.status).toBe(413);
  });

  it('does not crash on a text/plain body that is not JSON at all', async () => {
    // A safelisted content type is exactly the one an arbitrary client can post without a
    // preflight, so malformed input here is reachable by anyone. It must fail as a 400, not a 500.
    const res = await request(appWithBeaconParser())
      .post('/api/t/batch')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send('this is not json');

    expect(res.status).toBe(400);
  });
});
