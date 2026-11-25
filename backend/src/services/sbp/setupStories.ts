/**
 * setupStories - does this build carry STORY-000 and STORY-900, or did the platform build those pages?
 *
 * L13.4. For a platform-built project (L13.1) the platform makes and hosts the Command Center and
 * the demo, so the board opens on the plan's own stories. "Retired" means exactly that: no STORY-000
 * or STORY-900 row, document, progress seed, price or verification spec.
 *
 * Two questions, the same split as connectedDemoFlag.ts and for its reason:
 *
 *   WRITE: should this publish leave them out?  The build is in platform mode, or already retired.
 *   READ:  were they left out?                  From rows, never the flag: the project has a platform
 *                                               build run and no STORY-000 row.
 *
 * A project that already has the row KEEPS it, whatever the mode says: the row may be verified and
 * paid, and nothing here may take that back. An agent-domain board is never retired; its Command
 * Center is `<domain>.STORY-000` and belongs to another subsystem.
 *
 * FAILS SOFT TO "NOT RETIRED", which is today's behavior. In the read paths that adds STORY-000 to a
 * list of stories for one run. It cannot wrongly latch a milestone, because it makes the list longer,
 * never shorter. If a platform-mode build's run never got queued, the read answer is also "not
 * retired" until the next publish queues one.
 */
import { COMMAND_CENTER_STORY_ID } from './commandCenterStory';
import { connectedDemoForPublish, connectedDemoMaterializedFor } from './connectedDemoFlag';
import type { SetupMode } from './planStore';

interface SetupFacts { hasRow: boolean; hasRun: boolean; isDomain: boolean }

async function setupFacts(projectId: string): Promise<SetupFacts> {
  // Imported here, not at module scope: see connectedDemoMaterializedFor for what a load-time
  // database dependency does to suites that mock config/database.
  const { sequelize } = await import('../../config/database');
  const { QueryTypes } = await import('sequelize');
  const rows = await sequelize.query<{ has_row: boolean; has_run: boolean; is_domain: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM student_tasks WHERE project_id = :projectId AND story_id = :storyId) AS has_row,
            EXISTS (SELECT 1 FROM platform_build_runs WHERE project_id = :projectId) AS has_run,
            EXISTS (SELECT 1 FROM agent_domain_projects WHERE student_project_id = :projectId) AS is_domain`,
    { replacements: { projectId, storyId: COMMAND_CENTER_STORY_ID }, type: QueryTypes.SELECT },
  );
  const r = rows[0];
  if (!r || typeof r.has_row !== 'boolean') throw new Error('setup story lookup returned no row');
  return { hasRow: r.has_row, hasRun: r.has_run, isDomain: r.is_domain };
}

async function softFacts(projectId: string): Promise<SetupFacts | null> {
  try {
    return await setupFacts(projectId);
  } catch (err) {
    const e = err as Error;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'sbp-platform-build',
      event: 'setup_story_lookup_failed',
      outcome: 'partial',
      error_class: e?.constructor?.name ?? 'Error',
      context: { projectId, message: e?.message, fell_back_to: 'not_retired' },
    }));
    return null;
  }
}

/** READ: were STORY-000 and STORY-900 left out of this project? */
export async function setupStoriesRetiredFor(projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return false;
  const f = await softFacts(projectId);
  return f !== null && f.hasRun && !f.hasRow && !f.isDomain;
}

export interface PublishSetup { setupRetired: boolean; connectedDemo: boolean }

/** WRITE: what this publish should render and materialize. Resolved once per publish. */
export async function setupForPublish(
  projectId: string,
  enrollmentId: string | null | undefined,
  settings: { platformBuild: boolean; connectedDemo: string | null | undefined },
): Promise<PublishSetup> {
  const f = await softFacts(projectId);
  const setupRetired = f !== null && !f.hasRow && !f.isDomain && (settings.platformBuild || f.hasRun);
  return {
    setupRetired,
    // A STORY-900 row a student already has is kept even here; a new one is never made.
    connectedDemo: setupRetired
      ? await connectedDemoMaterializedFor(projectId)
      : await connectedDemoForPublish(projectId, enrollmentId, settings.connectedDemo),
  };
}

/** The build's stored mode. FAILS SOFT TO 'student', the mode that spends nothing. */
export async function setupModeFor(projectId: string): Promise<SetupMode> {
  try {
    const { getIntake } = await import('./planStore');
    return (await getIntake(projectId))?.setup_mode === 'platform' ? 'platform' : 'student';
  } catch (err) {
    const e = err as Error;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'sbp-platform-build',
      event: 'setup_mode_lookup_failed', outcome: 'partial', error_class: e?.constructor?.name ?? 'Error',
      context: { projectId, message: e?.message, fell_back_to: 'student' },
    }));
    return 'student';
  }
}
