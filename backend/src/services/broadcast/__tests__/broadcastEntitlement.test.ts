/**
 * Covers request §5 P2-04's named roles — guest, free, paid, comp/scholarship, wrong
 * cohort, revoked member, moderator, admin — plus the two properties that distinguish this
 * gate from every other one in the repo:
 *
 *   1. it FAILS CLOSED, where contentEntitlement's wrappers fail open
 *   2. paid status never unlocks a private cohort
 *
 * The real `hasFullCurriculumAccess` is used, not a mock: it is pure and it is the thing
 * being composed, so mocking it would prove only that the mock was called.
 */
// contentEntitlement.ts:1 imports { Enrollment, Cohort } from the models barrel, which
// drags the entire model graph in at import time — the same coupling communityCalendarService
// carries a comment about avoiding. Unmocked, this suite took over FIVE MINUTES for pure
// logic, and CI runs every suite. Those two models are used only by that file's async
// wrappers, never by hasFullCurriculumAccess, so stubbing the barrel keeps the predicate
// under test completely real while removing the import cost.
jest.mock('../../../models', () => ({ Enrollment: {}, Cohort: {} }));
jest.mock('../../access/staffAccess', () => ({ isStaffEnrollment: jest.fn() }));
jest.mock('../../subscriptionService', () => ({ activeCompEnrollmentIds: jest.fn() }));

import { decideBroadcastAccess, resolveBroadcastAccess, type OccurrenceAccessFacts, type ViewerFacts } from '../broadcastEntitlement';

const NOW = Date.parse('2026-07-23T23:30:00.000Z');
const STARTED = new Date(NOW - 60_000); // content started a minute ago

const occ = (over: Partial<OccurrenceAccessFacts> = {}): OccurrenceAccessFacts => ({
  access_mode: 'paid',
  editorial_state: 'live',
  preview_seconds: 900,
  content_started_at: STARTED,
  ...over,
});

const viewer = (over: Partial<ViewerFacts> = {}): ViewerFacts => ({ enrollmentId: 'enr-1', ...over });

const PAID = { payment_status: 'paid' };
const UNPAID = { payment_status: 'pending' };

describe('roles', () => {
  it('admin sees everything, including a private room they are not in', () => {
    const d = decideBroadcastAccess(occ({ access_mode: 'private' }), viewer({ isAdmin: true, roomEligible: false }), UNPAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'admin' });
  });

  it('moderator sees a paid event without paying', () => {
    const d = decideBroadcastAccess(occ(), viewer({ isModerator: true }), UNPAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'moderator' });
  });

  it('a signed-out visitor gets nothing, whatever the mode', () => {
    for (const mode of ['free', 'paid', 'preview', 'private'] as const) {
      const d = decideBroadcastAccess(occ({ access_mode: mode }), viewer({ enrollmentId: null }), null, null, null, NOW);
      expect(d).toMatchObject({ grant: 'denied', reason: 'guest' });
    }
  });

  it('a signed-in free account gets a free Open House in full, no paywall', () => {
    const d = decideBroadcastAccess(occ({ access_mode: 'free' }), viewer(), UNPAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'free_event' });
  });

  it('a paid member gets a paid event', () => {
    const d = decideBroadcastAccess(occ(), viewer(), PAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'entitled' });
  });

  it('an unpaid member is denied a paid event and offered the upgrade', () => {
    const d = decideBroadcastAccess(occ(), viewer(), UNPAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'denied', reason: 'requires_payment', offerUpgrade: true });
  });

  it('a comp/scholarship grant works WITHOUT any cash payment', () => {
    // Request §4.2: explicit scholarship, staff or sponsored entitlements count as
    // configured; gating on cash alone would be wrong.
    const d = decideBroadcastAccess(occ(), viewer(), UNPAID, null, { hasActiveComp: true }, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'entitled' });
  });

  it('staff get in without paying', () => {
    const d = decideBroadcastAccess(occ(), viewer(), UNPAID, null, { isStaff: true }, NOW);
    expect(d.grant).toBe('full');
  });

  it('a business-cohort owner account gets in', () => {
    const d = decideBroadcastAccess(occ(), viewer(), UNPAID, { cohort_type: 'business' }, null, NOW);
    expect(d.grant).toBe('full');
  });

  it('honours a future access_starts_at — composed behaviour, not reimplemented', () => {
    const deferred = { payment_status: 'paid', access_starts_at: '2099-01-01' };
    const d = decideBroadcastAccess(occ(), viewer(), deferred, null, null, NOW);
    expect(d).toMatchObject({ grant: 'denied', reason: 'requires_payment' });
  });
});

