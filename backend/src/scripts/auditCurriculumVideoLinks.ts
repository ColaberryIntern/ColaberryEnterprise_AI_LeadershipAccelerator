/**
 * Audit every video-bearing card in the curriculum timeline for a dead link.
 *
 * Why this exists: on 2026-08-12 a student was hard-blocked in Week 3 because a
 * card pointed at a video whose owning channel had been terminated. A dead embed
 * emits no watch beats, so the watch gate can never be satisfied, the card can
 * never complete, and section_complete gating keeps the rest of the week locked.
 * Nothing in the system noticed — the first signal was a support ticket. Third-
 * party videos vanish without touching our code, so link health has to be polled.
 *
 * Read-only. Writes nothing, repairs nothing. Repair is a human decision because
 * picking a replacement video is a curriculum judgement, not a mechanical one.
 *
 * Run inside the backend container:
 *   docker exec accelerator-backend node /app/dist/scripts/auditCurriculumVideoLinks.js
 *   docker exec accelerator-backend node /app/dist/scripts/auditCurriculumVideoLinks.js --json
 * Or from source: `npx ts-node src/scripts/auditCurriculumVideoLinks.ts`
 *
 * Written in TypeScript rather than plain JS on purpose: backend/tsconfig.json
 * has no `allowJs`, so a .js file under src/scripts never reaches dist/ and
 * therefore cannot be run in the container at all.
 *
 * Exit codes: 0 = every student-reachable link resolved, 1 = at least one DEAD
 * link a student can reach, 2 = audit could not run (DB unreachable). UNKNOWN
 * results never fail the run — a rate limit or a network blip must not page anyone.
 */
import { sequelize } from '../config/database';

const OEMBED = 'https://www.youtube.com/oembed';
const TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 5;

const asJson = process.argv.includes('--json');

function log(...args: unknown[]): void {
  if (!asJson) console.log(...args);
}

export interface VideoCardRow {
  id: string;
  week: number | null;
  bucket: string;
  type: string;
  title: string;
  subtitle: string | null;
  visibility: string;
  video_url: string;
}

/**
 * `video_title` rather than `title` on purpose: this is the title YouTube
 * reports for the video, which is a different thing from the card's own title
 * and must not collide with it when the two are merged into an AuditResult.
 * (They did collide — `string` vs `string | null` — and it failed the build.)
 */
export type ProbeOutcome =
  | { state: 'OK'; channel: string | null; video_title: string | null }
  | { state: 'DEAD'; httpStatus: 404 }
  | { state: 'UNKNOWN'; error: string };

export interface AuditResult extends Partial<VideoCardRow> {
  state: 'OK' | 'DEAD' | 'UNKNOWN' | 'SKIPPED';
  video_id?: string;
  note?: string;
  channel?: string | null;
  video_title?: string | null;
  error?: string;
  httpStatus?: number;
}

/**
 * Accepts watch?v=, youtu.be/, /embed/ and /shorts/ forms. Returns null for a
 * non-YouTube URL so those are reported as SKIPPED rather than guessed at.
 */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /\/embed\/([A-Za-z0-9_-]{6,})/,
    /\/shorts\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * A 404 from oEmbed is authoritative: the video is removed, private, or its
 * channel is gone. Everything else that is not a 200 is inconclusive and is
 * retried, then reported as UNKNOWN so a transient failure is never mistaken
 * for a dead video.
 */
