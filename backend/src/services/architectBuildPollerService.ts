/**
 * Architect Build Poller
 *
 * The AI Project Architect (advisor.colaberry.ai) runs the requirements build
 * server-side, but the portal only RETRIEVES the finished document when a
 * client polls GET /architect-status while the build is complete. If the user
 * closes the tab before the ~15-min build finishes, the build completes on the
 * Architect side but the doc is never pulled into the project — the project
 * stays empty forever.
 *
 * This periodic job closes that gap: it finds projects with an in-progress
 * Architect build, and for any that have completed it retrieves the document,
 * saves it, and runs build-out (activation) — exactly the idempotent logic in
 * GET /architect-status, but driven by the server so it no longer depends on
 * the browser staying open.
 *
 * Registered as a cron in server.ts. Idempotent: skips projects already
 * retrieved/activated; safe to run repeatedly.
 */
import Project from '../models/Project';

interface CandidateRow {
  id: string;
  enrollment_id: string;
  setup_status: Record<string, any> | null;
}

export async function pollArchitectBuilds(): Promise<{ checked: number; retrieved: number; activated: number }> {
  const sequelize = (Project as any).sequelize;
  // JSONB filter via ->> so we avoid the `?` operator (clashes with binds).
  // Covers BOTH build tiers: Architect (architect_slug) and Workflow
  // (workflow_job_id). Both finalize the same way once their source completes.
  const rows = (await sequelize.query(
    `SELECT id, enrollment_id, setup_status
       FROM projects
      WHERE (setup_status->>'architect_slug' IS NOT NULL
             OR setup_status->>'workflow_job_id' IS NOT NULL)
        AND COALESCE(setup_status->>'activated', 'false') <> 'true'`,
    { type: sequelize.QueryTypes.SELECT }
  )) as CandidateRow[];

  let checked = 0;
  let retrieved = 0;
  let activated = 0;

  for (const row of rows) {
    const slug = row.setup_status?.architect_slug;
    const workflowJobId = row.setup_status?.workflow_job_id;

    // ── Workflow tier: finalize a completed generation job ──
    if (!slug && workflowJobId) {
      if (row.setup_status?.requirements_loaded && row.setup_status?.activated) continue;
      checked += 1;
      try {
        const { getJobStatus } = await import('./requirementsGenerationService');
        const job = await getJobStatus(workflowJobId);
        if (!job || job.status !== 'completed' || !job.output_document) continue;
        const project = await Project.findByPk(row.id);
        if (!project) continue;
        const before = !!(project as any).setup_status?.requirements_loaded;
        const { finalizeRequirementsDocument } = await import('./projectSetupService');
        await finalizeRequirementsDocument(row.enrollment_id, project, job.output_document);
        if (!before && (project as any).setup_status?.requirements_loaded) retrieved += 1;
        if ((project as any).setup_status?.activated) activated += 1;
        console.log(`[BuildPoller] finalized workflow job ${workflowJobId}`);
      } catch (e: any) {
        console.warn(`[BuildPoller] workflow finalize for ${workflowJobId} not complete (will retry): ${e.message}`);
      }
      continue;
    }

    if (!slug) continue;
    checked += 1;
    try {
      const { getArchitectStatus, getArchitectDocument } = await import('./architectProxyService');
      const status = await getArchitectStatus(slug);
      if (!status.complete) continue;

      const project = await Project.findByPk(row.id);
      if (!project) continue;
      const cur = (project as any).setup_status || {};

      // 1) Retrieve + save the document if we haven't already.
      if (!cur.requirements_loaded) {
        const doc = await getArchitectDocument(slug);
        if (doc && doc.length > 100) {
          (project as any).requirements_document = doc;
          (project as any).setup_status = { ...cur, requirements_loaded: true };
          (project as any).changed('setup_status', true);
          (project as any).changed('requirements_document', true);
          await project.save();
          retrieved += 1;
          console.log(`[ArchitectPoller] retrieved document for ${slug} (${doc.length} chars)`);
        } else {
          console.warn(`[ArchitectPoller] ${slug} complete but doc fetch returned <100 chars; will retry`);
          continue;
        }
      }

      // 2) Build out (activation). activateProject is idempotent and now throws
      // on a 0-capability result, so a failed clustering leaves the project
      // un-activated and we retry it on the next tick.
      const refreshed = (project as any).setup_status || {};
      if (refreshed.requirements_loaded && !refreshed.activated) {
        const { activateProject } = await import('./projectSetupService');
        try {
          await activateProject(row.enrollment_id);
          activated += 1;
          console.log(`[ArchitectPoller] built out ${slug}`);
        } catch (e: any) {
          console.warn(`[ArchitectPoller] activation for ${slug} not complete (will retry): ${e.message}`);
        }
      }
    } catch (err: any) {
      console.warn(`[ArchitectPoller] error processing ${slug}: ${err.message}`);
    }
  }

  if (checked > 0) {
    console.log(`[ArchitectPoller] checked ${checked} in-progress builds, retrieved ${retrieved}, activated ${activated}`);
  }
  return { checked, retrieved, activated };
}
