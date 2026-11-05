/**
 * The daily community digest email.
 *
 * REDESIGN SOURCE. Aleem, UX Team to-do "Re-Design Screens Colaberry
 * Platforms", comment 10479067904, 2026-11-05 09:53 UTC, accepted by Ali. He
 * attached both states as finished email HTML (community-digest-active-day.
 * email.html and community-digest-quiet-day.email.html) and described them:
 *
 *   "A daily email sent each morning to learners in the AI Systems Architect
 *    Accelerator. It answers one question in under ten seconds: did anything
 *    happen in my cohort that needs me today? It replaces the plain-text
 *    version you shared, which buried two zeros and an empty 'Upcoming' line
 *    in unstyled text."
 *
 * His five sections, in his order, are what this builds:
 *
 *   1. "Cherry hero: eyebrow with program, email type, and date. The headline
 *      is the digest's one-line verdict ... One CTA, Open the community."
 *   2. "Two stat tiles ... Zeros are shown honestly rather than hidden."
 *   3. "Mentions card (active day only): who mentioned or replied to you,
 *      when, a snippet, and a Reply link."
 *   4. "Upcoming card: sessions and Open Houses with a date block, time,
 *      format, duration, and Add to calendar. On a quiet day it becomes a
 *      proper empty state."
 *   5. "Footer: sender and program line, plus frequency and unsubscribe
 *      controls."
 *
 * And on why both states ship from one template:
 *
 *   "The quiet day is the most common send, so it has to feel calm and
 *    intentional rather than broken. The active day proves the same layout
 *    scales when there is real content, with no redesign between the two."
 *
 * ── THREE PLACES THIS DEPARTS FROM HIS FILES, EACH FOR A REASON ────────────
 *
 * 1. LINKS. His files point at portal.colaberry.com/community, /calendar and
 *    /settings/notifications, which are mockup URLs. The real routes are
 *    /portal/community and /portal/schedule (frontend/src/routes/portalRoutes
 *    .tsx); there is no notification-preferences route at all, so the one
 *    footer control is the unsubscribe mailbox that this email's
 *    List-Unsubscribe header already advertises. A link that goes nowhere is
 *    worse than no link.
 * 2. FREQUENCY LINE. His footer says "every morning at 8 AM CT". The cron is
 *    `0 8 * * *` UTC (schedulerService.ts), which is 2 or 3 AM Central. The
 *    line states the frequency without the false clock time.
 * 3. DIRECT MESSAGES. His design has exactly two stat tiles and no DM number,
 *    because the plain-text mail he was shown predates the offline-DM fix.
 *    That fix is deliberate and tested (emailService.digest.test.ts): a DM
 *    count renders only when there is one, so it is kept here as a third tile
 *    that appears on the same terms.
 */
import { env } from '../../config/env';
import {
  TOKENS,
  cardEyebrow,
  cardRow,
  emailShell,
  escapeHtml,
  firstName,
  footerRow,
  heroRow,
  inlineLink,
  listItem,
  logoRow,
  portalBase,
  spacerRow,
  statTile,
  twoTileRow,
} from './acceleratorEmailKit';

const T = TOKENS;
const CENTRAL_TZ = 'America/Chicago';

/** One unread mention or reply, shown in the mentions card. */
export interface DigestMention {
  /** Community display name of whoever mentioned or replied. */
  actorName: string;
  /** 'mention' reads as a mention of the learner; 'reply' as a reply to them. */
  kind: 'mention' | 'reply';
  /** The post or comment text; truncated for the card. */
  snippet: string;
  occurredAt: Date;
}

/** One upcoming session or Open House. Mirrors CalendarEvent's useful fields. */
export interface DigestEvent {
  title: string;
  event_type: string;
  starts_at: Date;
  /** Used for the duration chip; omitted from the line when absent. */
  ends_at?: Date | null;
  /** Used for the format chip ("Live on Zoom"); omitted when absent. */
  meeting_link?: string | null;
}

