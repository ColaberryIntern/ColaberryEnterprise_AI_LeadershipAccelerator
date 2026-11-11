/**
 * Public shareable portfolio (BC #9985689951). A student opts in to sharing;
 * we mint one stable, opaque share_token per project and gate the public
 * read on share_enabled so it can be revoked without losing/regenerating
 * the link.
 */
import crypto from 'crypto';
import Project from '../models/Project';
import { generatePortfolio, PortfolioResult } from './portfolioGenerationService';

function notFoundError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'NotFoundError' });
}

async function requireProjectForEnrollment(enrollmentId: string): Promise<Project> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  if (!project) throw notFoundError('Project not found');
  return project;
}

export async function getPortfolioSharing(
  enrollmentId: string,
): Promise<{ share_token: string | null; share_enabled: boolean }> {
  const project = await requireProjectForEnrollment(enrollmentId);
  return { share_token: project.share_token, share_enabled: project.share_enabled };
}

/**
 * Idempotent — reuses an existing share_token rather than rotating it on
 * repeat enable calls, so a link already handed to an employer keeps working.
 */
export async function setPortfolioSharing(
  enrollmentId: string,
  enabled: boolean,
): Promise<{ share_token: string | null; share_enabled: boolean }> {
  const project = await requireProjectForEnrollment(enrollmentId);

  if (enabled && !project.share_token) {
    await project.update({ share_token: crypto.randomUUID(), share_enabled: true });
  } else {
    await project.update({ share_enabled: enabled });
  }

  return { share_token: project.share_token, share_enabled: project.share_enabled };
}

/**
 * `archived_at: null` is the load-bearing clause here, not a tidiness filter.
 *
 * This is the one PUBLIC, unauthenticated read of a project: anyone holding the token gets the
 * portfolio. Without the clause an archived project stayed reachable by its old share link
 * forever, so "removed from every surface" was false in the single place where being wrong is
 * visible outside the company.
 *
 * It is the same 404 as a bad token, deliberately. A distinguishable response would tell the
 * holder of a dead link that the project still exists and was withdrawn, which is more than a
 * public endpoint should say.
 */
export async function getPortfolioByShareToken(token: string): Promise<PortfolioResult> {
  const project = await Project.findOne({
    where: { share_token: token, share_enabled: true, archived_at: null } as any,
  });
  if (!project) throw notFoundError('Shared portfolio not found');
  return generatePortfolio(project.enrollment_id);
}
