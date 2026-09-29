import { alertSentence, alertSignature, connectionAlerts, type ConnectionAlert } from '../connectionAlerts';
import type { ChannelAccount } from '../../../../services/channelAccountApi';

/**
 * When the Marketing tab interrupts someone about a connection, and what it says.
 *
 * The case this exists for: Ali's LinkedIn stops working on 15 Nov 2026. Today that fact lives on
 * one page he would have to visit on purpose. A warning that only appears where you already went
 * is not a warning.
 */

const NOW = new Date('2026-11-01T15:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function account(over: Partial<ChannelAccount> = {}): ChannelAccount {
  return {
    id: 'acc-1', tenant_id: 't-1', brand_id: 'b-1', owner_member_id: null,
    provider: 'linkedin_member', provider_account_id: 'p-1', display_name: 'Ali Muwwakkil',
    handle: null, avatar_url: null, status: 'connected',
    granted_scopes: [], missing_scopes: [], connected_at: inDays(-60),
    last_health_check_at: null, last_health_ok: null, last_health_error_class: null,
    revoked_at: null, credentials: [], health: 'ok', usable_until: inDays(90),
    ...over,
  } as ChannelAccount;
}

describe('who gets interrupted about', () => {
  it('says nothing when every connection is fine', () => {
    expect(connectionAlerts([account()], NOW)).toEqual([]);
  });

  it('raises an account whose token has expired', () => {
    const [a] = connectionAlerts([account({ health: 'expired', usable_until: inDays(-2) })], NOW);
    expect(a).toMatchObject({ severity: 'failing', network: 'LinkedIn', daysLeft: -2 });
  });

  it('raises one that cannot be read, which fails the same way from the operator\'s side', () => {
    expect(connectionAlerts([account({ health: 'unhealthy' })], NOW)[0].severity).toBe('failing');
  });

  it('raises one expiring inside the window, and leaves one outside it alone', () => {
    expect(connectionAlerts([account({ health: 'expiring', usable_until: inDays(14) })], NOW)[0].severity).toBe('expiring');
    expect(connectionAlerts([account({ usable_until: inDays(15) })], NOW)).toEqual([]);
  });

  it('says nothing about an account somebody deliberately disconnected', () => {
    // Nagging about a decision just made is how a banner teaches people to ignore banners.
    expect(connectionAlerts([account({ health: 'revoked', revoked_at: inDays(-1) })], NOW)).toEqual([]);
  });

  it('puts what is broken now above what breaks later, then soonest first', () => {
    const alerts = connectionAlerts([
      account({ id: 'later', health: 'expiring', usable_until: inDays(12) }),
      account({ id: 'broken', health: 'expired', usable_until: inDays(-1) }),
      account({ id: 'sooner', health: 'expiring', usable_until: inDays(3) }),
    ], NOW);
    expect(alerts.map((a) => a.accountId)).toEqual(['broken', 'sooner', 'later']);
  });
});

describe('what the banner actually says', () => {
  const one = (over: Partial<ChannelAccount>) => connectionAlerts([account(over)], NOW);

  it('names the network and what it means, rather than "a connection is failing"', () => {
    const s = alertSentence(one({ health: 'expired' }));
    expect(s).toContain('LinkedIn');
    expect(s).toMatch(/Posts to it will fail/);
  });

  it('counts days for an expiry, in plain words', () => {
    expect(alertSentence(one({ health: 'expiring', usable_until: inDays(14) }))).toMatch(/in 14 days/);
    expect(alertSentence(one({ health: 'expiring', usable_until: inDays(1) }))).toMatch(/tomorrow/);
    expect(alertSentence(one({ health: 'expiring', usable_until: inDays(0) }))).toMatch(/today/);
  });

  it('gives the date in Central, like every other time on these screens', () => {
    // 15 Nov 2026 is the real one: Ali's LinkedIn.
    expect(alertSentence(one({ health: 'expiring', usable_until: '2026-11-16T01:50:34.000Z' })))
      .toContain('Nov 15, 2026');
  });

  it('summarises several without listing them all', () => {
    const many = connectionAlerts([
      account({ id: 'a', health: 'expired' }),
      account({ id: 'b', health: 'unhealthy', provider: 'meta_facebook_page' }),
    ], NOW);
    expect(alertSentence(many)).toMatch(/^2 connections are not working/);
  });

  it('says nothing at all when there is nothing to say', () => {
    expect(alertSentence([])).toBe('');
  });
});

describe('dismissing this problem, not the next one', () => {
  const sig = (alerts: ConnectionAlert[]) => alertSignature(alerts);

  it('the same trouble has the same signature however it is ordered', () => {
    const a = connectionAlerts([account({ id: 'x', health: 'expired' }), account({ id: 'y', health: 'expiring', usable_until: inDays(2) })], NOW);
    const b = connectionAlerts([account({ id: 'y', health: 'expiring', usable_until: inDays(2) }), account({ id: 'x', health: 'expired' })], NOW);
    expect(sig(a)).toBe(sig(b));
  });

  it('a NEW failure changes the signature, so a dismissed banner comes back', () => {
    const before = connectionAlerts([account({ id: 'x', health: 'expiring', usable_until: inDays(3) })], NOW);
    const after = connectionAlerts([
      account({ id: 'x', health: 'expiring', usable_until: inDays(3) }),
      account({ id: 'z', health: 'expired' }),
    ], NOW);
    expect(sig(after)).not.toBe(sig(before));
  });

  it('an account getting WORSE changes the signature too', () => {
    const warning = connectionAlerts([account({ id: 'x', health: 'expiring', usable_until: inDays(1) })], NOW);
    const broken = connectionAlerts([account({ id: 'x', health: 'expired' })], NOW);
    expect(sig(broken)).not.toBe(sig(warning));
  });
});
