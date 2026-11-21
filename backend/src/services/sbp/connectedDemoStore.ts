import crypto from 'crypto';
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';
import type { BuildPlan } from './planContract';
import { buildConnectedDemoSpec, ConnectedDemoDataModelMissing } from './connectedDemoSpec';
import { validateDemoSpecShape, type DemoSpec } from './demoSpec/contract';
import {
  checkDemoSpecContent,
  RESTRICTED_PROJECT_FIELDS,
  type ContentProblem,
} from './demoSpec/contentPolicy';

/**
 * connectedDemoStore - generate a demo spec and persist it to `projects.demo_spec`. I/O.
 *
 * The rule about what a spec may contain lives in `demoSpec/`, and the rule about what a spec
 * says lives in `connectedDemoSpec.ts`, both pure. This module only moves rows, which is the same
 * split `projectMeasurementStore` and `caseStudyFoundation` already use.
 *
 * ## It does not publish
 *
 * `demo_share_enabled` is never written here. Generating a demo and publishing one are different
 * decisions, and collapsing them is what "off by default" would stop meaning. A regeneration must
 * not silently republish a demo somebody turned off, and the first generation must not put a
 * public link into the world that nobody asked for. The publish control is a separate
 * authenticated act.
 *
 * ## Writes fail LOUD
 *
 * The reads in this repo's other stores fail soft because a missing optional section should not
 * take down a page. This is a write. Losing a demo somebody generated, silently, leaves them
 * looking at a Command Center that says the demo exists and a link that does not work.
 */

export type ConnectedDemoRefusal =
  | 'ConnectedDemoDataModelMissing'
  | 'ConnectedDemoSpecInvalid'
  | 'ConnectedDemoContentRefused'
  | 'ConnectedDemoProjectMissing';

export class ConnectedDemoStoreError extends Error {
  readonly name = 'ConnectedDemoStoreError';

  constructor(
    readonly error_class: ConnectedDemoRefusal,
    message: string,
    readonly problems: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }
}

export interface GenerateConnectedDemoInput {
  projectId: string;
  plan: BuildPlan;
  dataModel: unknown;
  planSha: string;
  planVersion: string;
  generatedAt: string;
}

export interface GenerateConnectedDemoResult {
  projectId: string;
  /** The unguessable public address. Minted once and then stable across regenerations. */
  shareToken: string;
  /** Always the row's CURRENT value, never set by this module. */
  shareEnabled: boolean;
  spec: DemoSpec;
  eventCount: number;
}

/**
 * 32 bytes of CSPRNG as base64url.
 *
 * `crypto.randomUUID()` would be 122 bits with a published structure; this is 256 bits with none.
 * The token is the ONLY thing standing between an unauthenticated request and a project's demo,
 * so it is sized as a secret rather than as an identifier.
 */
function mintShareToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Every string inside a value, at any depth.
 *
 * A JSONB column is not one needle, it is many. Handing the policy a stringified
 * `{"vendor":"Acme Health"}` gives it a needle longer than anything a spec holds, so `includes`
 * can never match and the check silently protects nothing. What must not leak is "Acme Health".
 */
function stringsWithin(value: unknown, depth = 0): string[] {
  if (depth > 8) return []; // a cycle or a pathological blob must not hang the write path
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((v) => stringsWithin(v, depth + 1));
  if (value && typeof value === 'object') {
    // Keys as well as values: a column whose KEY names the organization leaks just as readily.
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
      k,
      ...stringsWithin(v, depth + 1),
    ]);
  }
  return [];
}

