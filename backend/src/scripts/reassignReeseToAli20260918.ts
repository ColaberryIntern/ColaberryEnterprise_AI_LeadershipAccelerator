/**
 * Reese Product Phase 1, R6 — implements Ali's own 2026-09-15 decision
 * ("Reese reports to Ali for now, to be reassigned to Kes later",
 * `HUMAN_OWNERSHIP_MAP.md` answer 4, commit `072d7afd`) against the real
 * production row. Reese-only: touches exactly one `ai_agents` row.
 *
 * Necessary companion to `reeseIdentitySeed.ts`'s config change, for the
 * same reason `reassignArchitectsToTaiwo20260819.ts` was necessary for its
 * own agents: `agentIdentitySeed.ts::seedAgentIdentity()`'s boot-time
 * self-heal only fills `reports_to_type`/`reports_to_id`/
 * `reports_to_org_member_id` when they are CURRENTLY NULL. Reese's
 * production row already carries `reports_to_type='agent'`/`reports_to_id=
 * <workforce_intelligence_engine's id>` and a stale
 * `reports_to_org_member_id` (Taiwo's, left over from before the 2026-08-19
 * hierarchy change) -- redeploying the seed change alone would silently
 * no-op at boot. This script is the explicit, idempotent write that makes
 * it real, verified not assumed working.
 *
 *   node reassignReeseToAli20260918.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Reports Reese's current vs. proposed
 *     reports_to_type/reports_to_id/reports_to_org_member_id. Makes zero
 *     writes. Writes a dry-run report (.md) AND an undo log (.json) to
 *     --out-dir.
 *
 *   node reassignReeseToAli20260918.js --commit --out-dir <dir> [--session-id <id>]
 *     Writes the undo log FIRST, then sets reports_to_type='human',
 *     reports_to_id=<Ali's real org_members.id>,
 *     reports_to_org_member_id=<same>. Idempotent: a no-op if Reese is
 *     already correct.
 *
 *   node reassignReeseToAli20260918.js --revert --undo-log <path>
 *     Restores all three fields verbatim from the undo log. Idempotent.
 */
import fs from 'fs';
import path from 'path';
import AiAgent from '../models/AiAgent';
import { sequelize } from '../config/database';
import { ORG_MEMBER } from '../services/agentBlueprint/ticketCreatorIdentitySeed';

const REESE_AGENT_NAME = 'Reese';
const DEFAULT_SESSION_ID = 'unspecified-session';

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
  if (mode === 'revert' && !undoLogPath) throw new Error('--revert requires --undo-log <path>');

  const outDirIdx = argv.indexOf('--out-dir');
  const outDir = outDirIdx >= 0 ? argv[outDirIdx + 1] : process.cwd();

  const sessionIdx = argv.indexOf('--session-id');
  const sessionId = sessionIdx >= 0 ? argv[sessionIdx + 1] : DEFAULT_SESSION_ID;

  return { mode, undoLogPath, outDir, sessionId };
}

export interface ReeseUndoLog {
  generated_at: string;
  session_id: string;
  agent_id: string;
  previous_reports_to_type: string | null;
  previous_reports_to_id: string | null;
  previous_reports_to_org_member_id: string | null;
}

