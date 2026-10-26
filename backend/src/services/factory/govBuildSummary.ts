/**
 * govBuildSummary — the gov cockpit's BUILD view: the project's software build as RELEASES → STORIES with their
 * verification state and a progress rollup, read from the materialized Student Build Pipeline rows.
 *
 * DESIGN (confirmed with the owner): the cockpit shows a SUMMARY and deep-links to the existing student build
 * workspace for the hands-on work (repo wiring, per-story Claude Code prompts, progress.json, commit verification).
 * So this returns releases → stories + status + a rollup + the linked project id for the deep-link — NOT a second
 * copy of the build UI, and NOT the old one-card-per-requirement projection.
 *
 * The build is a materialized student project linked to the gov delivery project's `solution_build` track. A story
 * advances to verified through the EXISTING SBP commit→story loop (a commit naming the story + its acceptance ticked
 * in progress.json). That loop needs a PUBLISHED plan, which gov materialization never wrote — so this ensures one
 * (govBuildPublish), best-effort, on read.
 */
import ContractTrack from '../../models/ContractTrack';
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import { ensureGovBuildPlanPublished } from './govBuildPublish';

export interface GovBuildStorySummary {
  storyId: string;
  title: string;
  releaseKey: string;
  /** Raw lifecycle: not_started | in_progress | complete | blocked. */
  status: string;
  /** True once the platform confirmed it from a commit (verified_at set) — the honest "done". */
  verified: boolean;
}
export interface GovBuildReleaseSummary { key: string; name: string; status: string; stories: GovBuildStorySummary[]; }
export interface GovBuildRollup { total: number; verified: number; complete: number; inProgress: number; blocked: number; notStarted: number; pct: number; }
export interface GovBuildSummary {
  /** The linked student build project id — for the deep-link to the build workspace. Visible only to project members. */
  studentProjectId: string;
  releases: GovBuildReleaseSummary[];
  rollup: GovBuildRollup;
}

/**
 * The build summary for a gov delivery project, or null when no build is linked yet. Reads the materialized
 * releases/stories, rolls up progress, and (best-effort) ensures the plan is published so commits can verify. Total.
 */
export async function getGovBuildSummary(deliveryProjectId: string): Promise<GovBuildSummary | null> {
  if (!deliveryProjectId) return null;
  const track: any = await ContractTrack.findOne({ where: { delivery_project_id: deliveryProjectId, track_type: 'solution_build' } });
  const studentProjectId = track && track.solution_student_project_id ? String(track.solution_student_project_id) : null;
  if (!studentProjectId) return null;

  // Turn on the commit→story loop for this project (idempotent; never blocks the read).
  try { await ensureGovBuildPlanPublished(studentProjectId); } catch { /* best-effort — the summary renders regardless */ }

  const [lists, tasks] = await Promise.all([
    StudentTaskList.findAll({ where: { project_id: studentProjectId }, order: [['position', 'ASC']] }) as Promise<any[]>,
    StudentTask.findAll({ where: { project_id: studentProjectId }, order: [['position', 'ASC']] }) as Promise<any[]>,
  ]);
  const storyTasks = tasks.filter((t) => typeof t.story_id === 'string' && /^STORY-/.test(t.story_id));

  const storiesByRelease = new Map<string, GovBuildStorySummary[]>();
  for (const t of storyTasks) {
    const releaseKey = String(t.release_key ?? 'r0');
    const s: GovBuildStorySummary = {
      storyId: String(t.story_id),
      title: String(t.title ?? t.story_id),
      releaseKey,
      status: String(t.status ?? 'not_started'),
      verified: !!t.verified_at,
    };
    const list = storiesByRelease.get(releaseKey) ?? [];
    list.push(s);
    storiesByRelease.set(releaseKey, list);
  }

  // Releases from the task lists (drop the demo-prep list); append any release a story references but no list covers.
  const releases: GovBuildReleaseSummary[] = [];
  const seen = new Set<string>();
  for (const l of lists) {
    const key = String(l.cluster ?? '');
    if (!key || key === 'prep' || seen.has(key)) continue;
    seen.add(key);
    releases.push({ key, name: String(l.title ?? key), status: String(l.status ?? 'not_started'), stories: storiesByRelease.get(key) ?? [] });
  }
  for (const key of storiesByRelease.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    releases.push({ key, name: `Release ${key}`, status: 'not_started', stories: storiesByRelease.get(key) ?? [] });
  }

  const rollup = storyTasks.reduce<GovBuildRollup>((acc, t) => {
    acc.total++;
    if (t.verified_at) acc.verified++;
    const st = String(t.status ?? 'not_started');
    if (st === 'complete') acc.complete++;
    else if (st === 'in_progress') acc.inProgress++;
    else if (st === 'blocked') acc.blocked++;
    else acc.notStarted++;
    return acc;
  }, { total: 0, verified: 0, complete: 0, inProgress: 0, blocked: 0, notStarted: 0, pct: 0 });
  rollup.pct = rollup.total ? Math.round((rollup.verified / rollup.total) * 100) : 0;

  return { studentProjectId, releases, rollup };
}