export async function probe(videoId: string): Promise<ProbeOutcome> {
  const target = `${OEMBED}?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  let lastError = 'unknown';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(TIMEOUT_MS) });

      if (res.status === 200) {
        const body = await res.json();
        return { state: 'OK', channel: body.author_name ?? null, video_title: body.title ?? null };
      }
      if (res.status === 404) {
        return { state: 'DEAD', httpStatus: 404 };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      const e = err as Error;
      lastError = e.name === 'TimeoutError' ? 'TimeoutError' : `${e.name}: ${e.message}`;
    }

    if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt); // linear backoff, capped by MAX_ATTEMPTS
  }

  return { state: 'UNKNOWN', error: lastError };
}

/**
 * Bounded worker pool. Keeps us well under YouTube's rate limit on a ~100 card
 * curriculum while still finishing in a few seconds.
 */
export async function probeAll(cards: VideoCardRow[]): Promise<AuditResult[]> {
  const results: AuditResult[] = new Array(cards.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < cards.length) {
      const i = cursor++;
      const card = cards[i];
      const videoId = youtubeId(card.video_url);

      if (!videoId) {
        results[i] = { ...card, state: 'SKIPPED', note: 'not a recognised YouTube URL' };
        continue;
      }
      const outcome = await probe(videoId);
      results[i] = { ...card, video_id: videoId, ...outcome };
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cards.length) }, worker));
  return results;
}

async function main(): Promise<void> {
  try {
    await sequelize.authenticate();
  } catch (err) {
    const e = err as Error;
    console.error(`[VideoLinkAudit] DB unreachable: ${e.name}: ${e.message}`);
    process.exit(2);
  }

  // Deliberately NOT filtered to type='video'. Several other card types
  // (ai_video_stream, live_class, testimonial, podcast) carry the same
  // metadata.video.url and break the same way; keying on the presence of the
  // URL rather than on a type allowlist means a new video-bearing type is
  // covered the day it ships instead of the day someone remembers to add it.
  const [cards] = await sequelize.query(`
    SELECT id,
           week,
           bucket,
           type,
           title,
           subtitle,
           visibility,
           metadata->'video'->>'url' AS video_url
    FROM timeline_cards
    WHERE status = 'active'
      AND metadata->'video'->>'url' IS NOT NULL
    ORDER BY week NULLS FIRST, "order"
  `);

  const rows = cards as unknown as VideoCardRow[];
  log(`[VideoLinkAudit] probing ${rows.length} active video-bearing cards`);

  const results = await probeAll(rows);
  const dead = results.filter((r) => r.state === 'DEAD');
  const unknown = results.filter((r) => r.state === 'UNKNOWN');
  const skipped = results.filter((r) => r.state === 'SKIPPED');

  // Only a dead link a student can actually reach is worth failing the run for.
  // Archived cards keep a stale URL harmlessly (there is a BigBuckBunny sample
  // placeholder sitting in one), and paging someone about those trains people
  // to ignore the alert.
  const blocking = dead.filter((r) => r.visibility === 'published');

  if (asJson) {
    console.log(JSON.stringify({
      checked: results.length,
      ok: results.length - dead.length - unknown.length - skipped.length,
      dead: dead.length,
      blocking: blocking.length,
      unknown: unknown.length,
      skipped: skipped.length,
      results,
    }, null, 2));
  } else {
    for (const r of dead) {
      const tag = r.visibility === 'published' ? 'DEAD    ' : 'DEAD(arc)';
      console.log(`  ${tag} wk${r.week ?? '-'} [${r.bucket}/${r.type}] ${r.video_id}  "${r.title}" (${r.subtitle || 'no channel'})  card=${r.id}`);
    }
    for (const r of unknown) {
      console.log(`  UNKNOWN  wk${r.week ?? '-'} [${r.bucket}/${r.type}] ${r.video_id}  "${r.title}"  reason=${r.error}`);
    }
    for (const r of skipped) {
      console.log(`  SKIPPED  wk${r.week ?? '-'} [${r.bucket}/${r.type}] "${r.title}"  url=${r.video_url}`);
    }
    console.log(
      `[VideoLinkAudit] checked=${results.length} ` +
      `ok=${results.length - dead.length - unknown.length - skipped.length} ` +
      `dead=${dead.length} (${blocking.length} student-facing) ` +
      `unknown=${unknown.length} skipped=${skipped.length}`
    );
  }

  await sequelize.close();
  process.exit(blocking.length > 0 ? 1 : 0);
}

// Only touch the database when run as a script; importing this file (tests)
// gets the pure helpers and nothing else.
if (require.main === module) {
  main().catch((err: Error) => {
    console.error(`[VideoLinkAudit] failed: ${err.name}: ${err.message}`);
    process.exit(2);
  });
}
