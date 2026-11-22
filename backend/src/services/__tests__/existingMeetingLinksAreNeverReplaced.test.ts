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
 * Six code paths create Zoom meetings (the fifth: a confirmed Hire interview; the sixth: a booked Career Prep placement
 * interview). Each one must return early when a link is
 * already present. This test reads their source and checks that guard is still
 * there, and — just as importantly — fails when a SEVENTH path appears, so a new
 * creator cannot be added without someone deciding how it behaves on re-run.
 */

const SRC = path.join(__dirname, '..', '..');

/** The six known creators, with the guard each must keep. */
const KNOWN_CREATORS: Array<{ file: string; guard: RegExp; why: string }> = [
  {
    file: 'services/communityRooms/roomOutboxHandlers.ts',
    guard: /if \(booking\.meeting_link\) return;/,
    why: 'a booked room keeps its link when the outbox is drained again',
  },
  {
    file: 'services/communityRooms/roomService.ts',
    // One narrow exception (2026-11-13): a link Zoom reports as "Meeting does not
    // exist" (404/3001) is replaced, because it already strands everyone who has it.
    // Any other answer, including a Zoom outage, keeps the stored link.
    guard: /if \(room\.meeting_link && !deadLink\) return \{ join_url: room\.meeting_link \};/,
    why: 'an always-open video room keeps its permanent link unless Zoom says the meeting is gone',
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
  {
    file: 'services/hire/hireInterviewNotify.ts',
    guard: /if \(f\.roomUrl\) return f\.roomUrl;/,
    why: 'a confirmed Hire interview keeps the room link already sent in its invite',
  },
  {
    // Career Prep CP8.2b (2026-11-21): one room per BOOKED TIME of a placement interview. The
    // stored meeting is kept on every re-run (the route's replay, the recovery sweep); the
    // store below is also bounded in SQL. A rebook at a new time is a new room by design: the
    // old time's link is no longer the interview, and its messages are keyed by that time.
    file: 'services/placement/bookingConfirm.ts',
    guard: /if \(r\.room_provider_id\) return true;/,
    why: 'a booked placement interview keeps the meeting it already has',
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

  it('no SEVENTH path creates meetings without this test knowing about it', () => {
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
      // Added 2026-11-14 with the mint read-back. Plumbing, not a sixth creator: it
      // holds no room row and cannot decide whether a link already exists — it is
      // reached only from internshipMeetingRooms, whose own guard is asserted above.
      // What it CAN do is move a room onto a different host, so the test below pins
      // that it may only do so while the room has no link.
      'services/zoom/enterableRoomMint.ts',
      // Career Prep CP9.1 (2026-11-21): the interview room's adapter. Plumbing, not a seventh
      // creator: it holds no row and cannot see whether a meeting exists; its only caller is
      // placement/bookingConfirm.ts, whose guard and bounded store are asserted in this file.
      'services/placement/roomProvider.ts',
    ];
    const unexpected = creators
      .filter((f) => !PLUMBING.includes(f))
      .filter((f) => !KNOWN_CREATORS.some((k) => k.file === f));

    // If this fails: a new path creates Zoom meetings. Decide what it does when a
    // link already exists, then add it to KNOWN_CREATORS with its guard.
    expect(unexpected).toEqual([]);
  });

  /** CP9.1: the room adapter counts as plumbing only while bookingConfirm (with its guard) is its one creator. */
  it('only placement/bookingConfirm.ts creates through the interview room adapter', () => {
    const callers = allSourceFiles(SRC)
      .filter((f) => /roomProvider\.create\s*\(/.test(fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));
    expect(callers).toEqual(['services/placement/bookingConfirm.ts']);
  });

  /** The placement store is bounded in the SQL too: a concurrent run can never overwrite a stored meeting. */
  it('a placement interview stores a meeting only while it has none, and only for the time still booked', () => {
    const src = fs.readFileSync(path.join(SRC, 'services/placement/bookingConfirm.ts'), 'utf8');
    const store = src.slice(src.indexOf('SET room_provider_id = :pid'));
    expect(store.length).toBeGreaterThan(100);
    expect(store).toMatch(/WHERE id = :id AND room_provider_id IS NULL AND state = 'booked' AND starts_at = :start/);
  });

  /**
   * The host-failover added on 2026-11-14 is the exact refactor this file was written
   * to fear: it exists to move a room onto a different Zoom host. It is allowed to,
   * but ONLY before the room has a link — once a link is out in the world, re-homing
   * it strands whoever holds it, which is the whole premise of this suite.
   *
   * The bound is in the SQL rather than in a branch, so it is read from the SQL.
   */
  it('a room that already has a link can never have its host released', () => {
    const src = fs.readFileSync(path.join(SRC, 'services/zoom/roomHostAllocator.ts'), 'utf8');
    const release = src.slice(src.indexOf('export async function releaseRoomHost'));
    expect(release.length).toBeGreaterThan(200);
    expect(release).toMatch(/WHERE id = :id AND meeting_link IS NULL/);
  });
});
