import { activeArtifact, activeArtifactSummary } from './platformBuild/artifactStore';
import { ConnectedDemoStoreError, persistConnectedDemoSpec } from './connectedDemoStore';
import type { GenerateConnectedDemoResult } from './connectedDemoStore';

/**
 * platformDemoAdopt - give a platform-built project the same durable public demo link a
 * student-built one can have. I/O, but only reads; the one write goes through
 * `persistConnectedDemoSpec`.
 *
 * ## The gap this closes
 *
 * There are two demos and, until this module, two unconnected halves.
 *
 * A platform build stores its demo as an artifact and the portal serves it under
 * `/api/platform-view/<token>/demo/`. That token is bound to one project, signed, and expires in
 * 12 hours; `platformBuild/viewToken.ts` says in its own header that "a link pasted into an email
 * does expire". It is a portal convenience, not an address anybody can be given.
 *
 * The durable address is `/api/public/demo/:token`, which never expires until it is revoked. It
 * reads `projects.demo_spec` and `projects.demo_share_enabled`, and the only writer of those was
 * `generateConnectedDemo`, which builds a spec from a student's `command-center/data-model.json`.
 * A platform-built project has no repository for the student to take that file out of, so on
 * exactly the projects the platform builds, nothing could ever write the columns the durable link
 * needs. L13.4 made this visible by retiring STORY-900 there, but the hole predates it.
 *
 * ## Why this adopts rather than regenerates
 *
 * The spec already exists and was already validated at upload. Regenerating from the plan would
 * produce a DIFFERENT demo from the one the student has been looking at in the portal, and the
 * whole point of the public link is to show other people that same thing. So this copies the
 * stored spec, and `persistConnectedDemoSpec` re-checks it against the contract and against this
 * project's restricted values before it lands, because an upload-time check can be weeks older
 * than the contract.
 *
 * ## What it does not do
 *
 * It never sets `demo_share_enabled`. Adopting a spec and publishing a link stay two decisions,
 * for the reason `connectedDemoStore`'s header gives: a demo that generated must not become a
 * public URL nobody chose to create.
 */

/**
 * The key `artifactStore.saveRunArtifacts` writes the demo spec under, and `serveMap` resolves
 * `demo/demo-spec.json` to. Written here as a constant because this module is a third reader of
 * that string; `__tests__/platformDemoAdopt.test.ts` asserts the other two still agree with it,
 * so a rename in either place fails a test rather than silently returning "no demo".
 */
export const DEMO_SPEC_ARTIFACT_PATH = 'demo/demo-spec.json';

export interface PlatformDemoAvailability {
  /** The stored demo's version, or null when this project has no platform-built demo. */
  version: number | null;
  built_at: Date | null;
}

/**
 * Does this project have a platform-built demo to adopt?
 *
 * Versions only, never the bytes: the portal calls this on every project load, and the spec is a
 * large JSONB document. `activeArtifactSummary` already answers exactly this question for the
 * Command Center, so this is a projection of it rather than a second query shape.
 */
export async function platformDemoAvailability(
  projectId: string,
): Promise<PlatformDemoAvailability> {
  const summary = await activeArtifactSummary(projectId);
  return {
    version: summary.demo ? summary.demo.version : null,
    built_at: summary.demo ? summary.demo.built_at : null,
  };
}

/**
 * Adopt this project's platform-built demo into `projects.demo_spec`.
 *
 * Returns null when there is no platform demo to adopt, which is an ANSWER and not a failure:
 * the caller then falls back to asking for a data model. Throws, writing nothing, when a demo
 * artifact exists but cannot be used, because that is our bug and silently asking the student for
 * a file they do not have would hide it.
 */
export async function adoptPlatformConnectedDemo(
  projectId: string,
): Promise<GenerateConnectedDemoResult | null> {
  const artifact = await activeArtifact(projectId, 'demo');
  if (!artifact) return null;

  const raw = artifact.files ? artifact.files[DEMO_SPEC_ARTIFACT_PATH] : undefined;
  if (typeof raw !== 'string' || raw.trim() === '') {
    // An artifact row with no spec file in it. `saveRunArtifacts` only ever inserts a demo row
    // WITH this key, so this is a contract violation on our side, not a student's problem.
    throw new ConnectedDemoStoreError(
      'ConnectedDemoSpecInvalid',
      `the stored demo for project ${projectId} has no ${DEMO_SPEC_ARTIFACT_PATH}`,
    );
  }

  let spec: unknown;
  try {
    spec = JSON.parse(raw);
  } catch {
    throw new ConnectedDemoStoreError(
      'ConnectedDemoSpecInvalid',
      // Never the spec body or the parse error: this message reaches an HTTP response.
      `the stored demo for project ${projectId} is not valid JSON`,
    );
  }

  // One write path, shared with the generated case. It validates, checks content, and mints the
  // token with COALESCE so a link already in the world is never rotated.
  return persistConnectedDemoSpec(projectId, spec);
}
