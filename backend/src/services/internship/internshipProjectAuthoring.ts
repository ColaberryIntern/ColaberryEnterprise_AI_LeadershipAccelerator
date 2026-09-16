import { createNewProjectForEnrollment } from '../projectService';
import { importProject, type ImportListInput } from '../projects/projectWriteService';

/**
 * Author a project on the admin side and assign it to an intern.
 *
 * Ali's ask: "build multiple projects and then assign them to someone which then
 * gets the Releases and storys built out on their profile." An intern's first
 * project comes only from a manager, after they clear the first three weeks — so
 * this is the manager's delivery surface.
 *
 * It reuses the student build's own persistence: a project is a `projects` row,
 * a release is a `student_task_lists` row (keyed by its release key), and a story
 * is a `student_tasks` row. Authoring = create a fresh project for the intern,
 * make it active, then write the releases + stories through the existing,
 * transactional `importProject`. So an admin-authored project renders on the
 * intern's profile identically to a generated one, with no second code path.
 */
export interface AuthoredStory {
  title: string;
  /** The story's description / narrative shown on the card. */
  narrative?: string | null;
  /** Acceptance criteria lines. */
  acceptance?: string[] | null;
  /** The assembled prompt the intern runs in the story workspace. */
  build?: string | null;
  /** Story ids that gate this one (must complete first). */
  blocked_by?: string[];
}

export interface AuthoredRelease {
  /** Release key, e.g. 'r0', 'r1' — groups its stories. */
  key: string;
  /** Human release name, e.g. 'Release 0 - Setup'. */
  name: string;
  stories: AuthoredStory[];
}

export interface AuthoredProject {
  name: string;
  industry?: string | null;
  releases: AuthoredRelease[];
}

export interface AuthoredProjectResult {
  project_id: string;
  name: string;
  releases: number;
  stories: number;
}

/**
 * Turn the authored releases/stories into `importProject` lists. Pure, so the
 * shaping — global sequential story ids, release-keyed grouping, never-complete
 * status — is tested without a database.
 */
export function authoredToImportLists(releases: readonly AuthoredRelease[]): ImportListInput[] {
  let storyNum = 0;
  return releases.map((rel, ri) => ({
    cluster: rel.key,
    title: rel.name || rel.key,
    position: ri,
    tasks: rel.stories.map((s, si) => {
      storyNum += 1;
      return {
        story_id: `STORY-${String(storyNum).padStart(3, '0')}`,
        title: s.title,
        description: s.narrative ?? null,
        acceptance: s.acceptance ?? null,
        build: s.build ?? null,
        release_key: rel.key,
        blocked_by: s.blocked_by ?? [],
        // An authored story always starts not_started; only the verification
        // pipeline moves a story to complete, never the authoring surface.
        status: 'not_started',
        position: si,
      };
    }),
  }));
}

export async function authorAndAssignInternshipProject(
  enrollmentId: string,
  input: AuthoredProject,
): Promise<AuthoredProjectResult> {
  // A fresh, active project for this intern — never the "get-or-create active"
  // path, so authoring a new project can never overwrite one already assigned.
  const project = await createNewProjectForEnrollment(enrollmentId);
  await (project as any).update({ name: input.name, industry: input.industry ?? null });

  const lists = authoredToImportLists(input.releases);
  await importProject(enrollmentId, { project_id: (project as any).id, name: input.name, lists });

  return {
    project_id: (project as any).id,
    name: input.name,
    releases: lists.length,
    stories: lists.reduce((n, l) => n + l.tasks.length, 0),
  };
}
