import fs from 'fs';
import path from 'path';

/**
 * EVERY SCHEDULED EVENT KEEPS THE ZOOM LINK IT ALREADY HAS.
 *
 * Classes, community rooms and internship rooms have links that are already in
 * calendars, in Basecamp, in emails and in people's heads. Re-provisioning one
 * would silently move a meeting out from under whoever had the old link, and they
 * would find out by sitting alone in an empty room.
 *
 * Multi-host work makes this a live risk: the moment host selection exists, a
 * refactor can plausibly decide to "re-home" an existing meeting onto a better
 * host. Nothing may do that automatically.
 *
 * Four code paths create Zoom meetings. Each one must return early when a link is
 * already present. This test reads their source and checks that guard is still
 * there, and — just as importantly — fails when a FIFTH path appears, so a new
 * creator cannot be added without someone deciding how it behaves on re-run.
 */

const SRC = path.join(__dirname, '..', '..');

/** The four known creators, with the guard each must keep. */
const KNOWN_CREATORS: Array<{ file: string; guard: RegExp; why: string }> = [
  {
    file: 'services/communityRooms/roomOutboxHandlers.ts',
    guard: /if \(booking\.meeting_link\) return;/,
    why: 'a booked room keeps its link when the outbox is drained again',
  },
  {
    file: 'services/communityRooms/roomService.ts',
    guard: /if \(room\.meeting_link\) return \{ join_url: room\.meeting_link \};/,
    why: 'an always-open video room keeps its permanent link',
  },
  {
    file: 'services/meetingService.ts',
    guard: /if \(session\.meeting_link\) return session\.meeting_link;/,
    why: 'a scheduled CLASS keeps the link already shared with the cohort',
  },
  {
    file: 'services/internship/internshipMeetingRooms.ts',
    guard: /if \(room\.meeting_link\) return room\.meeting_link;/,
    why: 'the standing internship rooms keep their year-long links',
  },
];

function allSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      allSourceFiles(full, out);
    } else if (/\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('an existing Zoom link is never replaced', () => {
  it.each(KNOWN_CREATORS)('$file returns early when a link exists — so $why', ({ file, guard }) => {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    // Positive control: a wrong path would throw above, but an empty file would
    // make the guard assertion fail confusingly rather than clearly.
    expect(src.length).toBeGreaterThan(200);
    expect(src).toMatch(guard);
  });

  it('no FIFTH path creates meetings without this test knowing about it', () => {
    // The guard above protects the paths we know. This protects against a new one
    // appearing unreviewed — the way the practice flow itself was added.
    const creators = allSourceFiles(SRC)
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf8');
        // Direct Zoom creation, or the adapter's createMeeting. Excludes the
        // zoomService/provider/idempotency plumbing those calls go THROUGH.
        return /\bcreateMeeting\s*\(/.test(src) || /createMeetingForSession\s*\(/.test(src);
      })
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));

    // Positive control: if the scan finds nothing, every assertion here is vacuous.
    expect(creators.length).toBeGreaterThan(3);

    const PLUMBING = [
      'services/zoomService.ts',
      'services/communityRooms/meetingProvider.ts',
      'services/communityRooms/zoomMeetingIdempotency.ts',
    ];
    const unexpected = creators
      .filter((f) => !PLUMBING.includes(f))
      .filter((f) => !KNOWN_CREATORS.some((k) => k.file === f));

    // If this fails: a new path creates Zoom meetings. Decide what it does when a
    // link already exists, then add it to KNOWN_CREATORS with its guard.
    expect(unexpected).toEqual([]);
  });
});
