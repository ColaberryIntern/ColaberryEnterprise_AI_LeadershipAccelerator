import { z } from 'zod';
import Project from '../models/Project';
import { generateConnectedDemo } from './sbp/connectedDemoStore';
import { publicDemoUrl } from '../routes/demoRoutes';

/**
 * connectedDemoShareService - publish and revoke one project's Connected Demo.
 *
 * ## Why this does NOT mirror `portfolioShareService`
 *
 * The obvious move is to copy the portfolio share pair beside it. That precedent is defective and
 * the defect must not be inherited.
 *
 * `portfolioShareService.ts:16` resolves the target with an UNORDERED
 * `Project.findOne({ where: { enrollment_id } })` and no `archived_at` filter. But
 * `models/Project.ts:164-166` states plainly that "an enrollment can own several projects. The
 * 'current' one is `enrollments.active_project_id`. (Was unique: true.)", and `:348` indexes
 * `enrollment_id` NON-uniquely. So a participant with two projects publishes whichever row
 * Postgres happens to return first, possibly an archived one. Deriving the target from the
 * session does not fix that; it hides it.
 *
 * Here the caller names the project and this module AUTHORIZES it: the row must belong to the
 * calling enrollment and must not be archived. Ownership is checked rather than assumed, and the
 * target is unambiguous even for an enrollment that owns five.
 *
 * ## Publishing generates, and that ordering is the invariant
 *
 * Turning a demo on when there is no spec to serve would produce an enabled row the public route
 * refuses, which is a link somebody has shared that does not work. So enabling with no spec
 * REQUIRES a data model and generates first. The order is generate, verify, then enable, and
 * revoke is the exact reverse.
 *
 * ## Why the data model is POSTed rather than fetched
 *
 * `command-center/data-model.json` lives in the student's repository, and nothing on this
 * platform reads file CONTENT from there: `capabilityRepoReader` reads a cached file tree only.
 * Adding a GitHub fetch to the publish path would put an external API, a token and a failure mode
 * between a person pressing a button and their link working. The student's own agent already
 * holds that file - STORY-900's prompt has it read it - so it sends it.
 *
 * It is therefore UNTRUSTED input, which is exactly why `connectedDemoSpec` validates the shape
 * and `demoSpec/contentPolicy` checks the generated spec against this project's own restricted
 * values before anything is written.
 */

export const SetConnectedDemoShareSchema = z.object({
  /**
   * Explicit, and authorized rather than trusted. See the header for why this is not derived
   * from the session the way the portfolio precedent does it.
   */
  project_id: z.string().uuid(),
  enabled: z.boolean(),
  /**
   * The student's `command-center/data-model.json`. Required only when enabling a demo that has
   * no spec yet; ignored when revoking.
   */
  data_model: z.unknown().optional(),
});

export type SetConnectedDemoShareInput = z.infer<typeof SetConnectedDemoShareSchema>;

export interface ConnectedDemoShareState {
  project_id: string;
  enabled: boolean;
  /** Present only when enabled. A token for a demo nobody can open is not useful to show. */
  url: string | null;
  has_spec: boolean;
  event_count: number;
}

export type ConnectedDemoShareErrorClass =
  | 'NotFoundError'
  | 'ForbiddenError'
  | 'DataModelRequired';

export class ConnectedDemoShareError extends Error {
  readonly name = 'ConnectedDemoShareError';

  constructor(readonly error_class: ConnectedDemoShareErrorClass, message: string) {
    super(message);
  }
}

/**
 * Resolve the project this request names, and prove the caller owns it.
 *
 * 404 for a project that does not exist, 403 for one that exists and belongs to somebody else.
 * They are different facts and the caller is entitled to both: unlike the public route, this
 * one is authenticated, so telling an identified participant that a project exists but is not
 * theirs reveals nothing they could not learn by owning it.
 *
 * An archived project is 404, not 403. It is not theirs to publish any more, and saying
 * "forbidden" would imply somebody else may.
 */
async function authorizeProject(enrollmentId: string, projectId: string): Promise<Project> {
  const project = await Project.findByPk(projectId);
  if (!project || (project as unknown as { archived_at: Date | null }).archived_at != null) {
    throw new ConnectedDemoShareError('NotFoundError', 'no such project');
  }
  if (project.enrollment_id !== enrollmentId) {
    throw new ConnectedDemoShareError('ForbiddenError', 'that project belongs to another enrollment');
  }
  return project;
}

function stateOf(project: Project): ConnectedDemoShareState {
  const spec = (project as unknown as { demo_spec: unknown }).demo_spec;
  const enabled = (project as unknown as { demo_share_enabled: boolean }).demo_share_enabled === true;
  const token = (project as unknown as { demo_share_token: string | null }).demo_share_token;
  const events = spec && typeof spec === 'object' && Array.isArray((spec as { events?: unknown[] }).events)
    ? (spec as { events: unknown[] }).events.length
    : 0;
  return {
    project_id: project.id as unknown as string,
    enabled,
    url: enabled && token ? publicDemoUrl(token) : null,
    has_spec: spec != null,
    event_count: events,
  };
}

/** Read the current state. Authorizes the same way the write does. */
export async function getConnectedDemoShare(
  enrollmentId: string,
  projectId: string,
): Promise<ConnectedDemoShareState> {
  return stateOf(await authorizeProject(enrollmentId, projectId));
}

/**
 * Publish or revoke. Idempotent: calling twice with the same `enabled` lands in the same state
 * and, when enabling, does not mint a second token.
 */
export async function setConnectedDemoShare(
  enrollmentId: string,
  input: SetConnectedDemoShareInput,
): Promise<ConnectedDemoShareState> {
  const project = await authorizeProject(enrollmentId, input.project_id);

  if (!input.enabled) {
    // Revoke. The spec is LEFT IN PLACE on purpose: clearing it as well would mean a student who
    // turned their demo off and on again regenerates it, and a regenerated demo is a different
    // demo. Revocation should be reversible without being destructive.
    await project.update({ demo_share_enabled: false } as never);
    await project.reload();
    return stateOf(project);
  }

  const existingSpec = (project as unknown as { demo_spec: unknown }).demo_spec;
  if (existingSpec == null) {
    if (input.data_model === undefined) {
      throw new ConnectedDemoShareError(
        'DataModelRequired',
        'this project has no demo yet; send command-center/data-model.json to generate one',
      );
    }

    /* eslint-disable @typescript-eslint/no-var-requires */
    const { getPublishedPlan } = await import('./sbp/planStore');
    const stored = await getPublishedPlan(input.project_id);
    if (!stored) {
      throw new ConnectedDemoShareError(
        'NotFoundError',
        'this project has no published plan, so there is nothing to build a demo from',
      );
    }

    // The production call site for the producer. It validates the generated spec against its
    // contract AND against this project's restricted values, and it does NOT set
    // demo_share_enabled - that is the line below, deliberately separate.
    await generateConnectedDemo({
      projectId: input.project_id,
      plan: stored.plan,
      dataModel: input.data_model,
      planSha: stored.plan_sha256,
      planVersion: String(stored.version),
      generatedAt: new Date().toISOString(),
    });
    await project.reload();
  }

  // Enable only after a spec exists. The reverse order would leave a window in which the row is
  // published and the public route refuses it, which is a shared link that does not work.
  await project.update({ demo_share_enabled: true } as never);
  await project.reload();
  return stateOf(project);
}
