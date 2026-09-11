import {
  approvalInvalidatedBy,
  canTransition,
  transition,
  DEFAULT_INVALIDATION_POLICY,
  INVALIDATING_FIELDS,
  STATUS_AFTER_INVALIDATION,
  STATUSES_HOLDING_AN_APPROVAL,
  TERMINAL_STATES,
  TRANSITIONS,
  type ApprovalSnapshot,
  type InvalidatingField,
} from '../contentWorkflow';
import { CONTENT_ITEM_STATUSES, type ContentItemStatus } from '../../../models/ContentItem';

/**
 * Every transition enumerated, and every invalidating field proven to invalidate.
 *
 * The transition suite does not spot-check. It walks all 15 x 15 = 225 (from, to) pairs and
 * asserts each one agrees with the table - so there is no pair the machine has an opinion
 * about that the test has not seen. The invalidation suite changes ONE field at a time from a
 * known-approved snapshot, so a field silently dropped from the rule fails its own named test
 * rather than hiding behind a test that changed several things at once.
 */

const ALL = CONTENT_ITEM_STATUSES;

describe('the transition table is complete and enumerated', () => {
  it('has an entry for every status, including terminals', () => {
    for (const s of ALL) expect(Object.prototype.hasOwnProperty.call(TRANSITIONS, s)).toBe(true);
  });

  it('every target in every entry is a real status', () => {
    for (const s of ALL) for (const t of TRANSITIONS[s]) expect(ALL).toContain(t);
  });

  it('agrees with canTransition on all 225 pairs', () => {
    let legal = 0;
    let illegal = 0;
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(expected);
        if (expected) legal += 1; else illegal += 1;
      }
    }
    // Sanity on the shape of the machine: far more pairs are illegal than legal. A table where
    // most pairs were legal would be a machine with no rules.
    expect(legal + illegal).toBe(ALL.length * ALL.length);
    expect(illegal).toBeGreaterThan(legal * 3);
  });

  it('transition() refuses every illegal pair with the legal exits named', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to || TRANSITIONS[from].includes(to)) continue;
        const r = transition(from, to);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason.length).toBeGreaterThan(10);
      }
    }
  });

  it('transition() accepts every legal pair', () => {
    for (const from of ALL) for (const to of TRANSITIONS[from]) expect(transition(from, to)).toEqual({ ok: true, from, to });
  });

  it('a self-transition is refused', () => {
    for (const s of ALL) expect(transition(s, s).ok).toBe(false);
  });

  it('refuses a status that does not exist rather than treating it as a new state', () => {
    const r = transition('draft', 'sideways' as ContentItemStatus);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not a content status/);
  });
});

