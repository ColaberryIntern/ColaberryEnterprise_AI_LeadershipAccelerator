/**
 * STORY-001 acceptance, demonstrated end to end through the real HTTP surface.
 *
 * This test deliberately mocks as little as possible. The Express routes, the
 * controller, sponsorAuthService, sponsorAuditService and the real
 * emailService all execute. Only three things are stubbed, and each is a hard
 * external boundary rather than a piece of our logic:
 *
 *   - nodemailer      : so no mail actually leaves the machine. We read the
 *                       real generated HTML out of the captured sendMail call,
 *                       which is how the magic link URL is proven, not assumed.
 *   - Sequelize models: no database in unit-test CI.
 *   - settings/launch : both are DB-backed lookups on the email path.
 *
 * The three acceptance criteria map to the three describe blocks below.
 */

// --- external boundaries -------------------------------------------------

const sentMail: Array<Record<string, any>> = [];

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: () => ({
      sendMail: jest.fn(async (options: Record<string, any>) => {
        sentMail.push(options);
        return { messageId: 'test-message-id', accepted: [options.to] };
      }),
    }),
  },
}));

jest.mock('../../services/settingsService', () => ({
  __esModule: true,
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false, email: '' }),
  getSetting: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../services/launchSafety', () => ({
  __esModule: true,
  isKillSwitchActive: jest.fn().mockResolvedValue(false),
}));

// --- persistence ---------------------------------------------------------

// A tiny in-memory stand-in for the two tables the flow writes to, so the test
// can assert on real end state (one lead, one sponsor, N audit rows) instead of
// on call counts.
const db = {
  leads: [] as Array<Record<string, any>>,
  sponsors: [] as Array<Record<string, any>>,
  auditRows: [] as Array<Record<string, any>>,
};

jest.mock('../../models', () => ({
  __esModule: true,
  Lead: {
    findOrCreate: jest.fn(async ({ where, defaults }: any) => {
      const existing = db.leads.find((l) => l.email === where.email);
      if (existing) return [existing, false];
      const lead = { id: db.leads.length + 1, ...defaults };
      db.leads.push(lead);
      return [lead, true];
    }),
  },
}));

jest.mock('../../models/Sponsor', () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn(async ({ where, defaults }: any) => {
      const existing = db.sponsors.find((s) => s.contact_lead_id === where.contact_lead_id);
      if (existing) return [existing, false];
      const sponsor: any = {
        id: `sp-${db.sponsors.length + 1}`,
        portal_token: null,
        portal_token_expires_at: null,
        ...defaults,
      };
      sponsor.update = async (values: Record<string, unknown>) => Object.assign(sponsor, values);
      db.sponsors.push(sponsor);
      return [sponsor, true];
    }),
    // Mirrors the real query: matching token AND not yet expired.
    findOne: jest.fn(async ({ where }: any) => {
      const token = where.portal_token;
      const found = db.sponsors.find((s) => s.portal_token === token);
      if (!found) return null;
      const expiry: Date | null = found.portal_token_expires_at;
      if (!expiry || expiry.getTime() <= Date.now()) return null;
      return found;
    }),
  },
}));

jest.mock('../../models/SponsorPortalAuditLog', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (row: Record<string, any>) => {
      db.auditRows.push(row);
      return row;
    }),
  },
}));

// The magic-link email only builds when a transport is configured, and the link
// host comes from FRONTEND_URL. Both are read when config/env is first imported,
// so they must be set before the requires below — which is why this file uses
// inline requires rather than top-level imports for the app under test.
process.env.MANDRILL_API_KEY = 'test-mandrill-key';
process.env.FRONTEND_URL = 'https://enterprise.colaberry.ai';

import express, { Express } from 'express';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-var-requires */
// `require` (not import) so the process.env writes above land first. Typed as
// the handler signatures we use, which is all this test needs.
const {
  handleRequestSponsorLink,
  handleVerifySponsorToken,
} = require('../../controllers/sponsorController');
/* eslint-enable @typescript-eslint/no-var-requires */

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Same paths leadRoutes registers. The rate limiter is intentionally left off:
  // it caps this endpoint at 5 requests per 15 minutes per IP, which would make
  // a multi-step flow test fail on request six for reasons unrelated to STORY-001.
  app.post('/api/sponsor/request-link', handleRequestSponsorLink);
  app.get('/api/sponsor/verify', handleVerifySponsorToken);
  return app;
}

