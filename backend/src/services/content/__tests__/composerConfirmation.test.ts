import { brandLocalTime, buildConfirmation, type ConfirmationInput } from '../composerConfirmation';

/**
 * The final confirmation (spec 8.1 step 10) must show: brand, accounts, local AND UTC time,
 * copy, assets, links, approval status. Each is asserted by VALUE below, not by the presence
 * of a key - a key that exists with an empty value is how a confirmation screen tells an
 * operator nothing while looking complete.
 *
 * The time assertions use real instants on both sides of the 2026 US DST change (Nov 1),
 * so a wall-clock-arithmetic implementation with a fixed offset would fail one of them.
 */

function input(overrides: Partial<ConfirmationInput> = {}): ConfirmationInput {
  return {
    item: {
      id: 'ci-1', title: 'Free AI class - November', status: 'approved', content_type: 'image',
      scheduled_for: '2026-11-03T15:00:00.000Z', human_approved: true, revision: 3,
    },
    brand: { id: 'b-1', name: 'Colaberry', timezone: 'America/Chicago' },
    campaign: { id: 'c-1', name: 'Nov Open House', utm_campaign_slug: 'colaberry-awareness-2026-11' },
    variants: [
      { provider: 'linkedin_organization', body: 'Join us Thursday.', is_manually_edited: true, stale: false, link_url: 'https://enterprise.colaberry.ai/r/ABCD2345' },
      { provider: 'meta_instagram', body: 'Join us Thursday. Link in bio.', is_manually_edited: false, stale: false, link_url: null },
    ],
    links: [
      { provider: 'linkedin_organization', short_url: 'https://enterprise.colaberry.ai/r/ABCD2345', final_url: 'https://learn.colaberry.com/free?utm_source=linkedin&utm_medium=organic_social&utm_campaign=colaberry-awareness-2026-11', utm: { utm_source: 'linkedin', utm_medium: 'organic_social', utm_campaign: 'colaberry-awareness-2026-11' } },
    ],
    assets: [{ id: 'm-1', filename: 'class.jpg', mime_type: 'image/jpeg', alt_text: 'Students at a whiteboard', position: 0 }],
    approval: { status: 'approved', requested_by: 'sohail@colaberry.com', requested_at: '2026-10-30T12:00:00.000Z', decided_by: 'ali@colaberry.com', decided_at: '2026-10-30T14:00:00.000Z', decision_note: null },
    validation: { ok: true, blockers: [] },
    ...overrides,
  };
}

describe('the confirmation carries every field the spec names, by value', () => {
  const c = buildConfirmation(input());

  it('brand, with the zone it was resolved from', () => {
    expect(c.brand).toEqual({ id: 'b-1', name: 'Colaberry', timezone: 'America/Chicago', timezoneSource: 'brand' });
  });

  it('accounts: one per variant, with the publish mode and an explicit null account', () => {
    expect(c.accounts.map((a) => a.provider)).toEqual(['linkedin_organization', 'meta_instagram']);
    for (const a of c.accounts) {
      expect(a.displayName).not.toBe('');
      expect(['direct', 'handoff']).toContain(a.mode);
      // Not connected until T003. Stated per row, not hidden.
      expect(a.account).toBeNull();
      if (a.mode === 'handoff') expect(a.reasons.length).toBeGreaterThan(0);
    }
  });

  it('copy: text, provenance and staleness per provider', () => {
    expect(c.copy).toEqual([
      { provider: 'linkedin_organization', text: 'Join us Thursday.', source: 'edited', stale: false, chars: 17 },
      { provider: 'meta_instagram', text: 'Join us Thursday. Link in bio.', source: 'generated', stale: false, chars: 30 },
    ]);
  });

  it('assets, with alt text so a missing one is visible', () => {
    expect(c.assets).toEqual([{ id: 'm-1', filename: 'class.jpg', mimeType: 'image/jpeg', altText: 'Students at a whiteboard', position: 0 }]);
  });

  it('links, and the providers that have none', () => {
    expect(c.links).toHaveLength(1);
    expect(c.links[0].shortUrl).toBe('https://enterprise.colaberry.ai/r/ABCD2345');
    expect(c.links[0].finalUrl).toContain('utm_campaign=colaberry-awareness-2026-11');
    expect(c.linkGaps).toEqual(['meta_instagram']);
  });

  it('approval status, as a label AND the underlying request', () => {
    expect(c.approval.label).toBe('Approved');
    expect(c.approval.itemStatus).toBe('approved');
    expect(c.approval.humanApproved).toBe(true);
    expect(c.approval.request?.decided_by).toBe('ali@colaberry.com');
  });

  it('campaign with its slug, because that is what the links report under', () => {
    expect(c.campaign).toEqual({ id: 'c-1', name: 'Nov Open House', slug: 'colaberry-awareness-2026-11' });
  });
});