describe('private rooms: money does not buy membership', () => {
  it('a PAID member of another cohort still cannot watch a private event', () => {
    const d = decideBroadcastAccess(occ({ access_mode: 'private' }), viewer({ roomEligible: false }), PAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'denied', reason: 'not_room_eligible' });
  });

  it('does NOT offer an upgrade for a private room — money cannot fix it', () => {
    const d = decideBroadcastAccess(occ({ access_mode: 'private' }), viewer({ roomEligible: false }), PAID, null, null, NOW);
    expect(d.offerUpgrade).toBeFalsy();
  });

  it('a revoked member loses access even though they are otherwise paid', () => {
    // roomEligible is resolved upstream from access_state; revocation shows up here as false.
    const d = decideBroadcastAccess(occ({ access_mode: 'private' }), viewer({ roomEligible: false }), PAID, null, null, NOW);
    expect(d.grant).toBe('denied');
  });

  it('an eligible room member watches a private event', () => {
    const d = decideBroadcastAccess(occ({ access_mode: 'private' }), viewer({ roomEligible: true }), UNPAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'room_member' });
  });
});

describe('preview window', () => {
  const preview = occ({ access_mode: 'preview' });

  it('an entitled viewer is never put in preview', () => {
    const d = decideBroadcastAccess(preview, viewer(), PAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'entitled' });
  });

  it('an unentitled viewer gets the remaining window', () => {
    const d = decideBroadcastAccess(preview, viewer(), UNPAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'preview', reason: 'preview_active', previewSecondsRemaining: 840 });
  });

  it('a late joiner gets only the remainder, not a fresh window', () => {
    const late = occ({ access_mode: 'preview', content_started_at: new Date(NOW - 600_000) });
    const d = decideBroadcastAccess(late, viewer(), UNPAID, null, null, NOW);
    expect(d.previewSecondsRemaining).toBe(300);
  });

  it('denies once the window is spent, and offers the upgrade', () => {
    const spent = occ({ access_mode: 'preview', content_started_at: new Date(NOW - 900_000) });
    const d = decideBroadcastAccess(spent, viewer(), UNPAID, null, null, NOW);
    expect(d).toMatchObject({ grant: 'denied', reason: 'preview_expired', previewSecondsRemaining: 0, offerUpgrade: true });
  });

  it('distinguishes "not started" from "expired"', () => {
    // Collapsing these would show a waiting-room viewer an exhausted preview before
    // anything had aired.
    const notStarted = occ({ access_mode: 'preview', content_started_at: null });
    const d = decideBroadcastAccess(notStarted, viewer(), UNPAID, null, null, NOW);
    expect(d.reason).toBe('preview_not_started');
    expect(d.previewSecondsRemaining).toBeNull();
    expect(d.previewSecondsRemaining).not.toBe(0);
  });
});

describe('watchability', () => {
  it('denies when nothing is airing and no replay is published', () => {
    for (const state of ['scheduled', 'backstage', 'ended', 'processing', 'cancelled']) {
      const d = decideBroadcastAccess(occ({ access_mode: 'free', editorial_state: state }), viewer(), PAID, null, null, NOW);
      expect(d).toMatchObject({ grant: 'denied', reason: 'not_watchable' });
    }
  });

  it('allows a published replay', () => {
    const d = decideBroadcastAccess(occ({ access_mode: 'free', editorial_state: 'replay_ready' }), viewer(), UNPAID, null, null, NOW);
    expect(d.grant).toBe('full');
  });

  it('allows a reconnecting broadcast — the viewer has not lost entitlement', () => {
    const d = decideBroadcastAccess(occ({ access_mode: 'free', editorial_state: 'reconnecting' }), viewer(), UNPAID, null, null, NOW);
    expect(d.grant).toBe('full');
  });
});

describe('resolveBroadcastAccess FAILS CLOSED', () => {
  const deps = {
    loadEnrollment: jest.fn(async () => PAID),
    loadCohort: jest.fn(async () => null),
    loadRoleInfo: jest.fn(async () => ({})),
    cohortIdOf: () => null,
  };

  beforeEach(() => jest.clearAllMocks());

  it('resolves normally when the loaders work', async () => {
    const d = await resolveBroadcastAccess(occ(), viewer(), deps as any, NOW);
    expect(d).toMatchObject({ grant: 'full', reason: 'entitled' });
  });

  it('DENIES when a loader throws — the opposite of contentEntitlement\'s fail-open', async () => {
    const broken = { ...deps, loadEnrollment: jest.fn(async () => { throw new Error('db down'); }) };
    const d = await resolveBroadcastAccess(occ(), viewer(), broken as any, NOW);
    // Failing open here would hand a paid broadcast to everyone for the duration of the
    // outage, and a watched stream cannot be un-watched.
    expect(d).toMatchObject({ grant: 'denied', reason: 'error' });
  });

  it('denies on a role-lookup failure too, not just an enrollment failure', async () => {
    const broken = { ...deps, loadRoleInfo: jest.fn(async () => { throw new Error('comp lookup failed'); }) };
    const d = await resolveBroadcastAccess(occ(), viewer(), broken as any, NOW);
    expect(d.grant).toBe('denied');
  });

  it('short-circuits a guest without touching any loader', async () => {
    const d = await resolveBroadcastAccess(occ(), viewer({ enrollmentId: null }), deps as any, NOW);
    expect(d.reason).toBe('guest');
    expect(deps.loadEnrollment).not.toHaveBeenCalled();
  });
});
