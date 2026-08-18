/**
 * Validates one or more ticket-creating agents against the Agent Ticket
 * Standard (directives/register-ticket-creating-agent.md).
 *
 * Read-only diagnostic. Requested/built as the mechanical check for the
 * checkable subset of that directive after this week's 6 real agent-fix PRs
 * (#1530, #1531, #1491-#1513, #1537, #1541-#1542, #1545, #1547, #1554, #1559)
 * proved the same 6 bug classes over and over. This script is NOT a merge gate -
 * it reports PASS/FAIL/INFO per check and never blocks or mutates anything.
 * Wiring it into CI as a hard gate is a deliberately separate, out-of-scope
 * decision (see the directive's Safety Constraints section).
 *
 * Run: `node dist/scripts/validateAgentTicketStandard.js [agentName ...]`
 *      (production, compiled - the real, deployed invocation)
 *   or `ts-node backend/src/scripts/validateAgentTicketStandard.ts [agentName ...]`
 *      (local/dev, against a reachable database)
 * With no arguments, validates all 6 agents currently known to
 * `AGENT_TICKET_RESOLVER_REGISTRY` (cory-engine, CoryBrain, InboxCaseEngine,
 * workforce_intelligence_engine, bpos_orchestrator, Reese).
 *
 * Output: a human-readable report per agent to stdout, plus one final line of
 * machine-readable JSON (`AGENT_TICKET_STANDARD_RESULT: {...}`) summarizing
 * every agent's per-check verdicts, for any future tooling that wants to parse
 * this run's output without re-implementing the checks.
 */
import fs from 'fs';
import path from 'path';
import { sequelize } from '../config/database';
import AiAgent from '../models/AiAgent';
import AdminUser from '../models/AdminUser';
import { resolveActorDisplayName } from '../services/actorIdentity/resolveActorDisplayName';
import {
  evaluateToolsGranted,
  isGenericFallbackLabel,
  scanForTimeBasedClosurePatterns,
  findResolverMapping,
  AGENT_TICKET_RESOLVER_REGISTRY,
  type AntiPatternMatch,
} from './lib/agentTicketStandardChecks';

const DEFAULT_AGENTS = AGENT_TICKET_RESOLVER_REGISTRY.map((m) => m.creatorAgentName);

type CheckStatus = 'PASS' | 'FAIL' | 'INFO';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
}

interface AgentValidationResult {
  agentName: string;
  checks: CheckResult[];
}

// ---------------------------------------------------------------------------
// Source-file resolution - works under both ts-node (dev, reads sibling .ts
// files under backend/src/) and compiled `node dist/...` (prod, reads sibling
// .js files under dist/). Derived from this file's own location, never
// hardcoded to one extension or one absolute path shape.
// ---------------------------------------------------------------------------

const IS_COMPILED = __filename.endsWith('.js');
/** backend/src (dev, ts-node) or dist (prod, compiled) - this file's own parent's parent. */
const SRC_BASE = path.resolve(__dirname, '..');

function resolveResolverSourcePath(relPathFromSrc: string): string {
  const withExt = IS_COMPILED ? relPathFromSrc.replace(/\.ts$/, '.js') : relPathFromSrc;
  return path.join(SRC_BASE, withExt);
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkAiAgentRegistered(agentName: string): Promise<{ row: AiAgent | null; check: CheckResult }> {
  const row = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!row) {
    return {
      row: null,
      check: {
        name: 'AiAgent registered',
        status: 'FAIL',
        message: `No AiAgent row found for agent_name='${agentName}'.`,
      },
    };
  }
  return {
    row,
    check: {
      name: 'AiAgent registered',
      status: 'PASS',
      message: `id=${row.id}, agent_type=${row.agent_type}, category=${row.category ?? 'n/a'}`,
    },
  };
}

function checkToolsGranted(row: AiAgent): CheckResult {
  const result = evaluateToolsGranted(row.tools_granted);
  return {
    name: 'tools_granted populated',
    status: result.pass ? 'PASS' : 'FAIL',
    message: result.reason,
  };
}

