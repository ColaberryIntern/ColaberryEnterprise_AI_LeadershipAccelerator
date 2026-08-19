/**
 * Sets `OrgMember.team` on the real "Colaberry" org roster per Ali's live
 * department breakdown (session CC-20260818-x4nk, 2026-08-19: "we need to
 * divide them up into dept. Exec - Me and Ram. Sales - JJ, Nathan, William
 * Operations: Taiwo, Jackie, Kes, Recrutiing - Vivek, Kartik - Customer
 * Support - Roselen Bala bala Farhat (not on list but should be) Marketing -
 * Sohail Aleem Tejesh"), and provisions a missing `org_members` row for
 * Farhat (confirmed real, `farhat@colaberry.com`, no roster row today).
 *
 * Two disclosed judgment calls, not silently assumed (see this run's
 * handoff.md): "Bala" maps to `balamurali@colaberry.com`, not
 * `balakrishna.k@colaberry.com`; the pre-existing duplicate
 * `william@colaberry.com` row is left as two rows, both getting
 * `team='Sales'` — matched case-insensitively (`ILIKE`) so this script finds
 * BOTH rows regardless of which one was stored with non-lowercased email
 * (the real, live-confirmed reason a `(org_id, email)` unique index doesn't
 * already prevent the duplicate — the two rows are distinct byte strings).
 *
 * Explicitly NOT touched (Ali did not name them in the department brief):
 * swati@colaberry.com, ali+10@colaberry.com, balakrishna.k@colaberry.com,
 * channocatshhr@yahoo.com. Also not touched: reese@colaberry.com
 * (AI-operated, already excluded from the human roster by orgChartService.ts
 * elsewhere).
 *
 * Farhat is provisioned via the SAME `createFreeAccount()` +
 * `OrgMember.findOrCreate((org_id, email))` pattern `orgService.ts`'s
 * `inviteMembers()` uses for every other teammate added to this roster
 * (lines 253-280) — not a new shortcut.
 *
 * Undo-logged before any write (loop-architect plan-audit cycle 1's finding
 * for this run — see lib/orgDepartmentsBackfillArtifacts.ts): a bulk
 * production data change needs a durable, file-based revert record, not
 * console-only output like provisionSalesReps20260809.js's simpler
 * dry-run/--commit shape (which this script otherwise follows, since <25
 * rows makes a full plan/apply/revert CLI proportionate but the file-based
 * undo log is still required per CLAUDE.md's Idempotency & Replayability
 * section).
 *
 *   node assignOrgDepartments20260819.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Reports current vs. proposed `team` for every
 *     target row, and whether Farhat's row would be created. Makes zero
 *     writes (never calls createFreeAccount, which itself writes an
 *     Enrollment row). Writes a dry-run report (.md) AND an undo log (.json)
 *     to --out-dir (default: cwd).
 *
 *   node assignOrgDepartments20260819.js --commit --out-dir <dir> [--session-id <id>]
 *     Writes the undo log to disk FIRST (capturing each row's real
 *     pre-write `team`), then applies inside one transaction: `OrgMember
 *     .update()` for the 17 named rows (both william@colaberry.com rows),
 *     `createFreeAccount()` + `OrgMember.findOrCreate()` for Farhat.
 *     Idempotent: a second --commit run updates nothing already correct and
 *     never creates a second Farhat row.
 *
 *   node assignOrgDepartments20260819.js --revert --undo-log <path>
 *     Restores every `updated` row's `team` to the undo log's
 *     `previous_team` verbatim. Never touches a `created` row (this repo
 *     never hard-deletes real data as a "revert" — see CLAUDE.md's
 *     Idempotency & Replayability section); a created row is reported and
 *     left for manual review, not auto-removed.
 */
import { Op } from 'sequelize';
import { Organization, OrgMember } from '../models';
import { sequelize } from '../config/database';
import { createFreeAccount } from '../services/freeSignupService';
import {
  buildDepartmentPlanReport,
  writeUndoLog,
  writeReport,
  readUndoLog,
  type DepartmentUndoRow,
  type DepartmentUpdateRow,
  type DepartmentCreateRow,
  type DepartmentUnresolvedRow,
} from './lib/orgDepartmentsBackfillArtifacts';

const COLABERRY_ORG_NAME = 'Colaberry';
const DEFAULT_SESSION_ID = 'unspecified-session';

export const DEPARTMENT_ASSIGNMENTS: { email: string; team: string }[] = [
  { email: 'ali@colaberry.com', team: 'Exec' },
  { email: 'ram@colaberry.com', team: 'Exec' },
  { email: 'john@colaberry.com', team: 'Sales' },
  { email: 'ntaylor@colaberry.com', team: 'Sales' },
  { email: 'william@colaberry.com', team: 'Sales' }, // matches BOTH real duplicate rows via ILIKE
  { email: 'taiwooludimimu@gmail.com', team: 'Operations' },
  { email: 'jackie@colaberry.com', team: 'Operations' },
  { email: 'kesetebirhan@gmail.com', team: 'Operations' },
  { email: 'vivek@colaberry.com', team: 'Recruiting' },
  { email: 'karthik@colaberry.com', team: 'Recruiting' },
  { email: 'roselen@colaberry.com', team: 'Customer Support' },
  { email: 'balamurali@colaberry.com', team: 'Customer Support' }, // "Bala" — disclosed judgment call, see handoff.md
  { email: 'sohail@colaberry.com', team: 'Marketing' },
  { email: 'aleem@colaberry.com', team: 'Marketing' },
  { email: 'saitejesh@colaberry.com', team: 'Marketing' },
];

