import * as fs from 'fs';
import * as path from 'path';

const m = {
  leadFindByPk: jest.fn(),
  logFindAll: jest.fn(),
  logCount: jest.fn(),
  scheduledFindAll: jest.fn(),
  unsubFindAll: jest.fn(),
  prefFindAll: jest.fn(),
  evaluateConsent: jest.fn(),
};

jest.mock('../../../../models', () => ({
  Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
  CommunicationLog: {
    findAll: (...a: unknown[]) => m.logFindAll(...a),
    count: (...a: unknown[]) => m.logCount(...a),
  },
  ScheduledEmail: { findAll: (...a: unknown[]) => m.scheduledFindAll(...a) },
  UnsubscribeEvent: { findAll: (...a: unknown[]) => m.unsubFindAll(...a) },
  CommunicationPreference: { findAll: (...a: unknown[]) => m.prefFindAll(...a) },
}));

// The consent POLICY is mocked at its boundary — its own suite owns §4's rules.
// `channelSuppression` is deliberately NOT mocked: reusing the real per-channel
// cutoff logic is the point of this task, so the tests drive it with real rows.
jest.mock('../../../consentService', () => ({
  evaluateConsent: (...a: unknown[]) => m.evaluateConsent(...a),
}));

import { resolveContactEvidence } from '../contactEvidence';
import { SUPPRESSED_LEAD_STATUSES } from '../../../explorerGrowth/explorerContactabilityService';

/**
 * T304 — contact evidence.
 *
 * The property under test throughout: a channel is eligible only if every
 * evaluator says so, the evidence names WHICH evaluator refused, and anything
 * unreadable closes the channel rather than opening it.
 */

const ASOF = new Date('2026-09-14T12:00:00Z');
/** After the per-channel cutoff (2026-09-09), so channel scoping applies. */
const AFTER_CUTOFF = new Date('2026-09-12T00:00:00Z');
/** Before it, where an event suppresses globally by design. */
const BEFORE_CUTOFF = new Date('2026-08-01T00:00:00Z');

const args = (over: Record<string, unknown> = {}) => ({
  subject: { lead_id: 501, email: 'buyer@example.com', phone: '+15125550100' },
  brandId: 'b-ent',
  tenantId: 't-col',
  asOf: ASOF,
  ...over,
});

function arrange(over: Partial<Record<keyof typeof m, unknown>> = {}) {
  for (const fn of Object.values(m)) fn.mockReset();
  m.leadFindByPk.mockResolvedValue({ id: 501, status: 'new' });
  m.logFindAll.mockResolvedValue([]);
  m.logCount.mockResolvedValue(0);
  m.scheduledFindAll.mockResolvedValue([]);
  m.unsubFindAll.mockResolvedValue([]);
  m.prefFindAll.mockResolvedValue([]);
  m.evaluateConsent.mockResolvedValue({ verdict: 'allow', basis: 'opt_in_form', reason: 'granted', jurisdiction: 'US', hasRecord: true });
  for (const [k, v] of Object.entries(over)) {
    const fn = m[k as keyof typeof m];
    if (typeof v === 'function') fn.mockImplementation(v as never);
    else fn.mockResolvedValue(v);
  }
  jest.spyOn(console, 'warn').mockImplementation(() => {});
}

afterEach(() => jest.restoreAllMocks());

describe('per-channel suppression, using the real channelSuppression logic', () => {
  it('an SMS unsubscribe blocks SMS and leaves email alone', async () => {
    arrange({ unsubFindAll: [{ channel: 'sms', created_at: AFTER_CUTOFF }] });
    const e = await resolveContactEvidence(args());
    expect(e.channels.sms.eligible).toBe(false);
    expect(e.channels.sms.evaluator).toBe('suppression');
    expect(e.channels.email.eligible).toBe(true);
  });

  it('an event from BEFORE the per-channel cutoff blocks every channel, by design', async () => {
    // The legacy global case. `PER_CHANNEL_SUPPRESSION_CUTOFF` exists because
    // rows written before it carry no reliable channel, so they must be read as
    // "opted out of everything".
    arrange({ unsubFindAll: [{ channel: 'email', created_at: BEFORE_CUTOFF }] });
    const e = await resolveContactEvidence(args());
    for (const ch of ['email', 'sms', 'voice'] as const) {
      expect(e.channels[ch].eligible).toBe(false);
      expect(e.channels[ch].evaluator).toBe('suppression');
    }
  });

  it('an all-channels event blocks everything', async () => {
    arrange({ unsubFindAll: [{ channel: null, created_at: AFTER_CUTOFF }] });
    const e = await resolveContactEvidence(args());
    expect([e.channels.email.eligible, e.channels.sms.eligible, e.channels.voice.eligible]).toEqual([false, false, false]);
  });
});

