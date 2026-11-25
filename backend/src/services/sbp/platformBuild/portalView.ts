/**
 * platformBuild/portalView - what the portal shows about a project's platform-built pages. I/O.
 *
 * Called by the authenticated project read (`GET /api/portal/projects/:projectId`) AFTER its own
 * ownership check, so a link is only ever minted for the student who owns the project. The links
 * are relative (`/api/platform-view/<token>/`), so they work on whichever host served the portal.
 *
 * Never throws: a failure here must not take the project page down. It returns null, and the
 * story page simply shows no platform links, exactly as for a project the flag does not cover.
 */
import { env } from '../../../config/env';
import { activeArtifactSummary } from './artifactStore';
import { latestRunForProject, RunStatus } from './runStore';
import { mintViewToken, VIEW_TOKEN_TTL_SECONDS } from './viewToken';

export interface PlatformBuildView {
  /** Where the build is: building, ready, or failed (no links unless something is ready). */
  state: 'building' | 'ready' | 'failed';
  command_center_url: string | null;
  demo_url: string | null;
  command_center_version: number | null;
  demo_version: number | null;
  built_at: string | null;
  /** When the links stop working. The portal re-reads well before this. */
  link_expires_at: string | null;
}

const BUILDING: ReadonlySet<RunStatus> = new Set<RunStatus>(['queued', 'dispatched', 'building']);

export async function platformBuildForPortal(projectId: string): Promise<PlatformBuildView | null> {
  try {
    const [summary, run] = await Promise.all([activeArtifactSummary(projectId), latestRunForProject(projectId)]);
    if (!run && !summary.command_center) return null;
    const now = Math.floor(Date.now() / 1000);
    const base = summary.command_center ? `/api/platform-view/${mintViewToken(projectId, env.jwtSecret, now)}/` : null;
    const state: PlatformBuildView['state'] = summary.command_center
      ? 'ready'
      : run && BUILDING.has(run.status) ? 'building' : 'failed';
    return {
      state,
      command_center_url: base,
      demo_url: base && summary.demo ? `${base}demo/` : null,
      command_center_version: summary.command_center?.version ?? null,
      demo_version: summary.demo?.version ?? null,
      built_at: summary.command_center ? new Date(summary.command_center.built_at).toISOString() : null,
      link_expires_at: base ? new Date((now + VIEW_TOKEN_TTL_SECONDS) * 1000).toISOString() : null,
    };
  } catch (err) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'sbp-platform-build',
      event: 'platform_build_portal_view_failed',
      outcome: 'partial',
      error_class: (err as Error)?.name ?? 'Error',
      context: { projectId, message: (err as Error)?.message },
    }));
    return null;
  }
}
