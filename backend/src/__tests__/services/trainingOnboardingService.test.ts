/**
 * Training-signup onboarding (CC-20260712-q7m2).
 *
 * Proves the training.colaberry.com -> Explorer account + branded welcome flow:
 *  - master flag OFF = pure no-op (ships dark)
 *  - new lead = idempotent Explorer enrollment + magic-link welcome
 *  - duplicate/already-welcomed = no second account, no second email
 *  - failure-first = a send failure never stamps the marker (stays retryable)
 *    and never throws into the ingest path
 *  - the welcome HTML carries the portal link and escapes untrusted input
 */

// Silence structured-log output so test output stays clean.
jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

// Mutable env stub so each test can toggle the master flag.
const mockEnv = {
  trainingWelcomeEnabled: false,
  trainingWelcomeFromEmail: 'training@colaberry.com',
  trainingWelcomeFromName: 'Colaberry Training',
  trainingWelcomeTokenTtlDays: 30,
  explorerCohortName: 'Explorer — Prospects',
  frontendUrl: 'https://enterprise.colaberry.ai',
  emailFrom: 'enrollment@colaberry.com',
  mandrillApiKey: '',
  smtpUser: '',
  smtpPass: '',
};
jest.mock('../../config/env', () => ({ env: mockEnv }));

// Keep emailService's real HTML builder but stub the network sender.
const mockSendTrainingWelcome = jest.fn();
jest.mock('../../services/settingsService', () => ({
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false, email: '', phone: '' }),
  getSetting: jest.fn().mockResolvedValue(''),
}));
// emailService (loaded real, below, for its HTML builder) transitively imports
// launchSafety -> AiAgent model -> config/database on main. Stub it so requiring
// the real emailService in tests never opens a DB connection.
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../../services/emailService', () => {
  const actual = jest.requireActual('../../services/emailService');
  return { __esModule: true, ...actual, sendTrainingWelcome: (...a: any[]) => mockSendTrainingWelcome(...a) };
});

jest.mock('../../models', () => ({
  __esModule: true,
  Lead: { findByPk: jest.fn() },
  Enrollment: { findOrCreate: jest.fn() },
  Cohort: { findOne: jest.fn(), create: jest.fn() },
}));

import { Lead, Enrollment, Cohort } from '../../models';
import { buildTrainingWelcomeHtml } from '../../services/emailService';
import { provisionTrainingSignup, getOrCreateExplorerCohort } from '../../services/trainingOnboardingService';

const findByPk = Lead.findByPk as jest.Mock;
const findOrCreate = Enrollment.findOrCreate as jest.Mock;
const cohortFindOne = Cohort.findOne as jest.Mock;
const cohortCreate = Cohort.create as jest.Mock;

const LEAD = {
  id: 99,
  email: 'Jane@Acme.com',
  name: 'Jane Doe',
  company: 'Acme',
  title: 'VP Engineering',
  phone: '5551234',
  company_size: '201-500',
  source: 'training.colaberry.com',
};

function fakeEnrollment(overrides: Record<string, any> = {}) {
  return {
    id: 'enr-1',
    full_name: 'Jane Doe',
    intake_data_json: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  findByPk.mockReset();
  findOrCreate.mockReset();
  cohortFindOne.mockReset();
  cohortCreate.mockReset();
  mockSendTrainingWelcome.mockReset();
  mockEnv.trainingWelcomeEnabled = false;
  cohortFindOne.mockResolvedValue({ id: 'coh-explorer' });
});

afterAll(() => jest.restoreAllMocks());

/* ── Master flag gate ─────────────────────────────────────────────── */

describe('provisionTrainingSignup — master flag', () => {
  it('is a pure no-op when TRAINING_WELCOME_ENABLED is off', async () => {
    mockEnv.trainingWelcomeEnabled = false;
    const res = await provisionTrainingSignup(99);
    expect(res.status).toBe('disabled');
    expect(findByPk).not.toHaveBeenCalled();
    expect(findOrCreate).not.toHaveBeenCalled();
    expect(mockSendTrainingWelcome).not.toHaveBeenCalled();
  });
});

/* ── Happy path ───────────────────────────────────────────────────── */

