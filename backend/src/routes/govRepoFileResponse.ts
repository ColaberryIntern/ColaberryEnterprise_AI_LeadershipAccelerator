import type { Response } from 'express';
import { disposition, logFailure } from './artifactFileResponses';

/**
 * govRepoFileResponse — the HTTP half of the gov Build Evidence file viewer, shared by the participant
 * route (/api/portal/gov-projects/:id/repo-file) and the admin route (/api/admin/gov-contracts/:id/
 * repo-file). Each route runs its OWN auth guard first (participant membership vs the gov_contracts
 * section); once past it, the bytes go out the same way from both, so the security (the allowlist check)
 * and the headers (nosniff; pdf inline, everything else attachment) cannot land on one side and miss the
 * other.
 *
 * Security: the requested path is validated against the project's SYNCED file tree before any fetch. It
 * must be a classified DELIVERABLE DOCUMENT (in `connectedRepo.deliverables`) or it is refused — so a
 * traversal path, a non-existent path, or a source/secret file (.js/.env, never a deliverable) is never
 * fetched. The GitHub token lives in the client and is never logged or returned.
 */

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  rtf: 'application/rtf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
};

function extOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

/**
 * Validate + stream one connected-repo deliverable file. The caller has already passed its auth guard.
 * `download` forces an attachment for PDFs too (otherwise a PDF goes inline for the browser viewer).
 */
export async function serveGovRepoFile(
  projectId: unknown, rawPath: unknown, res: Response, opts: { download?: boolean } = {},
): Promise<void> {
  if (typeof projectId !== 'string' || !projectId) { res.status(400).json({ error: 'Project id is required' }); return; }
  if (typeof rawPath !== 'string' || !rawPath) { res.status(400).json({ error: 'A file path is required' }); return; }
  try {
    const { resolveConnectedRepo } = await import('../services/factory/govConnectedRepo');
    const repo = await resolveConnectedRepo(projectId);
    if (!repo) { res.status(404).json({ error: 'Not found' }); return; }

    const deliverable = repo.deliverables.find((d) => d.path === rawPath);
    if (!deliverable) {
      // In the repo but not a deliverable document (source/secret) -> 403; otherwise not found -> 404.
      const existsAsBlob = repo.files.includes(rawPath);
      res.status(existsAsBlob ? 403 : 404).json({ error: existsAsBlob ? 'This file is not a viewable deliverable.' : 'Not found' });
      return;
    }

    const { fetchRepoFileRaw } = await import('../services/sbp/repoConnect/githubRepoClient');
    const bytes = await fetchRepoFileRaw(repo.owner, repo.name, deliverable.path);
    if (!bytes) { res.status(404).json({ error: 'That file is no longer in the repo.' }); return; }

    const mime = MIME_BY_EXT[extOf(deliverable.name)] ?? 'application/octet-stream';
    const inline = deliverable.kind === 'pdf' && !opts.download;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', disposition(inline ? 'inline' : 'attachment', deliverable.name));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(bytes);
  } catch (err) {
    // A classified upstream failure (timeout / rate-limit / unreachable) -> 502, generic message, token never leaked.
    logFailure('gov_repo_file_failed', err, { projectId });
    if (!res.headersSent) res.status(502).json({ error: 'Could not load this file from the repo.' });
  }
}