/** The restricted values for one project, read as a map of column -> value(s). */
async function restrictedValuesFor(projectId: string): Promise<Record<string, string[]>> {
  const columns = RESTRICTED_PROJECT_FIELDS.join(', ');
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT ${columns} FROM projects WHERE id = :projectId`,
    { replacements: { projectId }, type: QueryTypes.SELECT },
  );
  const row = rows[0];
  if (!row) {
    throw new ConnectedDemoStoreError(
      'ConnectedDemoProjectMissing',
      `no project ${projectId}`,
    );
  }
  const out: Record<string, string[]> = {};
  for (const field of RESTRICTED_PROJECT_FIELDS) {
    out[field] = stringsWithin(row[field]);
  }
  return out;
}

/**
 * Generate and persist. Idempotent: running twice updates one row and mints no second token.
 *
 * Refuses, writing NOTHING, when:
 *   - the data model is absent (`ConnectedDemoDataModelMissing`) - STORY-900 hard-depends on
 *     STORY-000, so a demo without a data model would invent tables the student does not have
 *   - the generated spec fails its contract (`ConnectedDemoSpecInvalid`)
 *   - the spec carries a restricted project value (`ConnectedDemoContentRefused`)
 *
 * The content check runs HERE, at the write boundary, and not at the response boundary, because
 * `demo_spec` has to be on the public route's allow-list for the feature to work at all. It is
 * therefore the one field a response-side sentinel is structurally blind to. See
 * `demoSpec/contentPolicy.ts`.
 */
export async function generateConnectedDemo(
  input: GenerateConnectedDemoInput,
): Promise<GenerateConnectedDemoResult> {
  // Read first: a project that does not exist should fail before any generation work.
  const restricted = await restrictedValuesFor(input.projectId);

  let spec: DemoSpec;
  try {
    spec = buildConnectedDemoSpec({
      plan: input.plan,
      dataModel: input.dataModel,
      planSha: input.planSha,
      planVersion: input.planVersion,
      generatedAt: input.generatedAt,
    });
  } catch (err: unknown) {
    if (err instanceof ConnectedDemoDataModelMissing) {
      throw new ConnectedDemoStoreError('ConnectedDemoDataModelMissing', err.message);
    }
    throw err;
  }

  // Belt and braces. `buildConnectedDemoSpec` already parses, so this can only fire if a future
  // caller hands a spec in by another path; it costs nothing and it is the assertion that makes
  // "an invalid spec is never persisted" true of the MODULE rather than of one call site.
  const shapeProblems = validateDemoSpecShape(spec);
  if (shapeProblems.length) {
    throw new ConnectedDemoStoreError(
      'ConnectedDemoSpecInvalid',
      `generated spec failed its own contract: ${shapeProblems.map((p) => p.path).join(', ')}`,
      shapeProblems,
    );
  }

  const contentProblems: ContentProblem[] = checkDemoSpecContent(spec, restricted);
  if (contentProblems.length) {
    throw new ConnectedDemoStoreError(
      'ConnectedDemoContentRefused',
      `generated spec carries restricted project data: ${contentProblems.map((p) => p.path).join(', ')}`,
      contentProblems,
    );
  }

  /*
   * One statement, and note what it does NOT touch.
   *
   * `demo_share_token` uses COALESCE so an existing token survives: the link somebody has already
   * shared keeps working across a regeneration. `demo_share_enabled` is absent from the SET list
   * entirely, which is stronger than setting it to its current value - there is no expression
   * here that could be edited into flipping it.
   */
  const rows = await sequelize.query<{ demo_share_token: string; demo_share_enabled: boolean }>(
    `UPDATE projects
        SET demo_spec = CAST(:spec AS JSONB),
            demo_share_token = COALESCE(demo_share_token, :newToken)
      WHERE id = :projectId
      RETURNING demo_share_token, demo_share_enabled`,
    {
      replacements: {
        spec: JSON.stringify(spec),
        newToken: mintShareToken(),
        projectId: input.projectId,
      },
      type: QueryTypes.SELECT,
    },
  );

  const row = rows[0];
  if (!row) {
    throw new ConnectedDemoStoreError(
      'ConnectedDemoProjectMissing',
      `project ${input.projectId} disappeared between the read and the write`,
    );
  }

  return {
    projectId: input.projectId,
    shareToken: row.demo_share_token,
    shareEnabled: row.demo_share_enabled,
    spec,
    eventCount: spec.events.length,
  };
}
