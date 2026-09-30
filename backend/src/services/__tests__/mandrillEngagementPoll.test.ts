/**
 * The Mandrill poll's one decision: which sent email does an open belong to?
 *
 * The production case this guards (2026-09-11): a campaign email showing
 * "7 opens & clicks" whose outcomes all carried metadata.subject of the lead's
 * LOGIN emails. The old poll pinned every open to the most recent send.
 */
import { Op } from 'sequelize';
import {
  CAMPAIGN_TAG,
  SEARCH_LIMIT,
  buildSearchRequest,
  clickedUrls,
  dedupWhere,
  normaliseSubject,
  recordMandrillEngagement,
  searchSaturated,
  searchWindowStart,
  sentEmailWhere,
  type MandrillSearchMessage,
  type PollStores,
  type SentEmailRef,
} from '../mandrillEngagementPoll';

const SINCE = new Date('2026-09-11T00:00:00Z');
const CAMPAIGN_EMAIL: SentEmailRef = { id: 'se-campaign', campaign_id: 'camp-1', step_index: 2 };

/**
 * A fake store that resolves the subject match the way Postgres would: the
 * where-clause is opaque Sequelize AST, so the fake keys on the subject string
 * handed to `Sequelize.where(...)`, which is the last element of the AND.
 */
function fakeStores(opts: {
  leadFor?: Record<string, number>;
  sentBySubject?: Record<string, SentEmailRef>;
  existing?: Array<{ lead_id: number; outcome: string; subject: string | null }>;
}) {
  const created: Array<Record<string, any>> = [];
  const leadFor = opts.leadFor ?? {};
  const sentBySubject = opts.sentBySubject ?? {};
  const existing = opts.existing ?? [];

  const subjectFromWhere = (where: any): string | null => {
    const clause = where[Op.and]?.[0];
    // Sequelize.where(attr, value) stores the comparison value on `.logic` (v6);
    // a null there is the IS NULL case and must stay null, not fall through.
    if (!clause) return null;
    const v = clause.logic;
    return v === null || v === undefined ? null : String(v);
  };

  const stores: PollStores = {
    Lead: {
      findOne: async ({ where }: any) => (leadFor[where.email] ? { id: leadFor[where.email] } : null),
    },
    ScheduledEmail: {
      findOne: async ({ where }: any) => {
        const subject = subjectFromWhere(where);
        return subject !== null ? (sentBySubject[subject] ?? null) : null;
      },
    },
    InteractionOutcome: {
      findOne: async ({ where }: any) => {
        const subject = subjectFromWhere(where);
        const hit = [...existing, ...created].find(
          (r) => r.lead_id === where.lead_id && r.outcome === where.outcome
            && (r.subject ?? r.metadata?.subject ?? null) === subject,
        );
        return hit ?? null;
      },
      create: async (row: any) => { created.push(row); return row; },
    },
  };
  return { stores, created };
}

const msg = (over: Partial<MandrillSearchMessage>): MandrillSearchMessage => ({
  _id: 'm1', ts: 1_757_600_000, email: 'Lead@Example.com', subject: 'Strengthen Your Career with the Alumni AI Champion Program',
  opens: 1, clicks: 0, ...over,
});