/** Pull the dashboard URL out of the HTML we actually generated. */
function magicLinkFromLastEmail(): string {
  const last = sentMail[sentMail.length - 1];
  const match = String(last?.html || '').match(/https:\/\/[^"'\s]*\/sponsor\/dashboard\?token=[^"'\s]+/);
  if (!match) throw new Error('No sponsor dashboard link found in the sent email HTML');
  return match[0];
}

beforeEach(() => {
  db.leads = [];
  db.sponsors = [];
  db.auditRows = [];
  sentMail.length = 0;
  jest.clearAllMocks();
});

describe('AC1 — a manager fills the form and receives a magic link by email', () => {
  it('accepts the form and emails a working /sponsor/dashboard link', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/sponsor/request-link')
      .send({ email: 'jordan.lee@acme-corp.com', company_name: 'Acme Corp' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/check your email/i);

    // Exactly one email, addressed to the manager.
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe('jordan.lee@acme-corp.com');
    expect(sentMail[0].subject).toMatch(/sponsor dashboard access link/i);

    // The link in that email is the real REQ-001 destination.
    const link = magicLinkFromLastEmail();
    expect(link.startsWith('https://enterprise.colaberry.ai/sponsor/dashboard?token=')).toBe(true);

    // The emailed token is the token that was persisted.
    const token = new URL(link).searchParams.get('token');
    expect(token).toBeTruthy();
    expect(db.sponsors[0].portal_token).toBe(token);

    // The account was created self-serve, from nothing.
    expect(db.leads).toHaveLength(1);
    expect(db.sponsors).toHaveLength(1);
    expect(db.sponsors[0].company_name).toBe('Acme Corp');
  });

  it('rejects a malformed email with a 400 and sends nothing', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/sponsor/request-link').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(sentMail).toHaveLength(0);
    expect(db.leads).toHaveLength(0);
  });

  it('is idempotent: submitting twice yields one account and one live token', async () => {
    const app = buildApp();
    const body = { email: 'jordan@acme.com' };

    await request(app).post('/api/sponsor/request-link').send(body).expect(200);
    const firstLink = magicLinkFromLastEmail();

    await request(app).post('/api/sponsor/request-link').send(body).expect(200);
    const secondLink = magicLinkFromLastEmail();

    expect(db.leads).toHaveLength(1);
    expect(db.sponsors).toHaveLength(1);
    // Same link both times — the first email a manager opens still works.
    expect(secondLink).toBe(firstLink);
  });
});

describe('AC2 — clicking the magic link lands the manager on the dashboard', () => {
  it('exchanges the emailed token for a dashboard session', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/sponsor/request-link')
      .send({ email: 'jordan@acme.com', company_name: 'Acme Corp' })
      .expect(200);

    // Follow the link exactly as the browser would: same token, same query param.
    const token = new URL(magicLinkFromLastEmail()).searchParams.get('token');
    const res = await request(app).get('/api/sponsor/verify').query({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sponsor_id: db.sponsors[0].id,
      access_token: token,
      company_name: 'Acme Corp',
    });
  });

  it('401s an expired link instead of granting a session', async () => {
    const app = buildApp();
    await request(app).post('/api/sponsor/request-link').send({ email: 'jordan@acme.com' }).expect(200);
    const token = new URL(magicLinkFromLastEmail()).searchParams.get('token');

    // Wind the stored expiry into the past — the "link expired" failure path.
    db.sponsors[0].portal_token_expires_at = new Date(Date.now() - 1000);

    const res = await request(app).get('/api/sponsor/verify').query({ token });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired link' });
  });

  it('401s a token that was never issued', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/sponsor/verify')
      .query({ token: '7a1f9c2e-0000-4000-8000-1234567890ab' });
    expect(res.status).toBe(401);
  });

  // Regression from a live dev run: these returned 500 and wrote no audit row,
  // because portal_token is a UUID column and Postgres rejects a malformed
  // literal outright. A missing or junk token is a bad link, not a server fault.
  it.each([
    ['no token at all', undefined],
    ['an empty token', ''],
    ['a non-UUID token', 'garbage'],
  ])('401s %s rather than 500ing', async (_label, badToken) => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/sponsor/verify')
      .query(badToken === undefined ? {} : { token: badToken });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired link' });
    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({
      event: 'link_rejected',
      metadata: { reason: 'malformed_token' },
    });
  });
});

describe('AC3 (trust) — generation and access are recorded for audit', () => {
  it('writes link_generated on issue and link_accessed on a successful click', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/sponsor/request-link')
      .send({ email: 'jordan.lee@acme-corp.com' })
      .expect(200);

    const token = new URL(magicLinkFromLastEmail()).searchParams.get('token');
    await request(app).get('/api/sponsor/verify').query({ token }).expect(200);

    expect(db.auditRows.map((r) => r.event)).toEqual(['link_generated', 'link_accessed']);

    const [generated, accessed] = db.auditRows;
    expect(generated).toMatchObject({
      sponsor_id: db.sponsors[0].id,
      lead_id: db.leads[0].id,
      email_redacted: 'j***@acme-corp.com',
    });
    // Same token on both events, so an access can be traced to its issue.
    expect(accessed.token_fingerprint).toBe(generated.token_fingerprint);

    // The audit trail is not a credential store.
    const serialized = JSON.stringify(db.auditRows);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain('jordan.lee@acme-corp.com');
  });

  it('writes link_rejected when a dead link is clicked', async () => {
    const app = buildApp();
    // UUID-shaped but never issued — exercises the database lookup miss, not
    // the malformed-token guard covered separately above.
    await request(app)
      .get('/api/sponsor/verify')
      .query({ token: '7a1f9c2e-2222-4000-8000-1234567890ab' })
      .expect(401);

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({
      event: 'link_rejected',
      sponsor_id: null,
      metadata: { reason: 'unknown_or_expired_token' },
    });
  });

  it('records the request origin so an access can be attributed', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/sponsor/request-link')
      .set('User-Agent', 'Mozilla/5.0 (STORY-001 demo)')
      .send({ email: 'jordan@acme.com' })
      .expect(200);

    expect(db.auditRows[0].user_agent).toBe('Mozilla/5.0 (STORY-001 demo)');
    expect(db.auditRows[0].ip_address).toBeTruthy();
  });
});
