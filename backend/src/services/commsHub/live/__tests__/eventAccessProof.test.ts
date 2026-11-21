/**
 * CH5.1 decision proof, through the REAL playback-grant code (no mocks): an all-members hub event is
 * streamed as access_mode 'free' with no room. That plays for any signed-in member and never for a
 * signed-out visitor; a 'private' occurrence with no room plays for nobody but staff, which is why a
 * one-cohort event is streamed in that batch's room instead.
 */
import { decideBroadcastAccess } from '../../../broadcast/broadcastEntitlement';
import { resolveRoomEligibility } from '../../../broadcast/broadcastRoomEligibility';

describe('CH5.1 who may watch a hub event stream', () => {
  it('PROOF, through the real playback-grant code: a free occurrence with no room plays for a signed-in member, not for a visitor', async () => {
    const roomEligible = await resolveRoomEligibility(null, { enrollmentId: 'm1', cohortId: 'c1', isAdmin: false });
    expect(roomEligible).toBe(false);
    const occ = { access_mode: 'free' as const, editorial_state: 'live', preview_seconds: 0, content_started_at: null };
    expect(decideBroadcastAccess(occ, { enrollmentId: 'm1', roomEligible }, null, null, null, Date.parse('2026-11-20T15:00:00Z'))).toEqual({ grant: 'full', reason: 'free_event' });
    expect(decideBroadcastAccess(occ, { enrollmentId: null, roomEligible }, null, null, null, Date.parse('2026-11-20T15:00:00Z'))).toEqual({ grant: 'denied', reason: 'guest' });
    // ...and a private occurrence with no room plays for nobody but staff: why a cohort event needs its room.
    expect(decideBroadcastAccess({ ...occ, access_mode: 'private' }, { enrollmentId: 'm1', roomEligible }, null, null, null, Date.parse('2026-11-20T15:00:00Z')).grant).toBe('denied');
  });
});