describe('recordMandrillEngagement', () => {
  it('attributes an open to the sent email whose subject matches, case- and whitespace-insensitively', async () => {
    const { stores, created } = fakeStores({
      leadFor: { 'lead@example.com': 7 },
      sentBySubject: { 'strengthen your career with the alumni ai champion program': CAMPAIGN_EMAIL },
    });
    const summary = await recordMandrillEngagement(
      [msg({ subject: '  Strengthen Your Career with the Alumni AI Champion Program ' })], stores, SINCE,
    );
    expect(summary).toMatchObject({ seen: 1, matchedLeads: 1, opens: 1, clicks: 0, unattributed: 0, failed: 0 });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      lead_id: 7, outcome: 'opened', channel: 'email',
      scheduled_email_id: 'se-campaign', campaign_id: 'camp-1', step_index: 2,
      metadata: { source: 'mandrill_poll', attribution: 'subject_match', mandrill_id: 'm1', mandrill_ts: 1_757_600_000 },
    });
    // The subject is stored trimmed, so the dedup key is stable across polls.
    expect(created[0].metadata.subject).toBe('Strengthen Your Career with the Alumni AI Champion Program');
  });

  it('records a login-email open against the lead with NO campaign, never against the latest campaign send', async () => {
    // The production defect: the lead has a sent campaign email; Mandrill
    // reports an open on a login email this platform did not send.
    const { stores, created } = fakeStores({
      leadFor: { 'lead@example.com': 7 },
      sentBySubject: { 'strengthen your career with the alumni ai champion program': CAMPAIGN_EMAIL },
    });
    const summary = await recordMandrillEngagement(
      [msg({ subject: 'Log into your ColaberryApp Account', opens: 3, clicks: 1, clicks_detail: [{ url: 'https://app.colaberry.com/login?t=abc' }] })],
      stores, SINCE,
    );
    expect(summary).toMatchObject({ opens: 1, clicks: 1, unattributed: 1 });
    expect(created).toHaveLength(2);
    for (const row of created) {
      expect(row.scheduled_email_id).toBeNull();
      expect(row.campaign_id).toBeNull();
      expect(row.step_index).toBe(0);
      expect(row.metadata.attribution).toBe('no_matching_send');
      expect(row.metadata.subject).toBe('Log into your ColaberryApp Account');
    }
    // What was clicked is now recorded, so the question can be answered.
    const click = created.find((r) => r.outcome === 'clicked')!;
    // Masked at write time: the login token never reaches the row.
    expect(click.metadata.clicked_urls).toEqual(['https://app.colaberry.com/login?t=***']);
    expect(created.find((r) => r.outcome === 'opened')!.metadata.clicked_urls).toBeUndefined();
  });

  it('dedups on subject, so two different emails opened the same day are both recorded', async () => {
    const { stores, created } = fakeStores({
      leadFor: { 'lead@example.com': 7 },
      sentBySubject: { 'strengthen your career with the alumni ai champion program': CAMPAIGN_EMAIL },
    });
    const first = msg({ _id: 'm1' });
    const second = msg({ _id: 'm2', subject: 'Log into your ColaberryApp Account' });
    const a = await recordMandrillEngagement([first, second], stores, SINCE);
    expect(a.opens).toBe(2);
    // Idempotency: the same page offered again 30 minutes later records nothing new.
    const b = await recordMandrillEngagement([first, second], stores, SINCE);
    expect(b.opens).toBe(0);
    expect(created).toHaveLength(2);
  });

  it('skips messages with no engagement and recipients who are not leads without touching the stores', async () => {
    const seen: string[] = [];
    const { stores } = fakeStores({ leadFor: { 'lead@example.com': 7 } });
    stores.ScheduledEmail.findOne = async () => { seen.push('scheduled'); return null; };
    const summary = await recordMandrillEngagement([
      msg({ opens: 0, clicks: 0 }),
      msg({ email: 'stranger@example.com' }),
    ], stores, SINCE);
    expect(summary).toMatchObject({ seen: 2, matchedLeads: 0, opens: 0, clicks: 0, unattributed: 0 });
    expect(seen).toEqual([]);
  });

  it('isolates a failing message: the rest of the page is still recorded and the failure is counted', async () => {
    const { stores, created } = fakeStores({ leadFor: { 'lead@example.com': 7, 'other@example.com': 8 } });
    const realCreate = stores.InteractionOutcome.create;
    stores.InteractionOutcome.create = async (row: any) => {
      if (row.lead_id === 7) { const e = new Error('step_index cannot be null'); e.name = 'SequelizeValidationError'; throw e; }
      return realCreate(row);
    };
    const warn = jest.fn();
    const summary = await recordMandrillEngagement(
      [msg({ email: 'lead@example.com' }), msg({ email: 'other@example.com', subject: 'Other' })],
      stores, SINCE, { warn },
    );
    expect(summary).toMatchObject({ failed: 1, opens: 1 });
    expect(created.map((r) => r.lead_id)).toEqual([8]);
    const logged = JSON.parse(warn.mock.calls[0][0]);
    expect(logged).toMatchObject({ event: 'mandrill_poll_message_failed', error_class: 'SequelizeValidationError' });
    // The recipient address never reaches the log line.
    expect(warn.mock.calls[0][0]).not.toContain('lead@example.com');
  });
});

