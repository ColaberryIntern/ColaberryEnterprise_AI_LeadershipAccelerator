/**
 * platformBuild/artifactStore - every built version of a project's Command Center and Demo. I/O.
 *
 * ## Versions are append-only
 *
 * A new upload never edits an old row. It inserts version N+1 as `active` and marks the previous
 * active row `superseded`, in ONE transaction, under the run's row lock. The partial unique index
 * `uq_platform_build_artifacts_active` means that even if two transactions raced past the lock,
 * Postgres itself would refuse the second active row. L13.2 (Design mode) adds Restore as "insert
 * a new version that copies an old one", which this shape already supports without a migration.
 *
 * ## Idempotent on the run
 *
 * The runner may retry its upload (a timeout after the server committed). The run row is locked
 * first; if it is already `uploaded`, the call returns `{ duplicate: true }` and writes nothing.
 */
import { randomUUID } from 'crypto';
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import { getRun, transitionRun } from './runStore';
import type { AcceptedUpload } from './uploadContract';

export type ArtifactKind = 'command_center' | 'demo';

export interface ActiveArtifact {
  version: number;
  files: Record<string, string>;
  created_at: Date;
}

export class RunNotAcceptingUpload extends Error {
  readonly name = 'RunNotAcceptingUpload';

  readonly error_class = 'ContractViolation';
}

async function insertVersion(
  t: Transaction,
  args: { projectId: string; kind: ArtifactKind; runId: string; planVersion: number; files: Record<string, string>; bytes: number },
): Promise<number> {
  await sequelize.query(
    `UPDATE platform_build_artifacts SET status = 'superseded'
      WHERE project_id = :projectId AND kind = :kind AND status = 'active'`,
    { replacements: { projectId: args.projectId, kind: args.kind }, transaction: t },
  );
  const rows = await sequelize.query<{ version: number }>(
    `INSERT INTO platform_build_artifacts
       (id, project_id, kind, version, run_id, plan_version, files, bytes, status, created_by)
     SELECT :id, :projectId, :kind, COALESCE(MAX(version), 0) + 1, :runId, :planVersion,
            CAST(:files AS JSONB), :bytes, 'active', 'platform_build'
       FROM platform_build_artifacts WHERE project_id = :projectId AND kind = :kind
     RETURNING version`,
    {
      replacements: {
        id: randomUUID(),
        projectId: args.projectId,
        kind: args.kind,
        runId: args.runId,
        planVersion: args.planVersion,
        files: JSON.stringify(args.files),
        bytes: args.bytes,
      },
      type: QueryTypes.SELECT,
      transaction: t,
    },
  );
  return rows[0].version;
}

export interface SaveResult {
  duplicate: boolean;
  commandCenterVersion: number | null;
  demoVersion: number | null;
}

export async function saveRunArtifacts(runId: string, upload: AcceptedUpload, costUsd: number | null): Promise<SaveResult> {
  return sequelize.transaction(async (t) => {
    const run = await getRun(runId, t, true);
    if (!run) throw new RunNotAcceptingUpload('run not found');
    if (run.status === 'uploaded') return { duplicate: true, commandCenterVersion: null, demoVersion: null };
    if (run.status !== 'building' && run.status !== 'dispatched') {
      throw new RunNotAcceptingUpload(`run is ${run.status}, not building`);
    }
    const commandCenterVersion = await insertVersion(t, {
      projectId: run.project_id, kind: 'command_center', runId, planVersion: run.plan_version,
      files: upload.commandCenter, bytes: upload.commandCenterBytes,
    });
    const demoVersion = upload.demoSpec === null ? null : await insertVersion(t, {
      projectId: run.project_id, kind: 'demo', runId, planVersion: run.plan_version,
      files: { 'demo/demo-spec.json': JSON.stringify(upload.demoSpec) }, bytes: upload.demoBytes,
    });
    const detail = upload.demoProblems.length
      ? `demo not stored: ${upload.demoProblems.map((p) => p.problem).join('; ')}`
      : null;
    await transitionRun(runId, ['building', 'dispatched'], 'uploaded', {
      costUsd, errorDetail: detail, errorClass: detail ? 'DemoSpecInvalid' : null,
    }, t);
    return { duplicate: false, commandCenterVersion, demoVersion };
  });
}

export async function activeArtifact(projectId: string, kind: ArtifactKind): Promise<ActiveArtifact | null> {
  const rows = await sequelize.query<ActiveArtifact>(
    `SELECT version, files, created_at FROM platform_build_artifacts
      WHERE project_id = :projectId AND kind = :kind AND status = 'active'`,
    { replacements: { projectId, kind }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

export interface ArtifactSummary {
  command_center: { version: number; built_at: Date } | null;
  demo: { version: number; built_at: Date } | null;
}

/** Versions only, never the files: the portal's project read calls this on every load. */
export async function activeArtifactSummary(projectId: string): Promise<ArtifactSummary> {
  const rows = await sequelize.query<{ kind: ArtifactKind; version: number; created_at: Date }>(
    `SELECT kind, version, created_at FROM platform_build_artifacts
      WHERE project_id = :projectId AND status = 'active'`,
    { replacements: { projectId }, type: QueryTypes.SELECT },
  );
  const pick = (k: ArtifactKind) => {
    const r = rows.find((x) => x.kind === k);
    return r ? { version: r.version, built_at: r.created_at } : null;
  };
  return { command_center: pick('command_center'), demo: pick('demo') };
}
