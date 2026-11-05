/**
 * Aleem's accepted redesign of the two student-facing Accelerator emails:
 * the portal access (magic-link) mail and the daily community digest.
 * Source: UX Team to-do 10478732232, comments 10478789584 and 10479067904,
 * 2026-11-05.
 *
 * These are pure renderers, so there is no SMTP, no database and no mocking
 * beyond config/env. What is asserted is the part a screenshot cannot prove:
 * that the structure Aleem specified is present in both states, that the
 * numbers and plurals are right at the boundaries, that learner-authored text
 * is escaped, and that neither template ships a claim this system cannot
 * honour.
 */
jest.mock('../../../config/env', () => ({
  env: {
    frontendUrl: 'https://enterprise.colaberry.ai',
    emailFrom: 'noreply@colaberry.com',
  },
}));

import { buildPortalAccessEmailHtml } from '../portalAccessEmail';
import {
  CommunityDigestEmailData,
  buildCommunityDigestHtml,
  digestVerdict,
  relativeTime,
} from '../communityDigestEmail';

const MAGIC = 'https://enterprise.colaberry.ai/portal/verify?token=abc-123';
const NOW = new Date('2026-11-05T15:00:00Z');

const quietDigest: CommunityDigestEmailData = {
  to: 'ada@example.com',
  fullName: 'Ada Lovelace',
  digestDate: '2026-11-05',
  unreadNotificationCount: 0,
  unreadDmCount: 0,
  newPostCount: 0,
  upcomingEvents: [],
  now: NOW,
};

const activeDigest: CommunityDigestEmailData = {
  ...quietDigest,
  unreadNotificationCount: 3,
  newPostCount: 12,
  mentions: [
    {
      actorName: 'Rhea Kapoor',
      kind: 'mention',
      snippet: '@Ada how did you bring retrieval latency down in the week 3 lab?',
      occurredAt: new Date('2026-11-05T13:00:00Z'),
    },
    {
      actorName: 'Daniel Osei',
      kind: 'reply',
      snippet: 'agreed on evaluation first, the rubric you shared is now in our shared doc.',
      occurredAt: new Date('2026-11-05T10:00:00Z'),
    },
  ],
  upcomingEvents: [
    {
      title: 'Open House: Agentic workflows in production',
      event_type: 'open_house',
      starts_at: new Date('2026-11-07T00:00:00Z'), // 6:00 PM CT on Fri 6 Nov
      ends_at: new Date('2026-11-07T00:45:00Z'),
      meeting_link: 'https://colaberry.zoom.us/j/123',
    },
  ],
};

/** The design language both emails share, taken off Aleem's attachments. */
function expectHouseStyle(html: string): void {
  expect(html).toContain('background-color:#F8F8F7'); // page
  expect(html).toContain('bgcolor="#C20E1E"'); // cherry hero
  expect(html).toContain('border-radius:16px'); // cards and hero
  expect(html).toContain('border:1px solid #E4E4E3'); // card border
  expect(html).toContain('border-radius:999px'); // pill CTA
  expect(html).toContain("font-family:Roboto,'Helvetica Neue'");
  expect(html).toContain("'Roboto Mono'"); // mono eyebrows
  expect(html).toContain('max-width:600px');
  expect(html).toContain('@media screen and (max-width:600px)');
  expect(html).toContain('<!--[if mso]>'); // Outlook shims
  expect(html).toContain('colaberry-horizontal.png'); // wordmark
}

/** House copy rules: no en/em dashes in email copy, and never the word "free". */
function expectCopyRules(html: string): void {
  expect(html).not.toMatch(/[–—]/);
  expect(html).not.toMatch(/\bfree\b/i);
}