export interface CommunityDigestEmailData {
  to: string;
  fullName: string;
  /** The digest's own date key, YYYY-MM-DD. Drives the hero eyebrow. */
  digestDate: string;
  unreadNotificationCount: number;
  unreadDmCount: number;
  newPostCount: number;
  upcomingEvents: DigestEvent[];
  /** Detail behind unreadNotificationCount. Empty renders no mentions card. */
  mentions?: DigestMention[];
  /** Injected in tests so "2h ago" is deterministic. */
  now?: Date;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** "Thu, Nov 5" from a YYYY-MM-DD key. Read as UTC so the key never shifts. */
function eyebrowDate(digestDate: string): string {
  const d = new Date(`${digestDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "6:00 PM CT" — Central, because every cohort session is scheduled in Central. */
function centralTime(d: Date): string {
  return `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CENTRAL_TZ })} CT`;
}

/** "45 min" / "90 min". Null when we cannot measure it honestly. */
function duration(e: DigestEvent): string | null {
  if (!e.ends_at) return null;
  const mins = Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000);
  return mins > 0 ? `${mins} min` : null;
}

/** "Live on Zoom" only when the link really is Zoom. */
function format(e: DigestEvent): string | null {
  if (!e.meeting_link) return null;
  return /zoom\./i.test(e.meeting_link) ? 'Live on Zoom' : 'Live online';
}

/** "2h ago" / "Yesterday" / "3d ago". */
export function relativeTime(then: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - new Date(then).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function truncate(text: string, max = 150): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The hero's one-line verdict. Aleem specifies the two ends of it: "'Quiet day
 * in your cohort' when nothing happened, '3 people mentioned you' when
 * something did". The middle cases (posts or DMs but no mentions) are not in
 * his files, so they follow the same shape: name the biggest true number.
 */
export function digestVerdict(data: CommunityDigestEmailData): { headline: string; subhead: string } {
  const name = firstName(data.fullName);
  const { unreadNotificationCount: mentions, newPostCount: posts, unreadDmCount: dms } = data;
  const busy = 'Your cohort has been busy since yesterday. Catch up in a few minutes.';

  if (mentions > 0) {
    return {
      headline: `${mentions} ${plural(mentions, 'person', 'people')} mentioned you, ${name}.`,
      subhead: busy,
    };
  }
  if (dms > 0) {
    return {
      headline: `${dms} new ${plural(dms, 'message', 'messages')} waiting, ${name}.`,
      subhead: busy,
    };
  }
  if (posts > 0) {
    return {
      headline: `${posts} new ${plural(posts, 'post', 'posts')} in your cohort, ${name}.`,
      subhead: busy,
    };
  }
  return {
    headline: `Quiet day in your cohort, ${name}.`,
    subhead: 'Nothing new since yesterday. Here is where things stand.',
  };
}

function mentionItem(m: DigestMention, now: Date, communityUrl: string): string {
  const initial = escapeHtml((m.actorName || '?').trim().charAt(0).toUpperCase() || '?');
  const body = m.kind === 'reply' ? `Replied to your post: ${m.snippet}` : m.snippet;
  return listItem(`
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="36" valign="top" style="padding:0 12px 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="36" align="center" valign="middle" bgcolor="${T.avatarBg}" style="width:36px;height:36px;border-radius:18px;background-color:${T.avatarBg};font-family:${T.sans};font-size:14px;line-height:36px;font-weight:700;color:#FFFFFF;">${initial}</td></tr></table>
                </td>
                <td valign="top">
                  <p style="margin:0;font-family:${T.sans};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:700;color:${T.ink};">${escapeHtml(m.actorName)} <span style="font-family:${T.mono};font-size:12px;font-weight:400;color:${T.inkSubtle};">&nbsp;${escapeHtml(relativeTime(m.occurredAt, now))}</span></p>
                  <p style="margin:2px 0 6px;font-family:${T.sans};font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:${T.inkMuted};">${escapeHtml(truncate(body))}</p>
                  ${inlineLink(communityUrl, 'Reply')}
                </td>
              </tr></table>`);
}

function eventItem(e: DigestEvent, calendarUrl: string): string {
  const starts = new Date(e.starts_at);
  const weekday = starts.toLocaleDateString('en-US', { weekday: 'short', timeZone: CENTRAL_TZ });
  const day = starts.toLocaleDateString('en-US', { day: 'numeric', timeZone: CENTRAL_TZ });
  const meta = [centralTime(starts), format(e), duration(e)].filter(Boolean).join(' &middot; ');
  return listItem(`
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="52" valign="top" style="padding:0 14px 0 0;">
                  <table role="presentation" width="52" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.brandTint}" style="background-color:${T.brandTint};border-radius:10px;border-collapse:separate;"><tr><td align="center" style="padding:8px 0;">
                    <p style="margin:0;font-family:${T.mono};font-size:11px;line-height:14px;mso-line-height-rule:exactly;letter-spacing:1px;text-transform:uppercase;color:${T.brand};">${escapeHtml(weekday)}</p>
                    <p style="margin:0;font-family:${T.sans};font-size:22px;line-height:26px;mso-line-height-rule:exactly;font-weight:900;color:${T.brand};">${escapeHtml(day)}</p>
                  </td></tr></table>
                </td>
                <td valign="top">
                  <p style="margin:0;font-family:${T.sans};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:700;color:${T.ink};">${escapeHtml(e.title)}</p>
                  <p style="margin:2px 0 6px;font-family:${T.sans};font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:${T.inkSubtle};">${meta}</p>
                  ${inlineLink(calendarUrl, 'Add to calendar')}
                </td>
              </tr></table>`);
}

/**
 * The Upcoming card. Aleem's point about the quiet day is that the old
 * "No upcoming sessions or Open Houses scheduled." grey sentence read as
 * breakage, so the empty state here says what is true and offers the calendar.
 */
function upcomingCard(events: DigestEvent[], calendarUrl: string): string {
  if (!events.length) {
    return cardRow(`
          ${cardEyebrow('Upcoming')}
          <p style="margin:0 0 10px;font-family:${T.sans};font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:${T.ink};">No sessions or Open Houses on the calendar yet. We will send a note as soon as one is added.</p>
          ${inlineLink(calendarUrl, 'See the full calendar', 14)}
        `);
  }
  const items = events.slice(0, 5).map((e) => eventItem(e, calendarUrl)).join('\n          ');
  return cardRow(`
          ${cardEyebrow('Upcoming')}
          ${items}
        `);
}

function mentionsCard(mentions: DigestMention[], now: Date, communityUrl: string): string {
  const items = mentions.slice(0, 5).map((m) => mentionItem(m, now, communityUrl)).join('\n          ');
  return cardRow(`
          ${cardEyebrow('Mentions')}
          ${items}
        `);
}

/** Render the digest. Pure apart from reading the portal origin and from-address. */
export function buildCommunityDigestHtml(data: CommunityDigestEmailData): string {
  const now = data.now ?? new Date();
  const base = portalBase();
  const communityUrl = `${base}/portal/community`;
  const calendarUrl = `${base}/portal/schedule`;
  const verdict = digestVerdict(data);
  const mentions = data.mentions ?? [];

  const rows: string[] = [
    logoRow(),
    heroRow({
      // Literal middle dots, not entities: heroRow escapes the eyebrow.
      eyebrow: `Accelerator · Community Digest · ${eyebrowDate(data.digestDate)}`,
      headline: verdict.headline,
      subhead: verdict.subhead,
      ctaHref: communityUrl,
      ctaLabel: 'Open the community',
    }),
    spacerRow,
    twoTileRow(
      statTile(
        String(data.unreadNotificationCount),
        plural(data.unreadNotificationCount, 'unread mention or reply', 'unread mentions and replies')
      ),
      statTile(
        String(data.newPostCount),
        `new ${plural(data.newPostCount, 'post', 'posts')} in your cohort since yesterday`
      )
    ),
  ];

  // Only when there is something to report — see the DM note in the header.
  if (data.unreadDmCount > 0) {
    rows.push(spacerRow);
    rows.push(
      cardRow(
        `
              <p style="margin:0;font-family:${T.sans};font-size:36px;line-height:40px;mso-line-height-rule:exactly;font-weight:900;letter-spacing:-0.5px;color:${T.ink};">${data.unreadDmCount}</p>
              <p style="margin:4px 0 0;font-family:${T.sans};font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:${T.inkSubtle};">new ${plural(data.unreadDmCount, 'message', 'messages')} in your inbox</p>
            `
      )
    );
  }

  if (mentions.length) {
    rows.push(spacerRow);
    rows.push(mentionsCard(mentions, now, communityUrl));
  }

  rows.push(spacerRow);
  rows.push(upcomingCard(data.upcomingEvents, calendarUrl));
  rows.push(
    footerRow(
      'Colaberry Enterprise AI · AI Systems Architect Accelerator',
      `You get this digest once a day. <a class="gm-link" href="mailto:${escapeHtml(env.emailFrom)}?subject=unsubscribe" style="color:${T.link};text-decoration:underline;">Unsubscribe</a>`
    )
  );

  const preheader =
    data.unreadNotificationCount > 0 || data.newPostCount > 0 || data.unreadDmCount > 0
      ? `${verdict.headline} ${data.newPostCount} new ${plural(data.newPostCount, 'post', 'posts')} in your cohort since yesterday.`
      : 'Quiet day in your cohort. Nothing new since yesterday.';

  return emailShell('Your Community Digest', preheader, rows.join('\n'));
}
