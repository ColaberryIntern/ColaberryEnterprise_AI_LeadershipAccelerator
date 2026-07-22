/**
 * updateClassSessionContent.ts — bring a cohort's live_sessions in line with the
 * content strategy (AI_BUILD_SHOW_STRATEGY.md): blueprint-matched titles, rich
 * Monday/Thursday descriptions, and a stored kit_json run-of-show.
 *
 * Titles become:
 *   "Week N · Architecture Day — <Blueprint Title>"  (Monday)
 *   "Week N · Build Day — <Blueprint Title>"          (Thursday)
 *   "Orientation — Welcome to the Accelerator"        (the opener)
 * so they match the curriculum blueprint names the admin dropdown shows, and the
 * "Week N" prefix keeps getSessionCurriculum's parse working.
 *
 * Idempotent: day kind is re-detected from the (possibly already-renamed) title
 * and the weekday, so re-running writes the same values. DRY-RUN by default —
 * pass --commit to persist.
 *
 * Usage (inside the backend container, after deploy):
 *   node dist/scripts/updateClassSessionContent.js <cohortId>            # preview
 *   node dist/scripts/updateClassSessionContent.js <cohortId> --commit   # write
 */
import { Cohort, LiveSession } from '../models';
import { buildKitSpec, detectDayKind } from '../services/classKit/kitSpec';
import { weekClassContent, ORIENTATION_PLAN, WEEK_CLASS_CONTENT } from '../data/classSessionPlan';

interface Computed {
  title: string;
  description: string;
  kit_json: Record<string, unknown>;
}

function parseWeek(title: string): number | null {
  const m = title.match(/week\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Order-insensitive JSON serialization (sorts object keys recursively). */
function canonical(v: unknown): string {
  const norm = (x: any): any => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') {
      return Object.keys(x).sort().reduce((o: any, k) => { o[k] = norm(x[k]); return o; }, {});
    }
    return x;
  };
  return JSON.stringify(norm(v));
}

function computeForSession(s: LiveSession, cohortName: string): Computed | null {
  const dayKind = detectDayKind(s.title, s.session_date);
  const week = dayKind === 'orientation' ? null : parseWeek(s.title);

  let title: string;
  let description: string;

  if (dayKind === 'orientation') {
    title = ORIENTATION_PLAN.title;
    description =
      `${ORIENTATION_PLAN.welcome} Tonight: Ali on the big picture (60 min), ` +
      `Taiwo on the platform (30 min), Swati on Claude Code + VS Code setup (30 min).`;
  } else {
    const wc = week != null ? weekClassContent(week) : undefined;
    if (!wc) return null; // unknown week — leave the session untouched
    if (dayKind === 'architecture') {
      title = `Week ${week} · Architecture Day — ${wc.title}`;
      description = `Architecture Day (Learn It Monday). ${wc.monday.tension} By Thursday: ${wc.monday.payoffPreview}`;
    } else {
      title = `Week ${week} · Build Day — ${wc.title}`;
      description =
        `Build Day (Build It Thursday). ${wc.thursday.resultPreview} ` +
        `A controlled failure and recovery on camera, then your 30-second Build Proof. ` +
        `Prove it by Friday: ${wc.assignment.title}.`;
    }
  }

  // Build the spec for the stored run-of-show (QR/checkin not needed for the outline).
  const spec = buildKitSpec({
    session: {
      id: s.id, session_number: s.session_number, title,
      session_date: s.session_date, start_time: s.start_time, end_time: s.end_time, status: s.status,
    },
    cohortName, checkinUrl: '', qrSvg: '', meetLink: s.meeting_link || null,
  });

  // Deterministic payload (no timestamp) so re-running is a true no-op — the
  // caller compares this against the stored kit_json and skips unchanged rows.
  const kit_json = {
    day_kind: spec.meta.dayKind,
    day_label: spec.meta.dayLabel,
    week: spec.meta.week,
    public_title: spec.meta.publicTitle,
    intensive: spec.meta.intensive,
    total_minutes: spec.totalMinutes,
    run_of_show: spec.segments,
    outline: spec.slides.map((sl) => ({ segment: sl.segmentLabel, kind: sl.kind, title: sl.title })),
  };

  return { title, description, kit_json };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const cohortId = args.find((a) => !a.startsWith('--'));
  if (!cohortId) {
    console.error('Usage: node updateClassSessionContent.js <cohortId> [--commit]');
    process.exit(1);
  }

  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) { console.error('Cohort not found:', cohortId); process.exit(1); }

  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId },
    order: [['session_number', 'ASC']],
  });
  console.log(`Cohort "${cohort.name}" — ${sessions.length} sessions. ${commit ? 'COMMITTING' : 'DRY RUN'}\n`);

  let changed = 0;
  for (const s of sessions) {
    const c = computeForSession(s, cohort.name);
    if (!c) { console.log(`  #${s.session_number}  [skip: unknown week] ${s.title}`); continue; }
    // Compare kit_json canonically: Postgres JSONB read-back reorders keys, so a
    // plain JSON.stringify would always differ. Sorting keys recursively makes the
    // writer a true no-op on re-run (persisted state is already identical either way).
    const kitDiffers = canonical(s.kit_json ?? null) !== canonical(c.kit_json);
    const willChange = s.title !== c.title || (s.description || '') !== c.description || kitDiffers;
    console.log(`  #${s.session_number}  ${s.session_date}`);
    console.log(`     old: ${s.title}`);
    console.log(`     new: ${c.title}${willChange ? '' : '  (unchanged)'}`);
    if (commit && willChange) {
      await s.update({ title: c.title, description: c.description, kit_json: c.kit_json });
      changed++;
    }
  }

  console.log(`\n${commit ? `Updated ${changed} sessions.` : 'Dry run complete — pass --commit to write.'}`);
  // Show the sanity coverage: every week 1..12 should have an Architecture + Build day.
  const weeks = WEEK_CLASS_CONTENT.map((w) => w.week);
  console.log(`Blueprint weeks available: ${weeks.join(', ')}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
