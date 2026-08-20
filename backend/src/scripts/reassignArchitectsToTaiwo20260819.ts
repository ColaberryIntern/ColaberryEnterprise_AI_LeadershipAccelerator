/**
 * Force-updates the 4 reassigned Department Strategy Architects'
 * `AiAgent.reports_to_type`/`reports_to_id` to resolve directly to Taiwo —
 * the required companion write for `ticketCreatorIdentitySeed.ts`'s config
 * change (org-chart-departments run, T2), found by this run's own
 * independent task-verifier: `agentIdentitySeed.ts::seedAgentIdentity()`'s
 * boot-time self-heal only fills `reports_to_type`/`reports_to_id` when
 * they are CURRENTLY NULL (`if (!aiAgent.reports_to_type ||
 * !aiAgent.reports_to_id)`) — it never overwrites an already-set value.
 * These 4 agents already carry `reports_to_type='agent'`/`reports_to_id=
 * <CoryBrain's id>` from the earlier 2-tier consolidation (PR #1615, live
 * in production before this run), so redeploying the config change alone
 * would silently no-op at boot and never actually move them to Taiwo. This
 * script is the explicit, idempotent write that makes the config change
 * take effect — verified NOT assumed working.
 *
 * Reuses `ticketCreatorIdentitySeed.ts`'s own exported
 * `REASSIGNED_TO_TAIWO_AGENT_NAMES` and `ORG_MEMBER.TAIWO` so the target
 * list and destination id can never drift from that file's real config.
 *
 *   node reassignArchitectsToTaiwo20260819.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Reports each of the 4 agents' current vs.
 *     proposed reports_to_type/reports_to_id. Makes zero writes. Writes a
 *     dry-run report (.md) AND an undo log (.json) to --out-dir.
 *
 *   node reassignArchitectsToTaiwo20260819.js --commit --out-dir <dir> [--session-id <id>]
 *     Writes the undo log FIRST, then sets `reports_to_type='human'`,
 *     `reports_to_id=<Taiwo's real org_members.id>` for exactly the 4 named
 *     agents. Idempotent: an agent already correct is skipped, not
 *     re-written. Never touches any other agent.
 *
 *   node reassignArchitectsToTaiwo20260819.js --revert --undo-log <path>
 *     Restores each agent's previous reports_to_type/reports_to_id
 *     verbatim (back to CoryBrain). Idempotent.
 */
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { AiAgent } from '../models';
import { sequelize } from '../config/database';
import { REASSIGNED_TO_TAIWO_AGENT_NAMES, ORG_MEMBER } from '../services/agentBlueprint/ticketCreatorIdentitySeed';

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

export interface AgentUndoRow {
  agent_id: string;
  agent_name: string;
  previous_reports_to_type: string | null;
  previous_reports_to_id: string | null;
}

export interface AgentUndoLog {
  generated_at: string;
  session_id: string;
  rows: AgentUndoRow[];
}

