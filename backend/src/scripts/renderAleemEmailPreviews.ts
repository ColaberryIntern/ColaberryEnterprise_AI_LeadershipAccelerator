/**
 * Render the two redesigned Accelerator emails to standalone HTML files so a
 * human (or Playwright) can look at them next to Aleem's reference mockups.
 *
 * Single responsibility: render and write. It sends nothing, reads no
 * database, and touches no production state.
 *
 * Usage:  npx ts-node --transpile-only src/scripts/renderAleemEmailPreviews.ts [outDir]
 *
 * Writes four files, which are the four states the two templates have:
 *   portal-access.html          the magic-link mail
 *   digest-quiet.html           digest, nothing happened (the common send)
 *   digest-active.html          digest, mentions + posts + an event
 *   digest-active-dm.html       digest, active plus an unread DM tile
 *
 * The reference files these are meant to match are Aleem's attachments on
 * https://app.basecamp.com/3945211/buckets/12724483/todos/10478732232
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildPortalAccessEmailHtml } from '../services/email/portalAccessEmail';
import { CommunityDigestEmailData, buildCommunityDigestHtml } from '../services/email/communityDigestEmail';

const NOW = new Date('2026-11-05T15:00:00Z');

const quiet: CommunityDigestEmailData = {
  to: 'learner@example.com',
  fullName: 'Mohammed Abdul Aleem',
  digestDate: '2026-11-05',
  unreadNotificationCount: 0,
  unreadDmCount: 0,
  newPostCount: 0,
  upcomingEvents: [],
  now: NOW,
};

const active: CommunityDigestEmailData = {
  ...quiet,
  unreadNotificationCount: 3,
  newPostCount: 12,
  mentions: [
    {
      actorName: 'Rhea Kapoor',
      kind: 'mention',
      snippet: '@Mohammed how did you bring retrieval latency down in the week 3 lab? Mine is still over 900 ms.',
      occurredAt: new Date('2026-11-05T13:00:00Z'),
    },
    {
      actorName: 'Daniel Osei',
      kind: 'reply',
      snippet: 'agreed on evaluation first, the rubric you shared is now in our shared doc.',
      occurredAt: new Date('2026-11-05T10:00:00Z'),
    },
    {
      actorName: 'Priya Nair',
      kind: 'mention',
      snippet: '@Mohammed can you review my architecture diagram before Friday? Posted it in the cohort channel.',
      occurredAt: new Date('2026-11-04T14:00:00Z'),
    },
  ],
  upcomingEvents: [
    {
      title: 'Open House: Agentic workflows in production',
      event_type: 'open_house',
      starts_at: new Date('2026-11-07T00:00:00Z'),
      ends_at: new Date('2026-11-07T00:45:00Z'),
      meeting_link: 'https://colaberry.zoom.us/j/1',
    },
    {
      title: 'Cohort session 9: Evaluation pipelines',
      event_type: 'live_session',
      starts_at: new Date('2026-11-11T01:00:00Z'),
      ends_at: new Date('2026-11-11T02:30:00Z'),
      meeting_link: 'https://colaberry.zoom.us/j/2',
    },
  ],
};

function main(): void {
  const outDir = process.argv[2] || path.join(process.cwd(), 'tmp', 'email-previews');
  fs.mkdirSync(outDir, { recursive: true });

  const files: Array<[string, string]> = [
    [
      'portal-access.html',
      buildPortalAccessEmailHtml(
        { fullName: 'Mohammed Abdul Aleem', cohortName: 'Explorer: Prospects' },
        // Deliberately not shaped like a real token. A realistic UUID here trips the
        // staged-diff secret scan (generic-api-key), and an exemption comment would be
        // the wrong fix: sample data in a preview script should be obviously sample data.
        'https://enterprise.colaberry.ai/portal/verify?token=EXAMPLE-PREVIEW-TOKEN'
      ),
    ],
    ['digest-quiet.html', buildCommunityDigestHtml(quiet)],
    ['digest-active.html', buildCommunityDigestHtml(active)],
    ['digest-active-dm.html', buildCommunityDigestHtml({ ...active, unreadDmCount: 2 })],
  ];

  for (const [name, html] of files) {
    const dest = path.join(outDir, name);
    fs.writeFileSync(dest, html, 'utf8');
    console.log(`${dest}  ${Buffer.byteLength(html, 'utf8')} bytes`);
  }
}

main();