async function checkDisplayIdentity(agentName: string, row: AiAgent): Promise<CheckResult> {
  const linkedAdmin = await AdminUser.findOne({
    where: { agent_id: row.id },
    attributes: ['display_name', 'email'],
  });

  const linkedName = linkedAdmin?.display_name || linkedAdmin?.email || null;
  if (linkedName && !isGenericFallbackLabel(linkedName)) {
    return {
      name: 'Display identity registered',
      status: 'PASS',
      message: `Linked AdminUser display_name='${linkedName}' (agent_id matches).`,
    };
  }

  // No linked AdminUser (or its name is itself a generic label) - fall back to
  // the real resolution path tickets actually go through, trying both
  // actor_type values this codebase's real callers use for agent-created
  // tickets ('cory' and 'agent' - see resolveActorDisplayName.ts's own header
  // comment for why both exist).
  const resolvedViaCory = await resolveActorDisplayName('cory', agentName);
  const resolvedViaAgent = await resolveActorDisplayName('agent', agentName);
  const resolved = !isGenericFallbackLabel(resolvedViaCory) ? resolvedViaCory : resolvedViaAgent;

  if (!isGenericFallbackLabel(resolved)) {
    return {
      name: 'Display identity registered',
      status: 'PASS',
      message: `No linked AdminUser, but resolveActorDisplayName() resolves to a real, non-generic name: '${resolved}'.`,
    };
  }

  return {
    name: 'Display identity registered',
    status: 'FAIL',
    message:
      `No linked AdminUser with a real display_name, and resolveActorDisplayName() ` +
      `resolves to a generic/collapsed label ('${resolved}') rather than a distinguishing ` +
      `identity - this is the exact bug class PR #1559 fixed for cory-engine/CoryBrain.`,
  };
}

async function checkRecurringResolver(agentName: string): Promise<CheckResult[]> {
  const mapping = findResolverMapping(agentName);
  if (!mapping) {
    return [
      {
        name: 'Recurring resolver registered',
        status: 'INFO',
        message:
          `'${agentName}' is not in AGENT_TICKET_RESOLVER_REGISTRY. If this agent needs a ` +
          `recurring resolver, add a mapping in agentTicketStandardChecks.ts; if not, log why ` +
          `in its AiAgent.description per the directive's Step 6.`,
      },
    ];
  }

  const results: CheckResult[] = [];

  if (!mapping.resolverAgentName) {
    results.push({
      name: 'Recurring resolver registered',
      status: 'INFO',
      message: 'No recurring resolver expected for this agent (mapped as none needed).',
    });
  } else {
    const resolverRow = await AiAgent.findOne({ where: { agent_name: mapping.resolverAgentName } });
    if (!resolverRow) {
      results.push({
        name: 'Recurring resolver registered',
        status: 'FAIL',
        message: `Resolver AiAgent row '${mapping.resolverAgentName}' not found.`,
      });
    } else {
      const isCron = resolverRow.trigger_type === 'cron' && !!resolverRow.schedule;
      results.push({
        name: 'Recurring resolver registered',
        status: isCron ? 'PASS' : 'FAIL',
        message:
          `${mapping.resolverAgentName}: trigger_type=${resolverRow.trigger_type ?? 'n/a'}, ` +
          `schedule='${resolverRow.schedule ?? ''}', enabled=${resolverRow.enabled} ` +
          `(enabled=false is not itself a failure - it may be an intentional ` +
          `hold-until-reviewed gate per the directive's Step 6; this is reported factually).`,
      });
    }
  }

  if (mapping.knownGap) {
    results.push({
      name: 'Disclosed coverage gap',
      status: 'INFO',
      message: mapping.knownGap,
    });
  }

  results.push(...checkResolverAntiPatterns(mapping));

  return results;
}

