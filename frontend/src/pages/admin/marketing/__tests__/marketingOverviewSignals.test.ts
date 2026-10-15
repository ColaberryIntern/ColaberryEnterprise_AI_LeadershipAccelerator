import { channelIssues, blockedProvidersFor, countPostsAtRisk } from '../marketingOverviewSignals';
import type { OverviewAccount, UpcomingPost } from '../../../../services/marketingOpsApi';

/**
 * The join the old page made the operator do in their head.
 *
 * The case that prompted this: three posts scheduled, LinkedIn's token expired two days ago,
 * and nothing connecting the two. The assertions below are mostly about NOT crying wolf, because
 * a warning that fires on every Instagram post is worse than no warning - it trains people to
 * ignore the one that matters.
 */

const account = (over: Partial<OverviewAccount>): OverviewAccount => ({
  id: 'acc-1',
  brand_id: 'b-1',
  brand_name: 'Colaberry Training',
  provider: 'linkedin',
  display_name: 'Ali Muwwakkil',
  health: 'ok',
  token_expires_at: null,
  expires_in_days: null,
  ...over,
});

const post = (over: Partial<UpcomingPost>): UpcomingPost => ({
  id: 'p-1',
  title: 'Open House recap',
  brand_id: 'b-1',
  brand_name: 'Colaberry Training',
  scheduled_for: '2026-10-16T09:05:00Z',
  status: 'scheduled',
  providers: ['linkedin'],
  late: false,
  ...over,
});

describe('a hand-posted network is never "broken"', () => {
  // The bug that would have made this feature untrustworthy within a day: Instagram has no API
  // connection, so it has no usable account, so a naive check flags every Instagram post forever.
  it('a post to a hand-posted provider is not at risk', () => {
    const posts = [post({ providers: ['instagram'] })];
    expect(blockedProvidersFor(posts[0], [], ['instagram'])).toEqual([]);
    expect(countPostsAtRisk(posts, [], ['instagram'])).toBe(0);
  });

  it('but a post to a provider that is neither connected nor hand-posted IS at risk', () => {
    // Without this the test above would pass on a function that always returns [].
    const p = post({ providers: ['linkedin'] });
    expect(blockedProvidersFor(p, [], ['instagram'])).toEqual(['linkedin']);
  });
});

describe('a dead channel is only dead where it is actually dead', () => {
  it('one brand\'s expired token does not condemn another brand\'s working one', () => {
    const accounts = [
      account({ id: 'a', brand_name: 'Brand A', health: 'expired' }),
      account({ id: 'b', brand_name: 'Brand B', health: 'ok' }),
    ];
    expect(blockedProvidersFor(post({ providers: ['linkedin'] }), accounts, [])).toEqual([]);
  });

  it('a post is at risk when NO account for that provider can publish', () => {
    const accounts = [account({ health: 'expired' })];
    expect(blockedProvidersFor(post({ providers: ['linkedin'] }), accounts, [])).toEqual(['linkedin']);
  });

  it('a multi-channel post names only the channel that is broken', () => {
    const accounts = [
      account({ id: 'li', provider: 'linkedin', health: 'expired' }),
      account({ id: 'fb', provider: 'facebook', health: 'ok' }),
    ];
    const p = post({ providers: ['linkedin', 'facebook'] });
    expect(blockedProvidersFor(p, accounts, [])).toEqual(['linkedin']);
  });
});

describe('channel issues are ranked by consequence', () => {
  it('expired outranks expiring, however soon the expiry', () => {
    const issues = channelIssues([
      account({ id: 'soon', provider: 'instagram', health: 'expiring', expires_in_days: 1 }),
      account({ id: 'dead', provider: 'linkedin', health: 'expired', expires_in_days: -2 }),
    ], []);
    expect(issues.map((i) => i.accountId)).toEqual(['dead', 'soon']);
  });

  it('an expiring account is listed even though it still works - that is the point', () => {
    const issues = channelIssues([account({ health: 'expiring', expires_in_days: 4 })], []);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('expiring');
  });

  it('a healthy account is not an issue, so the list can be empty', () => {
    expect(channelIssues([account({ health: 'ok' })], [])).toEqual([]);
  });

  it('a disconnected account is a decision, not work', () => {
    // Someone chose to disconnect it. Listing it as something to fix would nag forever.
    expect(channelIssues([account({ health: 'revoked' })], [])).toEqual([]);
  });

  it('counts the posts already aimed at a broken channel', () => {
    const issues = channelIssues(
      [account({ provider: 'linkedin', health: 'expired' })],
      [post({ providers: ['linkedin'] }), post({ id: 'p-2', providers: ['linkedin', 'facebook'] })],
    );
    expect(issues[0].scheduledHere).toBe(2);
  });

  it('zero scheduled posts is still an issue', () => {
    // The channel is broken whether or not anything is queued; fixing it before the next post is
    // written is the cheaper moment.
    const issues = channelIssues([account({ health: 'expired' })], []);
    expect(issues[0].scheduledHere).toBe(0);
  });
});

describe('the count the header shows', () => {
  it('counts posts, not broken channels', () => {
    // One dead channel with three posts aimed at it is THREE posts at risk, and three dead
    // channels on one post is ONE. Getting this backwards would make the number meaningless.
    const accounts = [account({ provider: 'linkedin', health: 'expired' })];
    const posts = [post({ id: '1' }), post({ id: '2' }), post({ id: '3' })];
    expect(countPostsAtRisk(posts, accounts, [])).toBe(3);

    const multi = [post({ id: 'x', providers: ['linkedin', 'tiktok'] })];
    expect(countPostsAtRisk(multi, accounts, [])).toBe(1);
  });
});
