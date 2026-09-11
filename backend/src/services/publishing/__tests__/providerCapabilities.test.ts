import {
  decidePublishMode,
  getProviderCapabilities,
  isStale,
  publishButtonFor,
  LIMITS_STALE_AFTER_DAYS,
  PROVIDER_CAPABILITIES,
  PROVIDER_KEYS,
  type ProviderCapabilities,
  type PublishAction,
} from '../providerCapabilities';

/**
 * The capability registry drives validation AND the Handoff decision, and no code path can
 * render a Publish button for an unsupported action.
 *
 * The second clause is enforced two ways. Behaviourally: for every provider and every action,
 * if the capability is absent or the app is unapproved, `decidePublishMode` returns handoff and
 * `publishButtonFor` never yields the label "Publish". Structurally: `PublishMode` has no
 * "direct, but" variant, so there is no third outcome for a button to misread.
 */

const ACTIONS: PublishAction[] = ['publish', 'firstComment', 'reply', 'edit', 'delete', 'analytics', 'ads', 'webhooks'];

describe('every provider is registered with complete, dated data', () => {
  it.each(PROVIDER_KEYS)('%s has a version, an asOf date, scopes and a review status', (key) => {
    const c = getProviderCapabilities(key);
    expect(c.provider).toBe(key);
    expect(c.version).toMatch(/^\d{4}\.\d{2}\.\d+$/);
    expect(Number.isNaN(Date.parse(c.asOf))).toBe(false);
    expect(c.requiredScopes.length).toBeGreaterThan(0);
    expect(['not_submitted', 'in_review', 'approved', 'rejected', 'self_serve']).toContain(c.appReview.status);
    // A review note is not optional: "not_submitted" with no note leaves the operator asking
    // what to do about it.
    expect(c.appReview.note.length).toBeGreaterThan(20);
  });

  it('every provider declares a text limit greater than zero', () => {
    for (const key of PROVIDER_KEYS) expect(getProviderCapabilities(key).text.maxChars).toBeGreaterThan(0);
  });

  it('a provider with no image support says null, not zero limits', () => {
    // YouTube is video-only. `image: null` is the honest shape; `{ maxSizeMb: 0 }` would
    // validate every image as too large, which is a rejection dressed as a limit.
    expect(getProviderCapabilities('youtube').image).toBeNull();
    expect(getProviderCapabilities('youtube').contentTypes).toEqual(['video']);
  });

  it('Instagram has no text-only content type', () => {
    // A text draft cannot be published to Instagram at all. The registry says so by omission
    // in contentTypes, so the composer can refuse before validation rather than at publish.
    expect(getProviderCapabilities('meta_instagram').contentTypes).not.toContain('text');
  });
});

describe('an unsupported action yields Handoff, and never a Publish button', () => {
  it('for every provider and every unsupported action', () => {
    for (const key of PROVIDER_KEYS) {
      const caps = getProviderCapabilities(key);
      for (const action of ACTIONS) {
        if (caps.supports[action]) continue;
        const mode = decidePublishMode(caps, action);
        expect(mode.mode).toBe('handoff');
        expect(publishButtonFor(mode).label).toBe('Handoff required');
      }
    }
  });

  it('names "not supported" as the reason', () => {
    const mode = decidePublishMode(getProviderCapabilities('linkedin_member'), 'edit');
    expect(mode.mode).toBe('handoff');
    if (mode.mode === 'handoff') expect(mode.reasons.some((r) => /does not support "edit"/.test(r))).toBe(true);
  });
});

describe('an unapproved app yields Handoff even for a supported action', () => {
  it('Facebook Page supports publish, but the app is not submitted - so Handoff', () => {
    // The state of the world today: the App Review package exists and Ali has not submitted
    // it. A Publish button here would be the fake button spec 8.2 forbids.
    const caps = getProviderCapabilities('meta_facebook_page');
    expect(caps.supports.publish).toBe(true);
    const mode = decidePublishMode(caps, 'publish');
    expect(mode.mode).toBe('handoff');
    if (mode.mode === 'handoff') {
      expect(mode.reasons).toHaveLength(1);
      expect(mode.reasons[0]).toMatch(/not approved/);
      expect(mode.reasons[0]).toMatch(/not_submitted/);
    }
  });

  it('reports BOTH reasons when both apply, as separate problems with separate fixes', () => {
    // TikTok: publish unsupported (unaudited apps are private-only) AND app not submitted.
    const mode = decidePublishMode(getProviderCapabilities('tiktok'), 'publish');
    expect(mode.mode).toBe('handoff');
    if (mode.mode === 'handoff') {
      expect(mode.reasons).toHaveLength(2);
      expect(mode.reasons[0]).toMatch(/does not support/);
      expect(mode.reasons[1]).toMatch(/not approved/);
    }
  });

  it('LinkedIn member posting is the ONE direct path today, because it is self-serve', () => {
    // Share on LinkedIn needs no review. This is the sole provider/action pair that resolves
    // to direct against the registry as it stands - and it is the honest answer, not a gap in
    // the guard.
    const mode = decidePublishMode(getProviderCapabilities('linkedin_member'), 'publish');
    expect(mode).toEqual({ mode: 'direct' });
    expect(publishButtonFor(mode).label).toBe('Publish');
  });

  it('every OTHER provider resolves publish to Handoff against the registry as it stands', () => {
    // Pinned so a change in review status is a deliberate edit to this test, not a surprise.
    const direct = PROVIDER_KEYS.filter((k) => decidePublishMode(getProviderCapabilities(k), 'publish').mode === 'direct');
    expect(direct).toEqual(['linkedin_member']);
  });

  it('flipping a status to approved flips the decision - the registry drives it', () => {
    // Proves the decision reads the data rather than a hardcoded list of provider names.
    const caps: ProviderCapabilities = {
      ...getProviderCapabilities('meta_facebook_page'),
      appReview: { status: 'approved', reviewedAt: '2026-10-01', note: 'approved' },
    };
    expect(decidePublishMode(caps, 'publish')).toEqual({ mode: 'direct' });
    // But not for an action the provider still does not support.
    expect(decidePublishMode({ ...caps, supports: { ...caps.supports, edit: false } }, 'edit').mode).toBe('handoff');
  });
});

describe('limits are dated', () => {
  it('a fresh entry is not stale', () => {
    const now = Date.parse('2026-09-11T00:00:00Z');
    for (const key of PROVIDER_KEYS) expect(isStale(getProviderCapabilities(key), now)).toBe(false);
  });

  it('an entry older than the threshold IS stale', () => {
    const later = Date.parse('2026-09-11T00:00:00Z') + (LIMITS_STALE_AFTER_DAYS + 1) * 86_400_000;
    expect(isStale(getProviderCapabilities('meta_instagram'), later)).toBe(true);
  });

  it('an unparseable asOf is treated as stale, not as fresh', () => {
    // The failure direction matters: "unknown age" must read as "re-check", never as "fine".
    const caps = { ...getProviderCapabilities('x'), asOf: 'unknown' };
    expect(isStale(caps, Date.now())).toBe(true);
  });
});

describe('the registry is the single source', () => {
  it('exports exactly the seven providers the spec orders', () => {
    expect([...PROVIDER_KEYS].sort()).toEqual([
      'linkedin_member', 'linkedin_organization', 'meta_facebook_page', 'meta_instagram',
      'tiktok', 'x', 'youtube',
    ]);
  });

  it('Instagram carries the one hard published daily cap', () => {
    expect(PROVIDER_CAPABILITIES.meta_instagram.rateLimits.postsPerDay).toBe(50);
  });
});