function checkResolverAntiPatterns(mapping: ReturnType<typeof findResolverMapping>): CheckResult[] {
  if (!mapping) return [];

  const results: CheckResult[] = [];
  const filesToScan: Array<{ label: string; relPath: string }> = [];

  if (mapping.resolverRulesFile) {
    filesToScan.push({ label: mapping.resolverRulesFile, relPath: mapping.resolverRulesFile });
  } else if (mapping.resolverIoFile) {
    // No separate pure-rules file (workforce_intelligence_engine) - scan the
    // resolver file itself, since that's where the classification logic lives.
    filesToScan.push({ label: `${mapping.resolverIoFile} (no separate rules file)`, relPath: mapping.resolverIoFile });
  }

  for (const { label, relPath } of filesToScan) {
    const absPath = resolveResolverSourcePath(relPath);
    let source: string;
    try {
      source = fs.readFileSync(absPath, 'utf8');
    } catch (err: any) {
      results.push({
        name: 'No time-based-closure anti-patterns',
        status: 'INFO',
        message: `Could not read '${absPath}' to scan (${err?.message ?? 'unknown error'}) - skipped, not counted as pass or fail.`,
      });
      continue;
    }

    const matches: AntiPatternMatch[] = scanForTimeBasedClosurePatterns(source);
    if (matches.length === 0) {
      results.push({
        name: 'No time-based-closure anti-patterns',
        status: 'PASS',
        message: `${label}: clean (0 matches across the known anti-pattern token set).`,
      });
    } else {
      results.push({
        name: 'No time-based-closure anti-patterns',
        status: 'FAIL',
        message:
          `${label}: ${matches.length} match(es) found - ` +
          matches.map((m) => `line ${m.line} [${m.pattern}]: ${m.snippet}`).join('; '),
      });
    }
  }

  // Idempotency-artifacts structural proxy (directive Step 7) - informational
  // only, per this run's Assumption 5: this script never re-executes a
  // resolver to prove idempotency live, it only checks that the dry-run/
  // undo-log module the real bulk-clear used is present on disk.
  if (mapping.artifactsFile) {
    const absPath = resolveResolverSourcePath(mapping.artifactsFile);
    const exists = fs.existsSync(absPath);
    results.push({
      name: 'Idempotency-artifacts module present (structural proxy, not a live re-execution proof)',
      status: exists ? 'PASS' : 'FAIL',
      message: exists
        ? `${mapping.artifactsFile} found. This script does not verify its content or ` +
          `re-execute the resolver - genuine idempotency proof is a one-time, human-supervised ` +
          `--apply-twice check at ship time (directive Step 7), not something this read-only ` +
          `script re-proves on every run.`
        : `Expected undo-log module '${mapping.artifactsFile}' not found on disk.`,
    });
  } else {
    results.push({
      name: 'Idempotency-artifacts module present (structural proxy, not a live re-execution proof)',
      status: 'INFO',
      message:
        'No artifacts module mapped for this resolver (predates the --plan/--apply/--revert ' +
        'convention, e.g. workforce_intelligence_engine/PR #1482) - not counted as pass or fail.',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function validateAgent(agentName: string): Promise<AgentValidationResult> {
  const checks: CheckResult[] = [];

  const { row, check: registrationCheck } = await checkAiAgentRegistered(agentName);
  checks.push(registrationCheck);

  if (!row) {
    // Nothing further can be meaningfully checked without a registered row -
    // report the gap and move on to the next agent rather than throwing.
    checks.push({
      name: 'tools_granted populated',
      status: 'FAIL',
      message: 'Skipped - no AiAgent row to read tools_granted from.',
    });
    checks.push({
      name: 'Display identity registered',
      status: 'FAIL',
      message: 'Skipped - no AiAgent row to resolve an identity for.',
    });
  } else {
    checks.push(checkToolsGranted(row));
    checks.push(await checkDisplayIdentity(agentName, row));
  }

  checks.push(...(await checkRecurringResolver(agentName)));

  return { agentName, checks };
}

function printReport(result: AgentValidationResult): void {
  console.log(`\n=== Agent Ticket Standard Validation: ${result.agentName} ===`);
  for (const check of result.checks) {
    console.log(`[${check.status}] ${check.name} — ${check.message}`);
  }
  const passCount = result.checks.filter((c) => c.status === 'PASS').length;
  const failCount = result.checks.filter((c) => c.status === 'FAIL').length;
  const infoCount = result.checks.filter((c) => c.status === 'INFO').length;
  console.log(`RESULT: ${passCount} PASS, ${failCount} FAIL, ${infoCount} INFO`);
}

async function main(): Promise<void> {
  const requestedAgents = process.argv.slice(2);
  const agentNames = requestedAgents.length > 0 ? requestedAgents : DEFAULT_AGENTS;

  await sequelize.authenticate();

  const results: AgentValidationResult[] = [];
  for (const agentName of agentNames) {
    const result = await validateAgent(agentName);
    printReport(result);
    results.push(result);
  }

  console.log(`\nAGENT_TICKET_STANDARD_RESULT: ${JSON.stringify(results)}`);

  await sequelize.close();

  const anyFail = results.some((r) => r.checks.some((c) => c.status === 'FAIL'));
  // Non-zero exit on any FAIL for scripting convenience only - this script
  // never blocks a merge or a deploy on its own (see header comment); a
  // caller is free to ignore the exit code.
  process.exit(anyFail ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[validateAgentTicketStandard] Fatal error:', err?.message ?? err);
    process.exit(2);
  });
}

export { validateAgent, checkResolverAntiPatterns };
