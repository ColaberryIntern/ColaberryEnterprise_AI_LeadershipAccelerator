import { projectDiscovery, mayKnowAbout, DiscoveryEntry } from '../broadcastDiscovery';
import type { BroadcastAccessDecision } from '../broadcastEntitlement';

/**
 * What a viewer is allowed to KNOW about what is airing.
 *
 * The acceptance criterion is that a private title never renders for an ineligible viewer.
 * These tests assert something stricter and more checkable: it never LEAVES the server. Every
 * one of them inspects the serialised payload for the title string, because "not rendered" is
 * a property of a client I cannot test from here, while "not present" is a property of this
 * function.
 */

const TITLE = 'Cohort 12 private review';

function occurrence(over: Partial<DiscoveryEntry['occurrence']> = {}): DiscoveryEntry['occurrence'] {
  return {
    id: 'occ-1',
    title: TITLE,
    room_id: 'room-1',
    access_mode: 'private',
    editorial_state: 'live',
    scheduled_start_at: new Date('2026-10-07T18:00:00Z'),
    content_started_at: new Date('2026-10-07T18:02:00Z'),
    ...over,
  };
}

const denied: BroadcastAccessDecision = { grant: 'denied', reason: 'not_room_eligible' };
const full: BroadcastAccessDecision = { grant: 'full', reason: 'room_member' };

describe('a private broadcast is knowable only by someone eligible for its room', () => {
  it('OMITS the whole item — the title never leaves the process', () => {
    const items = projectDiscovery([{ occurrence: occurrence(), decision: denied, roomEligible: false }]);

    expect(items).toEqual([]);
    // The assertion that actually matters: not "title is null", not "a shell was sent".
    expect(JSON.stringify(items)).not.toContain(TITLE);
    expect(JSON.stringify(items)).not.toContain('occ-1');
  });

  it('includes it, with the title, for an eligible room member', () => {
    const items = projectDiscovery([{ occurrence: occurrence(), decision: full, roomEligible: true }]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'occ-1', title: TITLE, can_watch: true, reason: 'room_member' });
  });

  it('carries the class session when the broadcast has one, and null (never undefined) when it does not', () => {
    const [linked] = projectDiscovery([{ occurrence: occurrence({ session_id: 'ses-9' }), decision: full, roomEligible: true }]);
    const [loose] = projectDiscovery([{ occurrence: occurrence(), decision: full, roomEligible: true }]);
    expect(linked.session_id).toBe('ses-9');
    expect(loose.session_id).toBeNull();
  });

  it('omits it even when the decision somehow says full but the room says no', () => {
    // Belt and braces: the two inputs disagreeing is a bug somewhere upstream, and the safe
    // reading of a disagreement about a PRIVATE broadcast is to say nothing.
    const items = projectDiscovery([{ occurrence: occurrence(), decision: full, roomEligible: false }]);
    expect(items).toEqual([]);
  });

  it('decides per item, so one private broadcast does not hide a public one', () => {
    const items = projectDiscovery([
      { occurrence: occurrence(), decision: denied, roomEligible: false },
      {
        occurrence: occurrence({ id: 'occ-2', title: 'Open house', access_mode: 'free', room_id: null }),
        decision: { grant: 'full', reason: 'free_event' },
        roomEligible: false,
      },
    ]);

    expect(items.map((i) => i.id)).toEqual(['occ-2']);
    expect(JSON.stringify(items)).not.toContain(TITLE);
  });
});

describe('a paid or preview broadcast keeps its title even for a viewer who cannot watch', () => {
  // Not a leak: the title is what sells the upgrade, and hiding the class entirely would be
  // the "hidden button" non-answer the request explicitly rejects.
  it('sends the title and an upgrade offer to an unentitled viewer', () => {
    const items = projectDiscovery([{
      occurrence: occurrence({ access_mode: 'paid', title: 'Week 9 class' }),
      decision: { grant: 'denied', reason: 'requires_payment', offerUpgrade: true },
      roomEligible: false,
    }]);

    expect(items[0]).toMatchObject({
      title: 'Week 9 class', can_watch: false, reason: 'requires_payment', offer_upgrade: true,
    });
  });

  it('reports a live preview window', () => {
    const items = projectDiscovery([{
      occurrence: occurrence({ access_mode: 'preview' }),
      decision: { grant: 'preview', reason: 'preview_active', previewSecondsRemaining: 840, offerUpgrade: true },
      roomEligible: false,
    }]);

    expect(items[0]).toMatchObject({ can_watch: true, preview_seconds_remaining: 840 });
  });

  it('keeps null distinct from 0 when the clock has not started', () => {
    const items = projectDiscovery([{
      occurrence: occurrence({ access_mode: 'preview', content_started_at: null }),
      decision: { grant: 'denied', reason: 'preview_not_started', previewSecondsRemaining: null, offerUpgrade: true },
      roomEligible: false,
    }]);

    // 0 would read as "your preview is used up" to a viewer who has not seen a frame.
    expect(items[0].preview_seconds_remaining).toBeNull();
    expect(items[0].content_started_at).toBeNull();
  });

  it('reports a spent preview as 0, which is a different fact from null', () => {
    const items = projectDiscovery([{
      occurrence: occurrence({ access_mode: 'preview' }),
      decision: { grant: 'denied', reason: 'preview_expired', previewSecondsRemaining: 0, offerUpgrade: true },
      roomEligible: false,
    }]);
    expect(items[0].preview_seconds_remaining).toBe(0);
  });
});

describe('the payload shape', () => {
  it('sends epoch milliseconds, so no client does timezone arithmetic of its own', () => {
    const items = projectDiscovery([{ occurrence: occurrence(), decision: full, roomEligible: true }]);
    expect(items[0].content_started_at).toBe(new Date('2026-10-07T18:02:00Z').getTime());
    expect(items[0].scheduled_start_at).toBe(new Date('2026-10-07T18:00:00Z').getTime());
  });

  it('carries no provider or policy fields — a badge has no business with them', () => {
    const items = projectDiscovery([{ occurrence: occurrence(), decision: full, roomEligible: true }]);
    expect(Object.keys(items[0]).sort()).toEqual([
      'access_mode', 'can_watch', 'content_started_at', 'editorial_state', 'id',
      'offer_upgrade', 'preview_seconds_remaining', 'reason', 'room_id', 'scheduled_start_at',
      // the class session: not a provider or policy field; it is the id the printed check-in QR already carries
      'session_id', 'title',
    ]);
  });
});

describe('mayKnowAbout, directly', () => {
  it('gates only on private', () => {
    for (const mode of ['free', 'paid', 'preview'] as const) {
      expect(mayKnowAbout({ occurrence: occurrence({ access_mode: mode }), decision: denied, roomEligible: false }))
        .toBe(true);
    }
    expect(mayKnowAbout({ occurrence: occurrence({ access_mode: 'private' }), decision: denied, roomEligible: false }))
      .toBe(false);
    expect(mayKnowAbout({ occurrence: occurrence({ access_mode: 'private' }), decision: denied, roomEligible: true }))
      .toBe(true);
  });
});
