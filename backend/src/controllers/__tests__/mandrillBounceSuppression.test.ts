import express from 'express';
import request from 'supertest';

const leadUpdate = jest.fn();
const leadFindByPk = jest.fn();
const scheduledEmailFindByPk = jest.fn();
const recordWebhookOutcome = jest.fn();
const processOptOut = jest.fn();

jest.mock('../../models', () => ({
  Lead: {
    update: (...a: unknown[]) => leadUpdate(...a),
    findByPk: (...a: unknown[]) => leadFindByPk(...a),
  },
  InteractionOutcome: {},
  CampaignLead: { update: jest.fn() },
  CampaignSimulation: { findOne: jest.fn() },
  CampaignSimulationStep: { findOne: jest.fn() },
  CommunicationLog: { create: jest.fn(), findOne: jest.fn() },
}));

jest.mock('../../models/ScheduledEmail', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => scheduledEmailFindByPk(...a) },
}));

jest.mock('../../services/interactionService', () => ({
  recordWebhookOutcome: (...a: unknown[]) => recordWebhookOutcome(...a),
}));

jest.mock('../../services/unsubscribeEnforcementService', () => ({
  processOptOut: (...a: unknown[]) => processOptOut(...a),
}));

jest.mock('../../services/activityService', () => ({ logActivity: jest.fn() }));
jest.mock('../../services/communicationLogService', () => ({ logCommunication: jest.fn() }));

const SCHEDULED_EMAIL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD_ID = 7788;

/**
 * Built once. The first `import('../mandrillWebhookController')` pulls in a
 * large module graph and on a loaded machine exceeds jest's 5s default all by
 * itself — which shows up as the FIRST test timing out while every later one
 * passes, a misleading signal that looks like a logic failure.
 */
let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.urlencoded({ extended: true }));
  const mod = await import('../mandrillWebhookController');
  app.post('/webhook', mod.handleMandrillWebhook);
}, 60_000);

function mandrillEvent(eventType: string) {
  return [
    {
      event: eventType,
      ts: 1760000000,
      msg: { email: 'someone@example.com', metadata: { scheduled_email_id: SCHEDULED_EMAIL_ID } },
    },
  ];
}

async function post(eventType: string) {
  return request(app)
    .post('/webhook')
    .type('form')
    .send({ mandrill_events: JSON.stringify(mandrillEvent(eventType)) });
}

beforeEach(() => {
  [leadUpdate, leadFindByPk, scheduledEmailFindByPk, recordWebhookOutcome, processOptOut].forEach(
    (m) => m.mockReset(),
  );
  recordWebhookOutcome.mockResolvedValue(undefined);
  processOptOut.mockResolvedValue(undefined);
  leadUpdate.mockResolvedValue([1]);
  scheduledEmailFindByPk.mockResolvedValue({ id: SCHEDULED_EMAIL_ID, lead_id: LEAD_ID });
  leadFindByPk.mockResolvedValue({ id: LEAD_ID, status: 'new' });
  // The controller verifies a signature only when MANDRILL_WEBHOOK_KEY is set.
  delete process.env.MANDRILL_WEBHOOK_KEY;
});

describe('D2 — hard bounce suppresses the lead globally', () => {
  it('sets Lead.status = bounced on hard_bounce', async () => {
    const res = await post('hard_bounce');
    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledWith({ status: 'bounced' }, { where: { id: LEAD_ID } });
  });

  it('also suppresses on reject — a provider-side permanent suppression', async () => {
    const res = await post('reject');
    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledWith({ status: 'bounced' }, { where: { id: LEAD_ID } });
  });

  // THE boundary case. A soft bounce is transient (full mailbox, temporary
  // server fault). Suppressing on it would silently discard recoverable
  // recipients — a worse failure than the bug this task fixes.
  it('does NOT suppress on soft_bounce', async () => {
    const res = await post('soft_bounce');
    expect(res.status).toBe(200);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('does not suppress on open or click', async () => {
    await post('open');
    await post('click');
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});

describe('D2 — never downgrade a stronger, user-expressed suppression', () => {
  it.each(['unsubscribed', 'dnd'])(
    'leaves a lead already marked %s untouched',
    async (status) => {
      // 'bounced' is a mechanical fact; 'unsubscribed'/'dnd' are decisions the
      // person made. Overwriting the latter with the former would lose the
      // reason we must never contact them again.
      leadFindByPk.mockResolvedValue({ id: LEAD_ID, status });
      const res = await post('hard_bounce');
      expect(res.status).toBe(200);
      expect(leadUpdate).not.toHaveBeenCalled();
    },
  );
});

describe('D2 — failure paths must not break the webhook', () => {
  it('still returns 200 when the Lead update throws', async () => {
    // Mandrill retries on a non-200. A retry storm is worse than a delayed
    // suppression, so this must degrade quietly.
    leadUpdate.mockRejectedValue(new Error('deadlock detected'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await post('hard_bounce');

    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(
      '[MandrillWebhook] Bounce suppression failed:',
      'deadlock detected',
    );
    warn.mockRestore();
  });

  it('returns 200 and suppresses nothing when the lead cannot be found', async () => {
    leadFindByPk.mockResolvedValue(null);
    const res = await post('hard_bounce');
    expect(res.status).toBe(200);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('still records the interaction outcome alongside the suppression', async () => {
    await post('hard_bounce');
    expect(recordWebhookOutcome).toHaveBeenCalledWith(
      SCHEDULED_EMAIL_ID,
      'bounced',
      expect.objectContaining({ mandrill_event: 'hard_bounce' }),
    );
  });
});