describe('provisionTrainingSignup — new signup', () => {
  beforeEach(() => {
    mockEnv.trainingWelcomeEnabled = true;
    findByPk.mockResolvedValue(LEAD);
    mockSendTrainingWelcome.mockResolvedValue({ sent: true, messageId: 'm1' });
  });

  it('provisions an Explorer enrollment with portal access and sends the welcome', async () => {
    const enrollment = fakeEnrollment();
    findOrCreate.mockResolvedValue([enrollment, true]);

    const res = await provisionTrainingSignup(99, 'corr-1');

    expect(res.status).toBe('provisioned');
    expect(res.emailSent).toBe(true);

    // Idempotency key + prospect-safe defaults.
    const call = findOrCreate.mock.calls[0][0];
    expect(call.where).toEqual({ email: 'jane@acme.com', cohort_id: 'coh-explorer' });
    expect(call.defaults.portal_enabled).toBe(true);
    expect(call.defaults.payment_status).toBe('pending');
    expect(call.defaults.email).toBe('jane@acme.com');

    // A magic-link token was written, then the welcome fired with that link.
    const tokenUpdate = enrollment.update.mock.calls[0][0];
    expect(tokenUpdate.portal_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(tokenUpdate.portal_enabled).toBe(true);
    expect(tokenUpdate.portal_token_expires_at instanceof Date).toBe(true);

    const sendArg = mockSendTrainingWelcome.mock.calls[0][0];
    expect(sendArg.to).toBe('jane@acme.com');
    expect(sendArg.fullName).toBe('Jane Doe');
    expect(sendArg.portalLink).toContain('https://enterprise.colaberry.ai/portal/verify?token=');
    expect(sendArg.portalLink).toContain(tokenUpdate.portal_token);

    // Send-once marker stamped only after a confirmed send.
    const markerUpdate = enrollment.update.mock.calls[1][0];
    expect(markerUpdate.intake_data_json.training_welcome_sent_at).toBeTruthy();
  });

  it('sets a token TTL derived from env (30 days)', async () => {
    const enrollment = fakeEnrollment();
    findOrCreate.mockResolvedValue([enrollment, true]);
    const before = Date.now();
    await provisionTrainingSignup(99);
    const exp = enrollment.update.mock.calls[0][0].portal_token_expires_at as Date;
    const days = (exp.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
});

/* ── Idempotency ──────────────────────────────────────────────────── */

describe('provisionTrainingSignup — idempotency', () => {
  beforeEach(() => {
    mockEnv.trainingWelcomeEnabled = true;
    findByPk.mockResolvedValue(LEAD);
    mockSendTrainingWelcome.mockResolvedValue({ sent: true, messageId: 'm1' });
  });

  it('does not resend when the welcome marker is already set', async () => {
    const enrollment = fakeEnrollment({
      intake_data_json: { training_welcome_sent_at: '2026-07-01T00:00:00Z' },
    });
    findOrCreate.mockResolvedValue([enrollment, false]);

    const res = await provisionTrainingSignup(99);

    expect(res.status).toBe('already_welcomed');
    expect(mockSendTrainingWelcome).not.toHaveBeenCalled();
    expect(enrollment.update).not.toHaveBeenCalled(); // no new token, no marker
  });
});

/* ── Failure-first ────────────────────────────────────────────────── */

describe('provisionTrainingSignup — failure handling', () => {
  beforeEach(() => {
    mockEnv.trainingWelcomeEnabled = true;
    findByPk.mockResolvedValue(LEAD);
  });

  it('does not throw and does not stamp the marker when the send throws (retryable)', async () => {
    const enrollment = fakeEnrollment();
    findOrCreate.mockResolvedValue([enrollment, true]);
    mockSendTrainingWelcome.mockRejectedValue(new Error('SMTP down'));

    const res = await provisionTrainingSignup(99);

    expect(res.status).toBe('error');
    // Only the token update ran; the marker update never happened.
    const markerStamped = enrollment.update.mock.calls.some(
      (c: any[]) => c[0]?.intake_data_json?.training_welcome_sent_at
    );
    expect(markerStamped).toBe(false);
  });

  it('does not stamp the marker when the send reports not-sent (SMTP unconfigured)', async () => {
    const enrollment = fakeEnrollment();
    findOrCreate.mockResolvedValue([enrollment, true]);
    mockSendTrainingWelcome.mockResolvedValue({ sent: false });

    const res = await provisionTrainingSignup(99);

    expect(res.status).toBe('provisioned');
    expect(res.emailSent).toBe(false);
    const markerStamped = enrollment.update.mock.calls.some(
      (c: any[]) => c[0]?.intake_data_json?.training_welcome_sent_at
    );
    expect(markerStamped).toBe(false);
  });

  it('returns lead_not_found without touching enrollment when the lead is missing', async () => {
    mockEnv.trainingWelcomeEnabled = true;
    findByPk.mockResolvedValue(null);
    const res = await provisionTrainingSignup(12345);
    expect(res.status).toBe('lead_not_found');
    expect(findOrCreate).not.toHaveBeenCalled();
    expect(mockSendTrainingWelcome).not.toHaveBeenCalled();
  });
});

/* ── Explorer cohort ──────────────────────────────────────────────── */

describe('getOrCreateExplorerCohort', () => {
  it('reuses the existing explorer cohort when present', async () => {
    cohortFindOne.mockResolvedValue({ id: 'coh-explorer' });
    const c = await getOrCreateExplorerCohort();
    expect((c as any).id).toBe('coh-explorer');
    expect(cohortCreate).not.toHaveBeenCalled();
  });

  it('creates a standing explorer cohort (open, cohort_type=explorer) when none exists', async () => {
    cohortFindOne.mockResolvedValue(null);
    cohortCreate.mockResolvedValue({ id: 'coh-new' });
    const c = await getOrCreateExplorerCohort();
    expect((c as any).id).toBe('coh-new');
    const args = cohortCreate.mock.calls[0][0];
    expect(args.cohort_type).toBe('explorer');
    expect(args.status).toBe('open');
    expect(args.seats_taken).toBe(0);
  });
});

/* ── Welcome HTML ─────────────────────────────────────────────────── */

describe('buildTrainingWelcomeHtml', () => {
  const link = 'https://enterprise.colaberry.ai/portal/verify?token=abc-123';

  it('renders the first name, portal CTA, and reply-context footer', () => {
    const html = buildTrainingWelcomeHtml({ to: 'x@y.com', fullName: 'Jane Doe', portalLink: link });
    expect(html).toContain('Jane'); // first name only
    expect(html).not.toContain('Jane Doe Doe');
    expect(html).toContain(link);
    expect(html).toContain('Access Your Portal');
    expect(html).toContain('training.colaberry.com'); // footer context line
  });

  it('escapes untrusted name input (no raw HTML injection)', () => {
    const html = buildTrainingWelcomeHtml({
      to: 'x@y.com',
      fullName: '<script>alert(1)</script>',
      portalLink: link,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('falls back to a friendly greeting when the name is blank', () => {
    const html = buildTrainingWelcomeHtml({ to: 'x@y.com', fullName: '', portalLink: link });
    expect(html).toContain('there');
  });
});
