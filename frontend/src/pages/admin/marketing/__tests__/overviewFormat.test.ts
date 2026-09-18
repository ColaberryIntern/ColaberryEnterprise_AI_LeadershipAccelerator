import { expiryPhrase, presentHealth, providerLabel, pluralPosts, scheduleLabel } from '../overviewFormat';

describe('the expiry line never says a negative number', () => {
  // The most common way this kind of line goes wrong: `expires in ${days} days` for a token
  // that has already died renders "expires in -3 days", which reads as a glitch rather than as
  // the one thing the operator most needs to act on.
  it.each([
    [30, 'expires in 30 days'],
    [2, 'expires in 2 days'],
    [1, 'expires tomorrow'],
    [0, 'expires today'],
    [-1, 'expired yesterday'],
    [-3, 'expired 3 days ago'],
  ])('%i days -> %s', (days, phrase) => {
    expect(expiryPhrase(days)).toBe(phrase);
  });

  it('says nothing for a token that never expires', () => {
    expect(expiryPhrase(null)).toBeNull();
  });
});

describe('what each health state tells the operator', () => {
  it('only ok and expiring can carry a post', () => {
    expect(presentHealth('ok').usable).toBe(true);
    expect(presentHealth('expiring').usable).toBe(true);
    expect(presentHealth('expired').usable).toBe(false);
    expect(presentHealth('unhealthy').usable).toBe(false);
    expect(presentHealth('revoked').usable).toBe(false);
  });

  it('expired and unhealthy are the same colour - same event, same remedy', () => {
    expect(presentHealth('expired').tone).toBe('danger');
    expect(presentHealth('unhealthy').tone).toBe('danger');
  });

  it('amber is reserved for the state where nothing is broken yet', () => {
    expect(presentHealth('expiring').tone).toBe('warning');
  });

  it('never labels a broken account "Connected"', () => {
    for (const h of ['expired', 'unhealthy', 'revoked'] as const) {
      expect(presentHealth(h).label).not.toBe('Connected');
    }
  });
});

describe('schedule labels carry the day', () => {
  const now = new Date(2026, 8, 18, 10, 0); // Fri 18 Sep 2026, 10:00 local

  it('today and tomorrow are named rather than dated', () => {
    expect(scheduleLabel(new Date(2026, 8, 18, 14, 0).toISOString(), now)).toMatch(/^Today /);
    expect(scheduleLabel(new Date(2026, 8, 19, 9, 0).toISOString(), now)).toMatch(/^Tomorrow /);
  });

  it('later days carry a weekday, never a bare time', () => {
    const label = scheduleLabel(new Date(2026, 8, 22, 9, 0).toISOString(), now);
    expect(label).toMatch(/Tue/);
    expect(label).not.toMatch(/^\d/);
  });

  it('an unparseable timestamp says so rather than "Invalid Date"', () => {
    expect(scheduleLabel('garbage', now)).toBe('Unscheduled');
  });
});

describe('small words', () => {
  it('counts posts in the singular and plural', () => {
    expect(pluralPosts(0)).toBe('0 posts');
    expect(pluralPosts(1)).toBe('1 post');
    expect(pluralPosts(12)).toBe('12 posts');
  });

  it('names networks the way an operator would, and passes an unknown key through', () => {
    expect(providerLabel('linkedin_member')).toBe('LinkedIn');
    expect(providerLabel('meta_instagram')).toBe('Instagram');
    expect(providerLabel('bluesky')).toBe('bluesky');
  });
});