function writeUndoLog(undoLog: AgentUndoLog, outDir: string, ts: number): string {
  const filePath = path.join(outDir, `reassign-architects-to-taiwo-undo-log-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

function writeReport(rows: AgentUndoRow[], outDir: string, ts: number, sessionId: string): string {
  const filePath = path.join(outDir, `reassign-architects-to-taiwo-dry-run-${ts}.md`);
  const lines = [
    '# Dry run — reassign 4 Architects to Taiwo (AiAgent.reports_to_type/reports_to_id)',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Session: ${sessionId}`,
    '',
    `Rows that WOULD change: ${rows.length} of ${REASSIGNED_TO_TAIWO_AGENT_NAMES.length}`,
    '',
    '| Agent | Previous reports_to_type | Previous reports_to_id |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.agent_name} | ${r.previous_reports_to_type ?? '(none)'} | ${r.previous_reports_to_id ?? '(none)'} |`),
    '',
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

function readUndoLog(filePath: string): AgentUndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as AgentUndoLog;
  if (!Array.isArray(parsed.rows)) throw new Error(`Malformed undo log at ${filePath}: missing rows[]`);
  return parsed;
}

/** Rows whose CURRENT state differs from the target (reports_to_type='human',
 * reports_to_id=Taiwo) — never writes anything itself. */
export async function computeDiff(): Promise<AgentUndoRow[]> {
  const agents = await AiAgent.findAll({
    where: { agent_name: { [Op.in]: [...REASSIGNED_TO_TAIWO_AGENT_NAMES] } },
  });
  const rows: AgentUndoRow[] = [];
  for (const agent of agents) {
    if (agent.reports_to_type === 'human' && agent.reports_to_id === ORG_MEMBER.TAIWO) continue; // already correct
    rows.push({
      agent_id: agent.id,
      agent_name: agent.agent_name,
      previous_reports_to_type: agent.reports_to_type,
      previous_reports_to_id: agent.reports_to_id,
    });
  }
  return rows;
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalToChange: number;
}

export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const rows = await computeDiff();
  const ts = Date.now();
  const undoLogPath = writeUndoLog({ generated_at: new Date().toISOString(), session_id: sessionId, rows }, outDir, ts);
  const reportPath = writeReport(rows, outDir, ts, sessionId);

  console.log(
    JSON.stringify({
      event: 'reassign_architects_to_taiwo.planned',
      service: 'reassign-architects-to-taiwo',
      total_to_change: rows.length,
      reportPath,
      undoLogPath,
    }),
  );

  return { reportPath, undoLogPath, totalToChange: rows.length };
}

export interface CommitRunResult {
  undoLogPath: string;
  updated: number;
  skippedAlreadyCorrect: number;
}

export async function runCommit(outDir: string, sessionId: string): Promise<CommitRunResult> {
  const rows = await computeDiff();
  const ts = Date.now();
  const undoLogPath = writeUndoLog({ generated_at: new Date().toISOString(), session_id: sessionId, rows }, outDir, ts);

  let updated = 0;
  await sequelize.transaction(async (t) => {
    for (const row of rows) {
      // `as any`: same single-column-partial-update shape justified in
      // assignOrgDepartments20260819.ts — Sequelize's generated update-attrs
      // type wants every model field even though only these 2 columns change.
      await AiAgent.update(
        { reports_to_type: 'human', reports_to_id: ORG_MEMBER.TAIWO } as any,
        { where: { id: row.agent_id }, transaction: t },
      );
      updated++;
    }
  });

  console.log(
    JSON.stringify({
      event: 'reassign_architects_to_taiwo.committed',
      service: 'reassign-architects-to-taiwo',
      updated,
      skipped_already_correct: REASSIGNED_TO_TAIWO_AGENT_NAMES.length - rows.length,
      undoLogPath,
    }),
  );

  return { undoLogPath, updated, skippedAlreadyCorrect: REASSIGNED_TO_TAIWO_AGENT_NAMES.length - rows.length };
}

export interface RevertRunResult {
  reverted: number;
  skippedAlreadyAtPreviousState: number;
}

export async function runRevert(undoLogPath: string): Promise<RevertRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  let reverted = 0;
  let skipped = 0;

  await sequelize.transaction(async (t) => {
    for (const row of undoLog.rows) {
      const agent = await AiAgent.findByPk(row.agent_id, { transaction: t });
      if (!agent) continue;
      if (agent.reports_to_type === row.previous_reports_to_type && agent.reports_to_id === row.previous_reports_to_id) {
        skipped++;
        continue;
      }
      await agent.update(
        { reports_to_type: row.previous_reports_to_type, reports_to_id: row.previous_reports_to_id } as any,
        { transaction: t },
      );
      reverted++;
    }
  });

  console.log(
    JSON.stringify({
      event: 'reassign_architects_to_taiwo.reverted',
      service: 'reassign-architects-to-taiwo',
      reverted,
      skipped_already_at_previous_state: skipped,
    }),
  );

  return { reverted, skippedAlreadyAtPreviousState: skipped };
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
        event: 'reassign_architects_to_taiwo.failed',
        service: 'reassign-architects-to-taiwo',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