describe('helpers', () => {
  it('normaliseSubject trims and tolerates null', () => {
    expect(normaliseSubject('  Hi  ')).toBe('Hi');
    expect(normaliseSubject(null)).toBe('');
    expect(normaliseSubject(undefined)).toBe('');
  });

  it('clickedUrls returns distinct, capped, string URLs only', () => {
    const m = msg({
      clicks_detail: [
        { url: 'https://a' }, { url: 'https://a' }, { url: null }, { url: 'https://b' }, {} as any,
      ],
    });
    expect(clickedUrls(m)).toEqual(['https://a', 'https://b']);
    expect(clickedUrls(msg({ clicks_detail: Array.from({ length: 30 }, (_, i) => ({ url: `https://x/${i}` })) }), 3)).toHaveLength(3);
    expect(clickedUrls(msg({}))).toEqual([]);
  });

  it('sentEmailWhere pins lead and sent status, and compares the case-folded subject', () => {
    const where: any = sentEmailWhere(7, 'Hello There');
    expect(where.lead_id).toBe(7);
    expect(where.status).toBe('sent');
    expect(where[Op.and][0].logic).toBe('hello there');
  });

  it('dedupWhere bounds by window start and keys on the recorded subject, IS NULL when there is none', () => {
    const where: any = dedupWhere(7, 'opened', 'Hello', SINCE);
    expect(where.created_at[Op.gte]).toBe(SINCE);
    expect(where[Op.and][0].logic).toBe('Hello');
    expect((dedupWhere(7, 'opened', '', SINCE) as any)[Op.and][0].logic).toBeNull();
  });
});

describe('what the poll asks Mandrill for', () => {
  it('asks only for campaign-tagged mail, over two days, at the API cap', () => {
    // 2026-09-11 16:20 UTC; window must run from the 10th through the 11th.
    const req = buildSearchRequest(new Date('2026-09-11T16:20:00Z'));
    expect(req).toEqual({ query: '*', tags: [CAMPAIGN_TAG], date_from: '2026-09-10', date_to: '2026-09-11', limit: SEARCH_LIMIT });
    expect(CAMPAIGN_TAG).toBe('campaign-sequence'); // the X-MC-Tags value the send path sets
    expect(SEARCH_LIMIT).toBe(1000);
  });

  it('crosses month and year boundaries in UTC, not local time', () => {
    expect(buildSearchRequest(new Date('2026-10-01T00:30:00Z')).date_from).toBe('2026-09-30');
    expect(buildSearchRequest(new Date('2027-01-01T03:00:00Z')).date_from).toBe('2026-12-31');
    // The dedup lower bound is UTC midnight of date_from, so yesterday's polls are in scope.
    expect(searchWindowStart(new Date('2026-09-11T16:20:00Z')).toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('flags a saturated result so a missed page is loud, not silent', () => {
    expect(searchSaturated(new Array(SEARCH_LIMIT).fill({}))).toBe(true);
    expect(searchSaturated(new Array(SEARCH_LIMIT - 1).fill({}))).toBe(false);
    expect(searchSaturated([])).toBe(false);
  });
});