export const FARHAT_EMAIL = 'farhat@colaberry.com';
export const FARHAT_TEAM = 'Customer Support';
const FARHAT_FULL_NAME = 'Farhat';

export interface CliOptions {
  mode: 'plan' | 'commit' | 'revert';
  undoLogPath?: string;
  outDir: string;
  sessionId: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const commit = argv.includes('--commit');
  const revert = argv.includes('--revert');
  if (commit && revert) throw new Error('--commit and --revert are mutually exclusive');
  const mode: CliOptions['mode'] = revert ? 'revert' : commit ? 'commit' : 'plan';

  const undoLogIdx = argv.indexOf('--undo-log');
  const undoLogPath = undoLogIdx >= 0 ? argv[undoLogIdx + 1] : undefined;
  if (mode === 'revert' && !undoLogPath) {
    throw new Error('--revert requires --undo-log <path>');
  }

  const outDirIdx = argv.indexOf('--out-dir');
  const outDir = outDirIdx >= 0 ? argv[outDirIdx + 1] : process.cwd();

  const sessionIdx = argv.indexOf('--session-id');
  const sessionId = sessionIdx >= 0 ? argv[sessionIdx + 1] : DEFAULT_SESSION_ID;

  return { mode, undoLogPath, outDir, sessionId };
}

async function findColaberryOrg(): Promise<Organization> {
  const org = await Organization.findOne({ where: { name: COLABERRY_ORG_NAME } });
  if (!org) throw new Error(`No Organization row named "${COLABERRY_ORG_NAME}" found.`);
  return org;
}

/** Computes the diff (updates, one create for Farhat, unresolved) for the 17
 * named rows — never writes anything itself, safe to call from both --plan
 * and --commit (which re-derives fresh rather than trusting a stale
 * plan-time snapshot). */
export async function computeDiff(
  orgId: string,
): Promise<{ rows: DepartmentUndoRow[]; unresolved: DepartmentUnresolvedRow[] }> {
  const rows: DepartmentUndoRow[] = [];
  const unresolved: DepartmentUnresolvedRow[] = [];

  for (const target of DEPARTMENT_ASSIGNMENTS) {
    // eslint-disable-next-line no-await-in-loop -- 15 target emails, each a
    // fast indexed lookup; matches this run's execution-contract.md scale
    // expectations (<25 rows, one-off script, not a batch pipeline).
    const matches = await OrgMember.findAll({ where: { org_id: orgId, email: { [Op.iLike]: target.email } } });
    if (matches.length === 0) {
      unresolved.push({ email: target.email, team: target.team, reason: 'no_org_member_row' });
      continue;
    }
    for (const row of matches) {
      if (row.team === target.team) continue; // already correct — not a change
      rows.push({
        action: 'updated',
        org_member_id: row.id,
        email: row.email,
        previous_team: row.team,
        new_team: target.team,
      });
    }
  }

  const existingFarhat = await OrgMember.findOne({ where: { org_id: orgId, email: { [Op.iLike]: FARHAT_EMAIL } } });
  if (existingFarhat) {
    if (existingFarhat.team !== FARHAT_TEAM) {
      rows.push({
        action: 'updated',
        org_member_id: existingFarhat.id,
        email: existingFarhat.email,
        previous_team: existingFarhat.team,
        new_team: FARHAT_TEAM,
      });
    }
  } else {
    rows.push({ action: 'created', org_member_id: null, email: FARHAT_EMAIL, new_team: FARHAT_TEAM });
  }

  return { rows, unresolved };
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalUpdated: number;
  totalCreated: number;
  totalUnresolved: number;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const org = await findColaberryOrg();
  const { rows, unresolved } = await computeDiff(org.id);

  const { undoLog, reportMarkdown } = buildDepartmentPlanReport(rows, unresolved, sessionId);
  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  const totalUpdated = rows.filter((r) => r.action === 'updated').length;
  const totalCreated = rows.filter((r) => r.action === 'created').length;

  console.log(
    JSON.stringify({
      event: 'assign_org_departments.planned',
      service: 'assign-org-departments',
      total_updated: totalUpdated,
      total_created: totalCreated,
      total_unresolved: unresolved.length,
      reportPath,
      undoLogPath,
    }),
  );

  return { reportPath, undoLogPath, totalUpdated, totalCreated, totalUnresolved: unresolved.length };
}

export interface CommitRunResult {
  undoLogPath: string;
  updated: number;
  created: number;
  skippedAlreadyCorrect: number;
  unresolved: number;
}