describe('portal access email — Aleem redesign', () => {
  it('happy: renders his five blocks in order, in the house style', () => {
    const html = buildPortalAccessEmailHtml({ fullName: 'Mohammed Abdul Aleem', cohortName: 'Explorer: Prospects' }, MAGIC);
    expectHouseStyle(html);
    expectCopyRules(html);
    // Hero: eyebrow, first-name verdict headline, one line, one CTA.
    expect(html).toContain('Accelerator Portal');
    expect(html).toContain('Mohammed, your portal is ready.');
    expect(html).toContain('Sign in with your secure personal link.');
    expect(html).toContain('Access my portal');
    // Tiles.
    expect(html).toContain('Program');
    expect(html).toContain('Explorer: Prospects');
    expect(html).toContain('24h');
    expect(html).toContain('until the link expires');
    expect(html).toContain('Inside your portal');
    expect(html).toContain('Session schedule and materials');
    expect(html).toContain('Session recordings');
    // Footer.
    expect(html).toContain('Colaberry Enterprise AI Division');
  });

  it('contract: the CTA and the paste-fallback both carry the real, untruncated magic link', () => {
    const html = buildPortalAccessEmailHtml({ fullName: 'Ada Lovelace', cohortName: 'Cohort 4' }, MAGIC);
    expect(html.split(MAGIC).length - 1).toBeGreaterThanOrEqual(3); // VML + anchor + fallback
    expect(html).toContain('Button not working? Paste this link into your browser:');
    expect(html).not.toContain('…'); // no truncated URL as in the mockup
  });

  it('truth: does not claim the link is single use or one time, because it is not', () => {
    const html = buildPortalAccessEmailHtml({ fullName: 'Ada Lovelace', cohortName: 'Cohort 4' }, MAGIC);
    expect(html).not.toMatch(/single[- ]use/i);
    expect(html).not.toMatch(/one[- ]time/i);
    expect(html).not.toMatch(/only be used once/i);
    // What it says instead is true of participantService.sendMagicLink.
    expect(html).toContain('link at a time, so use the newest');
    expect(html).toContain('This link signs in as you, so please do not forward it.');
  });

  it('boundary: a one-word name and an empty name still address the learner', () => {
    expect(buildPortalAccessEmailHtml({ fullName: 'Prince', cohortName: 'C' }, MAGIC)).toContain('Prince, your portal is ready.');
    expect(buildPortalAccessEmailHtml({ fullName: '   ', cohortName: 'C' }, MAGIC)).toContain('there, your portal is ready.');
  });

  it('failure: a cohort name carrying markup is escaped, not injected', () => {
    const html = buildPortalAccessEmailHtml({ fullName: 'Ada', cohortName: '<script>x</script>' }, MAGIC);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('idempotency: the same input renders byte-identical output', () => {
    const a = buildPortalAccessEmailHtml({ fullName: 'Ada Lovelace', cohortName: 'Cohort 4' }, MAGIC);
    const b = buildPortalAccessEmailHtml({ fullName: 'Ada Lovelace', cohortName: 'Cohort 4' }, MAGIC);
    expect(a).toBe(b);
  });
});

describe('community digest — quiet day', () => {
  it('happy: calm hero verdict, two honest zeros, and a real Upcoming empty state', () => {
    const html = buildCommunityDigestHtml(quietDigest);
    expectHouseStyle(html);
    expectCopyRules(html);
    expect(html).toContain('Quiet day in your cohort, Ada.');
    expect(html).toContain('Nothing new since yesterday. Here is where things stand.');
    expect(html).toContain('Accelerator · Community Digest · Thu, Nov 5');
    // Zeros shown, not buried.
    expect(html.split('>0</p>').length - 1).toBe(2);
    expect(html).toContain('unread mentions and replies');
    expect(html).toContain('new posts in your cohort since yesterday');
    // Empty state replaces the old bare grey sentence.
    expect(html).toContain('No sessions or Open Houses on the calendar yet.');
    expect(html).toContain('See the full calendar');
    expect(html).not.toContain('No upcoming sessions or Open Houses scheduled.');
  });

  it('boundary: no mentions means no Mentions card at all', () => {
    expect(buildCommunityDigestHtml(quietDigest)).not.toContain('Mentions');
  });

  it('idempotency: the same input renders byte-identical output', () => {
    expect(buildCommunityDigestHtml(quietDigest)).toBe(buildCommunityDigestHtml(quietDigest));
  });
});

describe('community digest — active day', () => {
  it('happy: the same layout carries real content with no second design', () => {
    const html = buildCommunityDigestHtml(activeDigest);
    expectHouseStyle(html);
    expectCopyRules(html);
    expect(html).toContain('3 people mentioned you, Ada.');
    expect(html).toContain('>3</p>');
    expect(html).toContain('>12</p>');
    // Mentions card: who, when, snippet, Reply.
    expect(html).toContain('Mentions');
    expect(html).toContain('Rhea Kapoor');
    expect(html).toContain('2h ago');
    expect(html).toContain('retrieval latency');
    expect(html).toContain('Reply');
    // A reply is labelled as one.
    expect(html).toContain('Replied to your post:');
    // Avatar initial, not a broken image.
    expect(html).toContain('>R</td>');
  });

  it('contract: the Upcoming row shows date block, Central time, format and duration', () => {
    const html = buildCommunityDigestHtml(activeDigest);
    expect(html).toContain('Open House: Agentic workflows in production');
    expect(html).toContain('6:00 PM CT');
    expect(html).toContain('Live on Zoom');
    expect(html).toContain('45 min');
    expect(html).toContain('Add to calendar');
    expect(html).toContain('>Fri</p>'); // weekday block
    expect(html).toContain('>6</p>'); // day block
  });

  it('boundary: an event with no end time and no meeting link shows only the time', () => {
    const html = buildCommunityDigestHtml({
      ...activeDigest,
      upcomingEvents: [
        { title: 'Cohort session 9', event_type: 'live_session', starts_at: new Date('2026-11-11T01:00:00Z'), ends_at: null, meeting_link: null },
      ],
    });
    expect(html).toContain('7:00 PM CT');
    expect(html).not.toContain('Live on Zoom');
    expect(html).not.toMatch(/\d+ min/);
  });

  it('failure: a learner-authored snippet carrying markup is escaped', () => {
    const html = buildCommunityDigestHtml({
      ...activeDigest,
      mentions: [{ actorName: '<b>Eve</b>', kind: 'mention', snippet: '<img src=x onerror=alert(1)>', occurredAt: NOW }],
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Eve</b>');
    expect(html).toContain('&lt;img src=x');
  });

  it('boundary: a very long snippet is truncated rather than breaking the card', () => {
    const long = 'x'.repeat(400);
    const html = buildCommunityDigestHtml({
      ...activeDigest,
      mentions: [{ actorName: 'Eve', kind: 'mention', snippet: long, occurredAt: NOW }],
    });
    expect(html).not.toContain(long);
    expect(html).toContain('…');
  });

  it('contract: links resolve to real portal routes, not the mockup URLs', () => {
    const html = buildCommunityDigestHtml(activeDigest);
    expect(html).toContain('https://enterprise.colaberry.ai/portal/community');
    expect(html).toContain('https://enterprise.colaberry.ai/portal/schedule');
    expect(html).not.toContain('portal.colaberry.com');
    expect(html).not.toContain('/settings/notifications');
  });

  it('truth: the footer states frequency without the mockup’s wrong clock time', () => {
    const html = buildCommunityDigestHtml(activeDigest);
    expect(html).toContain('You get this digest once a day.');
    expect(html).not.toContain('8 AM CT');
    expect(html).toContain('mailto:noreply@colaberry.com?subject=unsubscribe');
  });
});

describe('digestVerdict — the hero is the one-line verdict', () => {
  const base = { ...quietDigest };

  it('boundary: 1 mention is "1 person", not "1 people"', () => {
    expect(digestVerdict({ ...base, unreadNotificationCount: 1 }).headline).toBe('1 person mentioned you, Ada.');
  });

  it('happy: mentions outrank posts and DMs', () => {
    expect(digestVerdict({ ...base, unreadNotificationCount: 2, newPostCount: 9, unreadDmCount: 4 }).headline).toBe('2 people mentioned you, Ada.');
  });

  it('boundary: DMs alone, then posts alone, each get their own verdict', () => {
    expect(digestVerdict({ ...base, unreadDmCount: 1 }).headline).toBe('1 new message waiting, Ada.');
    expect(digestVerdict({ ...base, newPostCount: 1 }).headline).toBe('1 new post in your cohort, Ada.');
  });

  it('boundary: all zeros is the quiet day', () => {
    expect(digestVerdict(base).headline).toBe('Quiet day in your cohort, Ada.');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  it('renders minutes, hours, yesterday and days', () => {
    expect(relativeTime(new Date('2026-11-05T11:58:00Z'), now)).toBe('2m ago');
    expect(relativeTime(new Date('2026-11-05T10:00:00Z'), now)).toBe('2h ago');
    expect(relativeTime(new Date('2026-11-04T10:00:00Z'), now)).toBe('Yesterday');
    expect(relativeTime(new Date('2026-11-02T10:00:00Z'), now)).toBe('3d ago');
  });
  it('boundary: under a minute reads "Just now", and a future stamp does not go negative', () => {
    expect(relativeTime(new Date('2026-11-05T11:59:30Z'), now)).toBe('Just now');
    expect(relativeTime(new Date('2026-11-05T12:05:00Z'), now)).toBe('Just now');
  });
});