describe('the brand-scoped preference table', () => {
  it('email_allowed false FOR THIS BRAND blocks email, naming the category', async () => {
    arrange({
      prefFindAll: [{ category: 'marketing', email_allowed: false, sms_allowed: true, voice_allowed: true }],
    });
    const e = await resolveContactEvidence(args());
    expect(e.channels.email.eligible).toBe(false);
    expect(e.channels.email.evaluator).toBe('brand_preference');
    expect(e.channels.email.reason).toBe('brand_preference_off:marketing');
    expect(e.channels.sms.eligible).toBe(true);
  });

  it('queries preferences scoped to the lead, tenant AND brand — another brand cannot block this one', async () => {
    // The control: the query itself must carry the brand. A resolver that read
    // every brand's preferences would let one brand silence another, which is
    // exactly what §3.3's isolation forbids.
    arrange();
    await resolveContactEvidence(args());
    expect(m.prefFindAll).toHaveBeenCalledWith({
      where: { lead_id: 501, tenant_id: 't-col', brand_id: 'b-ent' },
    });
  });

  it('the most restrictive row wins when a lead has several categories', async () => {
    arrange({
      prefFindAll: [
        { category: 'transactional', email_allowed: true, sms_allowed: true, voice_allowed: true },
        { category: 'marketing', email_allowed: false, sms_allowed: true, voice_allowed: true },
      ],
    });
    const e = await resolveContactEvidence(args());
    expect(e.channels.email.reason).toBe('brand_preference_off:marketing');
  });
});

describe('consent', () => {
  it('a revoked record blocks the channel and the evidence says consent answered', async () => {
    arrange({
      evaluateConsent: async ({ channel }: { channel: string }) =>
        channel === 'sms'
          ? { verdict: 'block', basis: 'none', reason: 'revoked', jurisdiction: 'US', hasRecord: true }
          : { verdict: 'allow', basis: 'opt_in_form', reason: 'granted', jurisdiction: 'US', hasRecord: true },
    });
    const e = await resolveContactEvidence(args());
    expect(e.channels.sms).toMatchObject({ eligible: false, reason: 'revoked', evaluator: 'consent' });
    expect(e.channels.email.eligible).toBe(true);
  });

  it('is asked once per consent-bearing channel, and never for in_app', async () => {
    arrange();
    await resolveContactEvidence(args());
    const asked = m.evaluateConsent.mock.calls.map((c) => (c[0] as { channel: string }).channel).sort();
    expect(asked).toEqual(['email', 'sms', 'voice']);
  });

  it('in_app needs no consent and is eligible on its own terms', async () => {
    arrange();
    const e = await resolveContactEvidence(args());
    expect(e.channels.in_app).toMatchObject({ eligible: true, evaluator: 'none' });
  });

  it('an action needing no channel is always eligible — there is nobody to protect', async () => {
    arrange({ unsubFindAll: [{ channel: null, created_at: AFTER_CUTOFF }] });
    const e = await resolveContactEvidence(args());
    expect(e.channels.none.eligible).toBe(true);
  });
});

describe('the lead itself', () => {
  it('a blocked lead status closes every channel, and the evaluator says so', async () => {
    arrange({ leadFindByPk: { id: 501, status: 'bounced' } });
    const e = await resolveContactEvidence(args());
    for (const ch of ['email', 'sms', 'voice', 'in_app'] as const) {
      expect(e.channels[ch]).toMatchObject({ eligible: false, reason: 'lead_bounced', evaluator: 'lead_status' });
    }
  });

  it('keeps no copy of the blocked-status list, and the one it uses is the strictest', () => {
    // There is nothing to drift any more: this module imports Explorer's list
    // instead of restating it. Two properties keep that true. First, the import
    // exists and no local list has crept back in. Second, Explorer's list still
    // covers every status the SEND boundary itself refuses - if the sender ever
    // refused something this list allowed, a decision could open a channel the
    // sender would reject, which is the failure the copy existed to prevent.
    const mine = fs.readFileSync(path.join(__dirname, '..', 'contactEvidence.ts'), 'utf8');
    expect(mine).toContain(
      "import { SUPPRESSED_LEAD_STATUSES } from '../../explorerGrowth/explorerContactabilityService'",
    );
    expect(mine).not.toMatch(/const [A-Z_]*LEAD_STATUSES\s*=\s*\[/);

    const sendPath = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'communicationSafetyService.ts'),
      'utf8',
    );
    const match = sendPath.match(/const blockedStatuses = \[([^\]]*)\]/);
    expect(match).not.toBeNull();
    const refusedBySender = (match?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .sort();
    expect(refusedBySender).toEqual(['bounced', 'dnd', 'unsubscribed']);
    for (const status of refusedBySender) {
      expect(SUPPRESSED_LEAD_STATUSES).toContain(status);
    }
    // And it is genuinely stricter, not merely equal.
    expect(SUPPRESSED_LEAD_STATUSES).toContain('complained');
  });

  it('a missing lead is not a clean slate', async () => {
    arrange({ leadFindByPk: null });
    const e = await resolveContactEvidence(args());
    expect(e.failed_closed).toBe(true);
    expect(e.channels.email.reason).toBe('lead_not_found');
  });

  it('a subject with no lead anchor fails closed without querying anything', async () => {
    arrange();
    const e = await resolveContactEvidence(args({ subject: { lead_id: null } }));
    expect(e.failed_closed).toBe(true);
    expect(e.channels.email.reason).toBe('no_lead_anchor');
    expect(m.leadFindByPk).not.toHaveBeenCalled();
  });
});