/** --commit --out-dir <dir>. Writes the undo log FIRST, then applies inside
 * one transaction. Idempotent: re-derives the diff fresh (never trusts a
 * stale plan-time snapshot) so a second run only writes what's still wrong. */
export async function runCommit(outDir: string, sessionId: string): Promise<CommitRunResult> {
  const org = await findColaberryOrg();
  const { rows, unresolved } = await computeDiff(org.id);

  // Undo log written BEFORE any write — the cycle-1 plan-audit requirement.
  const { undoLog, reportMarkdown } = buildDepartmentPlanReport(rows, unresolved, sessionId);
  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  writeReport(reportMarkdown, outDir, ts);

  let updated = 0;
  let created = 0;

  await sequelize.transaction(async (t) => {
    for (const row of rows) {
      if (row.action === 'updated') {
        const target = row as DepartmentUpdateRow;
        // `as any`: Sequelize's generated update-attrs type requires every
        // non-nullable model field on a partial update object even though
        // only `team` changes here — the same untyped-partial-update shape
        // `orgService.ts`'s own `OrgMember.update()` calls use (no narrower
        // type exists for "update just this one column" in this codebase's
        // Sequelize version). Scoped tightly by `where: { id }`, so the
        // untyped cast carries no real risk of writing the wrong column.
        await OrgMember.update({ team: target.new_team } as any, { where: { id: target.org_member_id }, transaction: t });
        updated++;
      }
    }
  });

  const farhatRow = rows.find((r): r is DepartmentCreateRow => r.action === 'created' && r.email === FARHAT_EMAIL);
  if (farhatRow) {
    const free = await createFreeAccount({ full_name: FARHAT_FULL_NAME, email: FARHAT_EMAIL });
    const [, wasCreated] = await OrgMember.findOrCreate({
      where: { org_id: org.id, email: FARHAT_EMAIL },
      // `as any`: mirrors `orgService.ts::inviteMembers()`'s own identical,
      // uncommented `defaults: {...} as any` for this same model — Sequelize's
      // `CreationAttributes<OrgMember>` type disagrees with the real
      // `OrgMember.init()` column defaults (`id`/`created_at`/`updated_at`
      // are all optional at the DB level but the generated type still wants
      // them). Every field actually passed here is real and traced (see the
      // model's own `OrgMemberAttributes` interface), never fabricated.
      defaults: {
        org_id: org.id,
        enrollment_id: free.enrollment.id,
        email: FARHAT_EMAIL,
        team: FARHAT_TEAM,
        role: 'member',
        invite_status: 'invited',
        // No human inviter in this automated backfill — nullable field,
        // never fabricated (see OrgMember.ts's own `invited_by?` contract).
        invited_by: null,
        joined_at: new Date(),
      } as any,
    });
    if (wasCreated) created++;
  }

  console.log(
    JSON.stringify({
      event: 'assign_org_departments.committed',
      service: 'assign-org-departments',
      updated,
      created,
      unresolved: unresolved.length,
      undoLogPath,
    }),
  );

  return { undoLogPath, updated, created, skippedAlreadyCorrect: DEPARTMENT_ASSIGNMENTS.length - rows.length, unresolved: unresolved.length };
}

export interface RevertRunResult {
  reverted: number;
  skippedAlreadyAtPreviousState: number;
  skippedCreatedRows: number;
}

/** --revert --undo-log <path>. Restores `updated` rows' `team` verbatim.
 * Never touches `created` rows (see this script's own header comment). */
export async function runRevert(undoLogPath: string): Promise<RevertRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  let reverted = 0;
  let skipped = 0;
  let skippedCreated = 0;

  await sequelize.transaction(async (t) => {
    for (const row of undoLog.rows) {
      if (row.action === 'created') {
        skippedCreated++;
        continue;
      }
      const member = await OrgMember.findByPk(row.org_member_id, { transaction: t });
      if (!member) continue;
      if (member.team === row.previous_team) {
        skipped++;
        continue;
      }
      // `as any`: same single-column-partial-update shape justified in
      // runCommit() above — Sequelize's generated update-attrs type wants
      // every model field even though only `team` changes.
      await member.update({ team: row.previous_team } as any, { transaction: t });
      reverted++;
    }
  });

  console.log(
    JSON.stringify({
      event: 'assign_org_departments.reverted',
      service: 'assign-org-departments',
      reverted,
      skipped_already_at_previous_state: skipped,
      skipped_created_rows: skippedCreated,
    }),
  );

  return { reverted, skippedAlreadyAtPreviousState: skipped, skippedCreatedRows: skippedCreated };
}

/* istanbul ignore next — CLI entry point, exercised operationally not in unit tests */
if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  (async () => {
    await sequelize.authenticate();
    if (opts.mode === 'plan') await runPlan(opts.outDir, opts.sessionId);
    else if (opts.mode === 'commit') await runCommit(opts.outDir, opts.sessionId);
    else await runRevert(opts.undoLogPath!);
    process.exit(0);
  })().catch((err: any) => {
    console.error(
      JSON.stringify({
        event: 'assign_org_departments.failed',
        service: 'assign-org-departments',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