describe('local and UTC time are both shown and differ correctly for a non-UTC brand', () => {
  it('after the DST change (CST, -06:00): 15:00 UTC is 9:00 AM in Chicago', () => {
    const c = buildConfirmation(input());
    expect(c.schedule).not.toBeNull();
    expect(c.schedule!.utc).toBe('2026-11-03T15:00:00.000Z');
    expect(c.schedule!.utcLabel).toBe('2026-11-03 15:00 UTC');
    expect(c.schedule!.local).toEqual({ day: '2026-11-03', time: '9:00 AM', zone: 'CST', offset: '-06:00', dayLabel: 'Tue, Nov 3' });
    expect(c.schedule!.differsFromUtc).toBe(true);
  });

  it('before the DST change (CDT, -05:00): the same UTC hour is 10:00 AM in Chicago', () => {
    const c = buildConfirmation(input({ item: { ...input().item, scheduled_for: '2026-10-27T15:00:00.000Z' } }));
    expect(c.schedule!.local).toEqual({ day: '2026-10-27', time: '10:00 AM', zone: 'CDT', offset: '-05:00', dayLabel: 'Tue, Oct 27' });
    expect(c.schedule!.differsFromUtc).toBe(true);
  });

  it('crosses the calendar day: 03:00 UTC on Nov 4 is the evening of Nov 3 in Chicago', () => {
    const c = buildConfirmation(input({ item: { ...input().item, scheduled_for: '2026-11-04T03:00:00.000Z' } }));
    expect(c.schedule!.utcLabel).toBe('2026-11-04 03:00 UTC');
    expect(c.schedule!.local.day).toBe('2026-11-03');
    expect(c.schedule!.local.time).toBe('9:00 PM');
  });

  it('a UTC brand shows the same reading on both sides, and says so', () => {
    const c = buildConfirmation(input({ brand: { id: 'b-2', name: 'UTC brand', timezone: 'UTC' } }));
    expect(c.schedule!.local.time).toBe('3:00 PM');
    expect(c.schedule!.local.offset).toBe('+00:00');
    expect(c.schedule!.differsFromUtc).toBe(false);
  });

  it('a brand with no timezone falls back to the platform default and labels the source', () => {
    const c = buildConfirmation(input({ brand: { id: 'b-3', name: 'No zone', timezone: null } }));
    expect(c.brand?.timezone).toBe('America/Chicago');
    expect(c.brand?.timezoneSource).toBe('default');
  });

  it('no scheduled time means no schedule block - not a fabricated "now"', () => {
    const c = buildConfirmation(input({ item: { ...input().item, scheduled_for: null } }));
    expect(c.schedule).toBeNull();
  });

  it('brandLocalTime refuses an unparseable instant rather than returning epoch', () => {
    expect(brandLocalTime('not a date', 'America/Chicago')).toBeNull();
  });
});

describe('readiness tells the buttons what they may do, with reasons', () => {
  it('an approved, validated, scheduled item can be scheduled and published now', () => {
    const c = buildConfirmation(input());
    expect(c.readiness.canSchedule).toBe(true);
    expect(c.readiness.canPublishNow).toBe(true);
    expect(c.readiness.canSendForApproval).toBe(false);
  });

  it('a draft can be sent for approval but not published, and the reason says why', () => {
    const c = buildConfirmation(input({ item: { ...input().item, status: 'draft' }, approval: null }));
    expect(c.readiness.canSendForApproval).toBe(true);
    expect(c.readiness.canPublishNow).toBe(false);
    expect(c.readiness.reasons).toContain('Publishing needs an approved item; this one is draft.');
    expect(c.approval.label).toBe('Not requested');
  });

  it('unvalidated: nothing forward is allowed and the reason is the missing run, not a failure', () => {
    const c = buildConfirmation(input({ validation: null }));
    expect(c.validation.ran).toBe(false);
    expect(c.readiness.canPublishNow).toBe(false);
    expect(c.readiness.reasons).toContain('Validation has not been run for this revision.');
  });

  it('a blocker counts, and blocks', () => {
    const blocker = { provider: 'meta_instagram' as const, field: 'text' as const, severity: 'block' as const, message: 'Instagram: 2,300 of 2,200 characters - 100 over.' };
    const c = buildConfirmation(input({ validation: { ok: false, blockers: [blocker] } }));
    expect(c.validation).toEqual({ ran: true, ok: false, blockerCount: 1, blockers: [blocker] });
    expect(c.readiness.canPublishNow).toBe(false);
    expect(c.readiness.reasons).toContain('1 validation blocker must be fixed.');
  });

  it('the publish button says what will actually happen, per the registry', () => {
    // Every provider is handoff today (no app approved, no account connected).
    const c = buildConfirmation(input());
    expect(c.accounts.every((a) => a.mode === 'handoff')).toBe(true);
    expect(c.readiness.publishLabel).toBe('Create handoff packages');
    // No accounts at all: the plain label, and nothing to publish anyway.
    const none = buildConfirmation(input({ variants: [], links: [], validation: { ok: true, blockers: [] } }));
    expect(none.readiness.publishLabel).toBe('Publish now');
    expect(none.readiness.canPublishNow).toBe(false);
  });

  it('an approved item with no time set is told to pick one', () => {
    const c = buildConfirmation(input({ item: { ...input().item, scheduled_for: null } }));
    expect(c.readiness.canSchedule).toBe(false);
    expect(c.readiness.canPublishNow).toBe(true);
    expect(c.readiness.reasons).toContain('Set a time to schedule, or publish now.');
  });
});