describe('history and cooldowns', () => {
  it('reports the last contact per channel and the overall gap in hours', async () => {
    arrange({
      logFindAll: [
        { channel: 'email', created_at: new Date('2026-09-14T06:00:00Z') },
        { channel: 'email', created_at: new Date('2026-09-01T06:00:00Z') },
        { channel: 'sms', created_at: new Date('2026-09-10T12:00:00Z') },
      ],
      logCount: 3,
    });
    const e = await resolveContactEvidence(args());
    expect(e.channels.email.last_contact_at).toEqual(new Date('2026-09-14T06:00:00Z'));
    expect(e.channels.email.hours_since_last_contact).toBe(6);
    expect(e.channels.sms.hours_since_last_contact).toBe(96); // 2026-09-10T12:00Z to 2026-09-14T12:00Z
    expect(e.recent_contact_count).toBe(3);
    expect(e.hours_since_last_contact).toBe(6);
  });

  it('counts only OUTBOUND contacts inside the seven-day window', async () => {
    arrange();
    await resolveContactEvidence(args());
    const countArgs = m.logCount.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(countArgs.where).toMatchObject({ lead_id: 501, direction: 'outbound' });
    expect(Object.keys(countArgs.where)).toContain('created_at');
  });

  it('never contacted means a null gap, not a zero one', async () => {
    arrange();
    const e = await resolveContactEvidence(args());
    expect(e.hours_since_last_contact).toBeNull();
    expect(e.channels.email.last_contact_at).toBeNull();
  });

  it('a send already queued blocks that channel — nothing else checks this today', async () => {
    arrange({ scheduledFindAll: [{ channel: 'email', status: 'pending' }] });
    const e = await resolveContactEvidence(args());
    expect(e.channels.email).toMatchObject({ eligible: false, reason: 'send_already_queued', evaluator: 'in_flight' });
    expect(e.channels.sms.eligible).toBe(true);
  });
});

describe('it fails closed, on every lookup', () => {
  const lookups: Array<keyof typeof m> = [
    'leadFindByPk',
    'logFindAll',
    'logCount',
    'scheduledFindAll',
    'unsubFindAll',
    'prefFindAll',
  ];

  for (const which of lookups) {
    it(`${which} throwing closes every channel, trips the cap AND the cooldown, and escapes nothing`, async () => {
      arrange({ [which]: () => Promise.reject(new Error('database unavailable')) } as never);
      const e = await resolveContactEvidence(args());

      expect(e.failed_closed).toBe(true);
      for (const ch of ['email', 'sms', 'voice', 'in_app', 'none'] as const) {
        expect(e.channels[ch]).toMatchObject({ eligible: false, evaluator: 'failed_closed' });
      }
      // Explorer's posture, deliberately mirrored: an unknown history must trip
      // the cap AND the cooldown. A large hours-since would read as "contacted
      // long ago", which is permission, not caution.
      expect(e.recent_contact_count).toBe(Number.MAX_SAFE_INTEGER);
      expect(e.hours_since_last_contact).toBe(0);

      const line = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('contact_evidence_failed'));
      expect(line).toBeDefined();
      expect(JSON.parse(line as string)).toMatchObject({ error_class: 'Error', brand_id: 'b-ent' });
    });
  }

  it('a consent evaluation that throws also fails closed', async () => {
    arrange({ evaluateConsent: () => Promise.reject(new Error('consent unavailable')) } as never);
    const e = await resolveContactEvidence(args());
    expect(e.failed_closed).toBe(true);
  });

  it('logs no address and no phone number', async () => {
    arrange({ leadFindByPk: () => Promise.reject(new Error('boom buyer@example.com +15125550100')) } as never);
    await resolveContactEvidence(args());
    const lines = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).not.toContain('buyer@example.com');
    expect(lines).not.toContain('5125550100');
  });
});

describe('the two answers this codebase cannot give', () => {
  it('reports human conversation and sales capacity as unknown, each with the reason why', async () => {
    arrange();
    const e = await resolveContactEvidence(args());
    expect(e.human_conversation).toBe('unknown');
    expect(e.human_conversation_reason).toMatch(/no source in this codebase/);
    expect(e.human_conversation_reason).toMatch(/inbox_emails has no lead_id/);
    expect(e.sales_capacity).toBe('unknown');
    expect(e.sales_capacity_reason).toMatch(/no sales capacity or assignment table/);
  });

  it('never invents a value for either, on any path', async () => {
    // Including the fail-closed path: "unknown" is the honest answer there too,
    // and the reason changes to say the evidence itself did not resolve.
    arrange({ prefFindAll: () => Promise.reject(new Error('nope')) } as never);
    const e = await resolveContactEvidence(args());
    expect(e.human_conversation).toBe('unknown');
    expect(e.sales_capacity).toBe('unknown');
    expect(e.human_conversation_reason).toMatch(/failed closed/);
  });
});
