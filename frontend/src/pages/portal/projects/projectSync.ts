/**
 * projectSync — mirror the student's localStorage project onto the persisted
 * Project Backend (P1). The localStorage `projectsStore` stays the working
 * source for rendering; this fire-and-forgets a snapshot to the server so the
 * build survives (and can feed Today / Project→Today) without touching the
 * pages or the sync store.
 *
 * Best-effort + flag-gated: if the API is off (404) or errors, it's a silent
 * no-op — the UI is unaffected. Runs once per page session. The demo/sample
 * build is intentionally NOT persisted (only real student projects).
 */
import portalApi from '../../../utils/portalApi';
import type { StudentProject, ProjectTask, TaskState } from './projectsStore';

function toBackendStatus(state: TaskState): string {
  if (state === 'done') return 'complete';
  return 'not_started'; // 'todo' and 'skipped' → not started (skip = "not doing this now")
}

function toImportPayload(p: StudentProject) {
  return {
    name: p.name,
    lists: p.lists.map((l, li) => ({
      cluster: String(l.id).slice(0, 50),
      title: l.name,
      position: typeof l.step === 'number' ? l.step : li,
      tasks: l.tasks.map((t: ProjectTask, ti) => ({
        story_id: t.storyId || t.id,
        requirement_key: t.req ?? null,
        title: t.title,
        description: t.what ?? null,
        status: toBackendStatus(t.state),
        position: ti,
        owner_agent: t.owner ?? null,
        release_key: t.release ?? null,
        acceptance: t.acceptance ?? null,
        build: t.prompt ?? null,
        blocked_by: Array.isArray(t.blockedBy) ? t.blockedBy : undefined,
      })),
    })),
  };
}

let synced = false;

/** Mirror the student's active (non-demo) localStorage project to the backend, once per session. */
export async function syncActiveProjectToBackend(projects: StudentProject[]): Promise<void> {
  if (synced) return;
  const project = projects.find((p) => !p.sample);
  if (!project) return; // only the seeded demo (or nothing) — nothing real to persist
  synced = true;
  try {
    await portalApi.post('/api/portal/projects/import', toImportPayload(project));
  } catch {
    // API off (404) or transient — localStorage remains the working source.
  }
}
