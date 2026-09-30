/**
 * buildProgressSnapshot — the server's view of a build, shaped for mirroring
 * into the student's repo.
 *
 * WHY THIS EXISTS. Build progress is held server-side across two tables:
 * `student_tasks` (what is verified, against which commit, when, and what it
 * was originally due) and `evidence_records` (what Builder XP it paid). A
 * Command Center served by GitHub Pages cannot query either — no API, no auth,
 * no secrets. So on every publish and every sync we take this snapshot and
 * write it into `.colaberry/progress.json`, and the page renders from disk.
 *
 * "Live" in that page therefore means AS OF THE LAST SYNC, and the page is
 * required to say so. See docs/COMMAND_CENTER_DATA_CONTRACT.md.
 *
 * NOTHING VOLATILE MAY LEAVE THIS MODULE. Every field returned has to be stable
 * while the build is stable — no `checked_at`, no run id, no "now". The output
 * lands in a file whose bytes decide whether we commit to a student's repo, so
 * a moving value here would churn their git history on every sync forever.
 */
// Models are imported DYNAMICALLY, inside the functions that use them, and not
// at module scope. `Model.init` runs at import time and needs a live sequelize
// instance, so a static import here would drag a database connection into every
// module that merely wants to render documents — which is exactly what broke
// the orchestrator's unit tests, none of which have a database.
import { StoryProgressInput } from './verification/progressContract';

export interface BuildProgressSnapshot {
  /** Per-story progress, ready for `renderProgressFile`. */
  progress: StoryProgressInput[];
  /** story_id ⇒ `YYYY-MM-DD`, the write-once original due date. */
  baselineByStory: Record<string, string | null>;
}

const EMPTY: BuildProgressSnapshot = { progress: [], baselineByStory: {} };

/** A DATEONLY column comes back as a string or a Date depending on the driver. */
function asDateOnly(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10) || null;
}

function asIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return String(v);
}

/**
 * Builder XP awarded per story, from the immutable evidence trail.
 *
 * Evidence is keyed `${story_id}@${commit_sha}`, so the story id is the prefix.
 * Summed rather than taken singly: a story re-verified against a later commit
 * after a plan change legitimately has more than one record, and the profile
 * should report what was actually paid.
 */
async function pointsByStory(enrollmentId: string): Promise<Record<string, number>> {
  const { default: EvidenceRecord } = await import('../../models/EvidenceRecord');
  const rows = await EvidenceRecord.findAll({
    where: { enrollment_id: enrollmentId, source_type: 'github_commit' },
    attributes: ['source_ref', 'builder_xp'],
  });
  const out: Record<string, number> = {};
  for (const row of rows) {
    const ref = String((row as any).source_ref ?? '');
    const storyId = ref.includes('@') ? ref.slice(0, ref.indexOf('@')) : ref;
    if (!storyId) continue;
    out[storyId] = (out[storyId] ?? 0) + Number((row as any).builder_xp ?? 0);
  }
  return out;
}

/**
 * Read the snapshot for one project.
 *
 * NEVER THROWS. This runs inside publish and sync, and a failure to read
 * progress must degrade to "plan data only" rather than cost a student their
 * document write. A repo with a plan and no progress is a normal first-publish
 * state; a publish that 500s because a rollup query failed is a defect.
 */
export async function loadBuildProgress(
  projectId: string,
  enrollmentId?: string | null,
): Promise<BuildProgressSnapshot> {
  try {
    const { default: StudentTask } = await import('../../models/StudentTask');
    const tasks = await StudentTask.findAll({
      where: { project_id: projectId },
      attributes: [
        'story_id', 'due_on', 'due_baseline_on',
        'verified_at', 'verified_ref', 'verification_json',
      ],
    });
    if (!tasks.length) return EMPTY;

    const points = enrollmentId ? await pointsByStory(enrollmentId) : {};

    const progress: StoryProgressInput[] = [];
    const baselineByStory: Record<string, string | null> = {};

    for (const task of tasks) {
      const storyId = String((task as any).story_id ?? '');
      if (!storyId) continue;

      baselineByStory[storyId] = asDateOnly((task as any).due_baseline_on)
        ?? asDateOnly((task as any).due_on);

      const v = ((task as any).verification_json ?? null) as {
        state?: StoryProgressInput['state'];
        criteria_passed?: number;
        criteria_total?: number;
        commit_sha?: string | null;
        commit_at?: string | null;
        outstanding?: string[];
      } | null;

      const verifiedAt = asIso((task as any).verified_at);
      // `verified_at` on the task is the RECORD; verification_json is a mutable
      // view of the last repo read. Where they disagree the record wins — this
      // is the same latch the server applies, restated so the file can never
      // report a story lower than the platform has already granted.
      const state: StoryProgressInput['state'] = verifiedAt ? 'verified' : (v?.state ?? 'not_started');

      progress.push({
        story_id: storyId,
        state,
        criteria_passed: Number(v?.criteria_passed ?? 0),
        criteria_total: Number(v?.criteria_total ?? 0),
        verified_at: verifiedAt,
        // `verified_ref` is the sha frozen at award time and is the one a
        // stranger should be able to click; the json copy can move.
        commit_sha: (String((task as any).verified_ref ?? '').trim() || v?.commit_sha) || null,
        commit_at: v?.commit_at ?? null,
        points_awarded: points[storyId] ?? null,
        outstanding: v?.outstanding ?? [],
      });
    }

    progress.sort((a, b) => a.story_id.localeCompare(b.story_id));
    return { progress, baselineByStory };
  } catch (err: any) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'sbp-progress-snapshot',
      event: 'sbp_progress_snapshot_failed',
      outcome: 'partial',
      context: {
        project_id: projectId,
        error_class: err?.name ?? 'Error',
        message: err?.message,
        note: 'documents will be written with plan data only',
      },
    }));
    return EMPTY;
  }
}