describe('the shape of the lifecycle', () => {
  it('follows the spec happy path end to end', () => {
    const path: ContentItemStatus[] = ['idea', 'draft', 'ready_for_review', 'approved', 'scheduled', 'publishing', 'published'];
    for (let i = 0; i < path.length - 1; i += 1) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it('changes_requested loops back rather than dead-ending', () => {
    expect(canTransition('ready_for_review', 'changes_requested')).toBe(true);
    expect(canTransition('changes_requested', 'draft')).toBe(true);
    expect(canTransition('changes_requested', 'ready_for_review')).toBe(true);
  });

  it('archived is terminal - nothing leaves it', () => {
    expect(TERMINAL_STATES).toContain('archived');
    expect(TRANSITIONS.archived).toEqual([]);
    for (const to of ALL) expect(canTransition('archived', to)).toBe(false);
  });

  it('every resting status can be archived directly; in-flight ones must resolve first', () => {
    // Nothing gets stuck, but two states are deliberately NOT archivable in place:
    //   scheduled  - a queued job exists; cancel it, then archive. Archiving over a live
    //                schedule would leave a job that publishes an archived item.
    //   publishing - a provider call is in progress; it has to finish or fail before the item
    //                can be retired, or the receipt has nowhere to land.
    const inFlight: ContentItemStatus[] = ['scheduled', 'publishing'];
    for (const s of ALL) {
      if (TERMINAL_STATES.includes(s)) continue;
      expect(canTransition(s, 'archived')).toBe(!inFlight.includes(s));
    }
    // And both in-flight states have a resolving exit that DOES reach archived.
    expect(canTransition('scheduled', 'cancelled') && canTransition('cancelled', 'archived')).toBe(true);
    expect(canTransition('publishing', 'publish_failed') && canTransition('publish_failed', 'archived')).toBe(true);
  });

  it('nothing skips review: draft cannot go straight to approved or scheduled', () => {
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('draft', 'scheduled')).toBe(false);
    expect(canTransition('draft', 'publishing')).toBe(false);
  });

  it('a stale approval cannot be scheduled from anywhere but approved', () => {
    for (const s of ALL) if (s !== 'approved' && s !== 'publish_failed') expect(canTransition(s, 'scheduled')).toBe(false);
  });

  it('every failure state has a way back to draft', () => {
    for (const s of ['validation_failed', 'publish_failed', 'cancelled', 'expired'] as ContentItemStatus[]) {
      expect(canTransition(s, 'draft')).toBe(true);
    }
  });
});

describe('each invalidating field, on its own, invalidates an approval', () => {
  const approved: ApprovalSnapshot = {
    copy: 'Join our free class on Thursday.',
    media: ['asset-1', 'asset-2'],
    destination: ['linkedin_organization:feed'],
    account: ['acct-li-1'],
    schedule: '2026-10-01T15:00:00Z',
    disclosure: '',
    campaign: 'camp-1',
  };

  const edits: Record<InvalidatingField, Partial<ApprovalSnapshot>> = {
    copy: { copy: 'Join our free class on Friday.' },
    media: { media: ['asset-1', 'asset-3'] },
    destination: { destination: ['meta_facebook_page:feed'] },
    account: { account: ['acct-li-2'] },
    schedule: { schedule: '2026-10-02T15:00:00Z' },
    disclosure: { disclosure: 'Paid partnership' },
    campaign: { campaign: 'camp-2' },
  };

  it('the edit table covers every field in INVALIDATING_FIELDS - no field is untested', () => {
    expect(Object.keys(edits).sort()).toEqual([...INVALIDATING_FIELDS].sort());
  });

  it.each(INVALIDATING_FIELDS)('%s', (field) => {
    const r = approvalInvalidatedBy(approved, { ...approved, ...edits[field] });
    expect(r.invalidated).toBe(true);
    expect(r.fields).toEqual([field]);
  });

  it('an identical snapshot does NOT invalidate', () => {
    expect(approvalInvalidatedBy(approved, { ...approved })).toEqual({ invalidated: false, fields: [] });
  });

  it('reports EVERY broken field, not only the first', () => {
    // The approver re-reviewing needs the whole list. "Copy changed" when media changed too
    // sends them back to approve something that will be invalidated again.
    const r = approvalInvalidatedBy(approved, { ...approved, ...edits.copy, ...edits.media, ...edits.campaign });
    expect(r.fields).toEqual(['copy', 'media', 'campaign']);
  });
});

describe('the schedule tolerance', () => {
  const approved: ApprovalSnapshot = {
    copy: 'x', media: [], destination: ['linkedin_member:feed'], account: ['a'],
    schedule: '2026-10-01T15:00:00Z', disclosure: '', campaign: null,
  };

  it('a move WITHIN tolerance does not invalidate', () => {
    // Dodging a clash by ten minutes is the same post.
    const r = approvalInvalidatedBy(approved, { ...approved, schedule: '2026-10-01T15:10:00Z' });
    expect(r.invalidated).toBe(false);
  });

  it('a move exactly AT tolerance does not invalidate; one minute past does', () => {
    const tol = DEFAULT_INVALIDATION_POLICY.scheduleToleranceMinutes;
    const at = new Date(Date.parse(approved.schedule!) + tol * 60_000).toISOString();
    const past = new Date(Date.parse(approved.schedule!) + (tol + 1) * 60_000).toISOString();
    expect(approvalInvalidatedBy(approved, { ...approved, schedule: at }).invalidated).toBe(false);
    expect(approvalInvalidatedBy(approved, { ...approved, schedule: past }).fields).toEqual(['schedule']);
  });

  it('the tolerance is policy, not a constant', () => {
    const r = approvalInvalidatedBy(
      approved,
      { ...approved, schedule: '2026-10-01T15:10:00Z' },
      { ...DEFAULT_INVALIDATION_POLICY, scheduleToleranceMinutes: 5 },
    );
    expect(r.fields).toEqual(['schedule']);
  });

  it('gaining or losing a schedule entirely invalidates', () => {
    expect(approvalInvalidatedBy(approved, { ...approved, schedule: null }).fields).toEqual(['schedule']);
    expect(approvalInvalidatedBy({ ...approved, schedule: null }, approved).fields).toEqual(['schedule']);
  });

  it('an unparseable schedule invalidates rather than passing', () => {
    // The failure direction that costs a re-approval is safer than the one that publishes an
    // unapproved time.
    expect(approvalInvalidatedBy(approved, { ...approved, schedule: 'soon' }).fields).toEqual(['schedule']);
  });
});

describe('what invalidation does NOT trip on', () => {
  const approved: ApprovalSnapshot = {
    copy: 'x', media: ['b', 'a'], destination: ['d2', 'd1'], account: ['a2', 'a1'],
    schedule: null, disclosure: '  Paid partnership  ', campaign: null,
  };

  it('media, destination and account are order-insensitive', () => {
    const r = approvalInvalidatedBy(approved, { ...approved, media: ['a', 'b'], destination: ['d1', 'd2'], account: ['a1', 'a2'] });
    expect(r.invalidated).toBe(false);
  });

  it('disclosure whitespace is not a change', () => {
    expect(approvalInvalidatedBy(approved, { ...approved, disclosure: 'Paid partnership' }).invalidated).toBe(false);
  });

  it('an invalidated item lands in draft, and only approved/scheduled items hold an approval', () => {
    expect(STATUS_AFTER_INVALIDATION).toBe('draft');
    expect(STATUSES_HOLDING_AN_APPROVAL).toEqual(['approved', 'scheduled']);
    // And the machine agrees: BOTH can legally return to draft. The earlier form of this
    // assertion (`draft || approved`) passed for `scheduled` while recordEdit left a
    // scheduled item scheduled - the verifier's finding. Strict now.
    for (const s of STATUSES_HOLDING_AN_APPROVAL) {
      expect(canTransition(s, STATUS_AFTER_INVALIDATION)).toBe(true);
    }
  });
});
