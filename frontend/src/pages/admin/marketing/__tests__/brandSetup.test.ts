import { BRAND_TABS, isBrandTab, setupSteps, setupSummary, type BrandSetupFacts } from '../brandSetup';

/**
 * "Is this brand set up?" as a tested function.
 *
 * It used to be a question you answered by visiting four pages and forming an impression. The
 * line at the top of the brand page is this, so it has to be right about the two things without
 * which the product does not work - somewhere to post, and a verified domain to send from.
 */

const READY: BrandSetupFacts = {
  channelCount: 1, channelsNeedingAttention: 0, domainCount: 1, verifiedDomainCount: 1, pendingApprovals: 0,
};

describe('what a brand still needs', () => {
  it('a fully set up brand says so, and lists nothing outstanding', () => {
    expect(setupSteps(READY).every((s) => s.done)).toBe(true);
    expect(setupSummary(READY)).toEqual({ done: true, text: expect.stringContaining('This brand is set up') });
  });

  it('a brand with no channel is told to connect one, and which tab does it', () => {
    const facts = { ...READY, channelCount: 0 };
    const step = setupSteps(facts).find((s) => !s.done)!;
    expect(step).toMatchObject({ key: 'channel', tab: 'channels' });
    expect(setupSummary(facts).text).toMatch(/One thing left: connect a network/);
  });

  it('a connection that has stopped working is outstanding even though a channel exists', () => {
    const facts = { ...READY, channelsNeedingAttention: 1 };
    expect(setupSteps(facts).find((s) => s.key === 'channel_health')!.done).toBe(false);
    expect(setupSummary(facts).text).toMatch(/fix the connection/);
  });

  it('an unverified domain is outstanding; a verified one is not', () => {
    expect(setupSteps({ ...READY, verifiedDomainCount: 0 }).find((s) => s.key === 'domain')!.done).toBe(false);
    expect(setupSteps(READY).find((s) => s.key === 'domain')!.done).toBe(true);
  });

  it('readiness that has not loaded is not counted as a missing domain', () => {
    // Null means "not loaded". Treating it as absence would tell someone to go and fix
    // something that may already be fine.
    expect(setupSteps({ ...READY, domainCount: null, verifiedDomainCount: 0 }).find((s) => s.key === 'domain')!.done).toBe(true);
  });

  it('counts several outstanding things and leads with the first', () => {
    const facts = { ...READY, channelCount: 0, verifiedDomainCount: 0 };
    const summary = setupSummary(facts);
    expect(summary.done).toBe(false);
    expect(summary.text).toMatch(/^2 things left, starting with: connect a network/);
  });
});

describe('the tabs', () => {
  it('are in the order the work happens', () => {
    expect(BRAND_TABS.map((t) => t.key)).toEqual(['channels', 'domains', 'approvals', 'campaigns', 'details']);
  });

  it('every tab says what it is for, so the row is not five bare nouns', () => {
    for (const t of BRAND_TABS) expect(t.hint.length).toBeGreaterThan(20);
  });

  it('only a real tab name is accepted from the URL', () => {
    expect(isBrandTab('channels')).toBe(true);
    expect(isBrandTab('Channels')).toBe(false);
    expect(isBrandTab('slots')).toBe(false);
    expect(isBrandTab(null)).toBe(false);
  });
});
