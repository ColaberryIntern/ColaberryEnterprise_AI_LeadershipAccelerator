import { approvalHash, MESSAGE_STATUSES, transition, type ApprovalContent } from '../messageStatus';
import type { CommsHubMessageStatus } from '../../../../models/CommsHubMessage';
import { COMMS_HUB_MESSAGE_STATUSES } from '../../../../db/ensureCommsHubSchema';

/**
 * CH6.2 the status machine: EVERY ordered pair of the nine statuses (81), each asserted allowed or
 * refused against an expectation table written here independently of the implementation's table.
 */
const ALLOWED_PAIRS = new Set([
  'draft>needs_approval', 'draft>cancelled',
  'needs_approval>approved', 'needs_approval>draft', 'needs_approval>cancelled',
  'approved>scheduled', 'approved>needs_approval', 'approved>cancelled',
  'scheduled>sending', 'scheduled>needs_approval', 'scheduled>cancelled',
  'sending>sent', 'sending>partially_failed', 'sending>failed',
  'partially_failed>sending', 'partially_failed>needs_approval', 'partially_failed>cancelled',
  'failed>sending', 'failed>needs_approval', 'failed>cancelled',
]);

const PAIRS: Array<[CommsHubMessageStatus, CommsHubMessageStatus]> = MESSAGE_STATUSES.flatMap((f) => MESSAGE_STATUSES.map((t) => [f, t] as [CommsHubMessageStatus, CommsHubMessageStatus]));

describe('CH6.2 every status pair', () => {
  it('there are nine statuses, exactly the values the schema CHECK allows, and 81 pairs', () => {
    expect(MESSAGE_STATUSES).toHaveLength(9);
    expect([...MESSAGE_STATUSES].sort()).toEqual([...COMMS_HUB_MESSAGE_STATUSES].sort());
    expect(PAIRS).toHaveLength(81);
  });

  it.each(PAIRS)('%s -> %s', (from, to) => {
    const r = transition(from, to);
    expect(r.ok).toBe(ALLOWED_PAIRS.has(`${from}>${to}`));
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });

  it('sent and cancelled are final; a sending message cannot be cancelled mid-attempt; a status to itself is refused', () => {
    for (const to of MESSAGE_STATUSES) {
      expect(transition('sent', to).ok).toBe(false);
      expect(transition('cancelled', to).ok).toBe(false);
    }
    expect(transition('sending', 'cancelled')).toEqual({ ok: false, reason: 'a sending message cannot become cancelled' });
    expect(transition('approved', 'approved')).toEqual({ ok: false, reason: 'already approved' });
    expect(transition('sent', 'draft')).toEqual({ ok: false, reason: 'a sent message cannot change' });
  });

  it('nothing reaches sending without an approval first (no path skips approved -> scheduled)', () => {
    const into = (s: CommsHubMessageStatus) => MESSAGE_STATUSES.filter((f) => transition(f, s).ok);
    expect(into('sending').sort()).toEqual(['failed', 'partially_failed', 'scheduled']);
    expect(into('scheduled')).toEqual(['approved']);
    expect(into('approved')).toEqual(['needs_approval']);
  });

  it('unknown statuses are refused, not thrown', () => {
    expect(transition('posted' as CommsHubMessageStatus, 'sent').ok).toBe(false);
    expect(transition('draft', 'posted' as CommsHubMessageStatus).ok).toBe(false);
  });
});

describe('CH6.2 the approval hash', () => {
  const base: ApprovalContent = {
    drafts: [{ channel: 'community_post', title: null, body: 'Demo Tuesday is tomorrow at 6:00 PM CST.' }, { channel: 'in_app', title: 'Demo Tuesday', body: 'Tomorrow, 6:00 PM CST' }],
    destinations: [{ channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1' }, { channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members' }],
    send_at: new Date('2026-12-01T18:00:00Z'),
  };
  const h = approvalHash(base);

  it('is a 64-character hex SHA-256, stable for the same content', () => {
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(approvalHash(JSON.parse(JSON.stringify(base), (k, v) => (k === 'send_at' && v ? new Date(v) : v)))).toBe(h);
  });

  it('does not depend on the order rows were read in', () => {
    expect(approvalHash({ ...base, drafts: [...base.drafts].reverse(), destinations: [...base.destinations].reverse() })).toBe(h);
  });

  it('changes with the body, the title, a destination, or the send time (to the minute)', () => {
    expect(approvalHash({ ...base, drafts: [{ ...base.drafts[0], body: base.drafts[0].body + ' ' }, base.drafts[1]] })).not.toBe(h);
    expect(approvalHash({ ...base, drafts: [base.drafts[0], { ...base.drafts[1], title: 'Demo Tue' }] })).not.toBe(h);
    expect(approvalHash({ ...base, destinations: [...base.destinations, { channel: 'community_post', target_type: 'cohort_feed', target_id: 'c2' }] })).not.toBe(h);
    expect(approvalHash({ ...base, send_at: new Date('2026-12-01T18:01:00Z') })).not.toBe(h);
    expect(approvalHash({ ...base, send_at: new Date('2026-12-01T18:00:42Z') })).toBe(h); // same minute
    expect(approvalHash({ ...base, send_at: null })).not.toBe(h);
  });
});