function writeUndoLog(undoLog: ReeseUndoLog, outDir: string, ts: number): string {
  const filePath = path.join(outDir, `reassign-reese-to-ali-undo-log-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

function writeReport(diff: ReeseDiff, outDir: string, ts: number, sessionId: string): string {
  const filePath = path.join(outDir, `reassign-reese-to-ali-dry-run-${ts}.md`);
  const lines = [
    '# Dry run — reassign Reese to Ali (AiAgent.reports_to_type / reports_to_id / reports_to_org_member_id)',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Session: ${sessionId}`,
    '',
    `Would change: ${diff.wouldChange ? 'yes' : 'no (already correct)'}`,
    '',
    '| Field | Current | Target |',
    '|---|---|---|',
    `| reports_to_type | ${diff.previousReportsToType ?? '(none)'} | human |`,
    `| reports_to_id | ${diff.previousReportsToId ?? '(none)'} | ${ORG_MEMBER.ALI} |`,
    `| reports_to_org_member_id | ${diff.previousReportsToOrgMemberId ?? '(none)'} | ${ORG_MEMBER.ALI} |`,
    '',
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

function readUndoLog(filePath: string): ReeseUndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as ReeseUndoLog;
}

export interface ReeseDiff {
  agentId: string;
  wouldChange: boolean;
  previousReportsToType: string | null;
  previousReportsToId: string | null;
  previousReportsToOrgMemberId: string | null;
}

/** Never writes anything itself. */
export async function computeDiff(): Promise<ReeseDiff> {
  const agent = await AiAgent.findOne({ where: { agent_name: REESE_AGENT_NAME } });
  if (!agent) throw new Error(`No ai_agents row for agent_name='${REESE_AGENT_NAME}'`);

  const alreadyCorrect =
    agent.reports_to_type === 'human' &&
    agent.reports_to_id === ORG_MEMBER.ALI &&
    agent.reports_to_org_member_id === ORG_MEMBER.ALI;

  return {
    agentId: agent.id,
    wouldChange: !alreadyCorrect,
    previousReportsToType: agent.reports_to_type,
    previousReportsToId: agent.reports_to_id,
    previousReportsToOrgMemberId: agent.reports_to_org_member_id,
  };
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  wouldChange: boolean;
}

export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const diff = await computeDiff();
  const ts = Date.now();
  const undoLogPath = writeUndoLog(
    {
      generated_at: new Date().toISOString(),
      session_id: sessionId,
      agent_id: diff.agentId,
      previous_reports_to_type: diff.previousReportsToType,
      previous_reports_to_id: diff.previousReportsToId,
      previous_reports_to_org_member_id: diff.previousReportsToOrgMemberId,
    },
    outDir,
    ts,
  );
  const reportPath = writeReport(diff, outDir, ts, sessionId);

  console.log(
    JSON.stringify({
      event: 'reassign_reese_to_ali.planned',
      service: 'reassign-reese-to-ali',
      would_change: diff.wouldChange,
      reportPath,
      undoLogPath,
    }),
  );

  return { reportPath, undoLogPath, wouldChange: diff.wouldChange };
}

export interface CommitRunResult {
  undoLogPath: string;
  changed: boolean;
}

export async function runCommit(outDir: string, sessionId: string): Promise<CommitRunResult> {
  const diff = await computeDiff();
  const ts = Date.now();
  const undoLogPath = writeUndoLog(
    {
      generated_at: new Date().toISOString(),
      session_id: sessionId,
      agent_id: diff.agentId,
      previous_reports_to_type: diff.previousReportsToType,
      previous_reports_to_id: diff.previousReportsToId,
      previous_reports_to_org_member_id: diff.previousReportsToOrgMemberId,
    },
    outDir,
    ts,
  );

  if (diff.wouldChange) {
    await AiAgent.update(
      { reports_to_type: 'human', reports_to_id: ORG_MEMBER.ALI, reports_to_org_member_id: ORG_MEMBER.ALI } as any,
      { where: { id: diff.agentId } },
    );
  }

  console.log(
    JSON.stringify({
      event: 'reassign_reese_to_ali.committed',
      service: 'reassign-reese-to-ali',
      changed: diff.wouldChange,
      undoLogPath,
    }),
  );

  return { undoLogPath, changed: diff.wouldChange };
}

export interface RevertRunResult {
  reverted: boolean;
}

export async function runRevert(undoLogPath: string): Promise<RevertRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  const agent = await AiAgent.findByPk(undoLog.agent_id);
  if (!agent) {
    console.log(JSON.stringify({ event: 'reassign_reese_to_ali.revert_skipped_missing_agent', service: 'reassign-reese-to-ali' }));
    return { reverted: false };
  }

  const alreadyAtPreviousState =
    agent.reports_to_type === undoLog.previous_reports_to_type &&
    agent.reports_to_id === undoLog.previous_reports_to_id &&
    agent.reports_to_org_member_id === undoLog.previous_reports_to_org_member_id;

  if (!alreadyAtPreviousState) {
    await agent.update({
      reports_to_type: undoLog.previous_reports_to_type,
      reports_to_id: undoLog.previous_reports_to_id,
      reports_to_org_member_id: undoLog.previous_reports_to_org_member_id,
    } as any);
  }

  console.log(
    JSON.stringify({
      event: 'reassign_reese_to_ali.reverted',
      service: 'reassign-reese-to-ali',
      reverted: !alreadyAtPreviousState,
    }),
  );

  return { reverted: !alreadyAtPreviousState };
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
        event: 'reassign_reese_to_ali.failed',
        service: 'reassign-reese-to-ali',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
