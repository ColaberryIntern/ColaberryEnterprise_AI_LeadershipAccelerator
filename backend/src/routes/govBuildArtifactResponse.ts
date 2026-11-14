import type { Response } from 'express';
import { disposition, logFailure } from './artifactFileResponses';

/**
 * govBuildArtifactResponse — the HTTP half of the gov Build Evidence "Build artifacts" viewer, shared by the
 * participant route (/api/portal/gov-projects/:id/build-artifacts/:artifactId/file) and the admin route
 * (/api/admin/gov-contracts/:id/build-artifacts/:artifactId/file). Each route runs its OWN auth guard first;
 * once past it, the bytes go out the same way from both.
 *
 * Security: the artifact id is re-scoped to this project's build (enrollment + connected repo) in
 * resolveGovBuildArtifactFile before any fetch, so another project's artifact or an unknown id is a 404. The
 * bytes ALWAYS go out as an attachment (never inline): an HTML build artifact is read as text and shown in a
 * script-less sandboxed iframe on the client, so it never renders on our origin. The GitHub token is never
 * logged or returned.
 */
export async function serveGovBuildArtifact(projectId: unknown, artifactId: unknown, res: Response): Promise<void> {
  if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return; }
  if (typeof artifactId !== 'string' || !artifactId) { res.status(400).json({ error: 'An artifact id is required' }); return; }
  try {
    const { resolveGovBuildArtifactFile } = await import('../services/factory/govBuildArtifacts');
    const r = await resolveGovBuildArtifactFile(projectId, artifactId);
    if (!r.ok) {
      res.status(r.status).json({ error: r.status === 404 ? 'Not found' : 'Could not load this artifact from the repo.' });
      return;
    }
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', disposition('attachment', r.name));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(r.bytes);
  } catch (err) {
    logFailure('gov_build_artifact_failed', err, { projectId });
    if (!res.headersSent) res.status(502).json({ error: 'Could not load this artifact from the repo.' });
  }
}
