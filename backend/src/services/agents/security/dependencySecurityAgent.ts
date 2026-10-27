import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Department, DepartmentEvent } from '../../../models';
import { createTicket } from '../../ticketService';
import { resolveProjectRoot } from './sourceTreeRoot';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'DependencySecurityAgent';

interface AuditResult {
  directory: string;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  total: number;
  advisories: Array<{ id: number; title: string; severity: string; module_name: string; url: string }>;
}

/**
 * Why a failed audit needs its own answer.
 *
 * `runNpmAudit` returned null for two completely different situations: "there is no project
 * here" and "the audit ran and blew up". Both dropped the directory out of `results`, so a run
 * where every audit failed reported "0 vulnerabilities across 0 project(s)" — indistinguishable
 * from a clean estate. `npm audit` is also invoked with `2>/dev/null || true`, which hands a
 * non-JSON or empty stdout to `JSON.parse`, and the bare `catch` swallowed that too. Quincy
 * reported both on 2026-10-26.
 */
type AuditOutcome =
  | { kind: 'audited'; result: AuditResult }
  | { kind: 'absent' }
  | { kind: 'failed'; directory: string; error: string };

function runNpmAudit(dir: string): AuditOutcome {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return { kind: 'absent' };

  try {
    // npm audit returns non-zero exit code when vulnerabilities exist, so we catch that
    const output = execSync('npm audit --json 2>/dev/null || true', {
      cwd: dir,
      timeout: 30000,
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
    });

    const parsed = JSON.parse(output);
    const vulns = parsed.vulnerabilities || {};
    const advisories: AuditResult['advisories'] = [];

    let critical = 0, high = 0, moderate = 0, low = 0;

    for (const [name, info] of Object.entries(vulns) as any[]) {
      const sev = info.severity || 'low';
      if (sev === 'critical') critical++;
      else if (sev === 'high') high++;
      else if (sev === 'moderate') moderate++;
      else low++;

      if (advisories.length < 15) {
        advisories.push({
          id: info.via?.[0]?.source || 0,
          title: info.via?.[0]?.title || name,
          severity: sev,
          module_name: name,
          url: info.via?.[0]?.url || '',
        });
      }
    }

    return {
      kind: 'audited',
      result: {
        directory: path.basename(dir),
        critical,
        high,
        moderate,
        low,
        total: critical + high + moderate + low,
        advisories,
      },
    };
  } catch (err: any) {
    return {
      kind: 'failed',
      directory: path.basename(dir),
      error: String(err?.message || 'npm audit failed').slice(0, 200),
    };
  }
}

export async function runDependencySecurityAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // No source tree means SKIPPED, not clean — same reasoning as secretDetectionAgent.
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'backend', event: 'source_scan_skipped_no_source_tree',
        outcome: 'partial', context: { agent: AGENT_NAME },
      }));
      actions.push({
        campaign_id: null,
        action: 'scan_skipped_no_source',
        reason: 'No project tree in this runtime (compiled build) — dependency audit is a CI-time check.',
        confidence: 1,
        before_state: null,
        after_state: { skipped: true },
        result: 'skipped',
        entity_type: 'system',
      } as AgentAction);
      return {
        agent_name: AGENT_NAME, campaigns_processed: 0, actions_taken: actions, errors,
        duration_ms: Date.now() - start,
      };
    }

    const dirs = [
      path.join(projectRoot, 'backend'),
      path.join(projectRoot, 'frontend'),
    ];

    const results: AuditResult[] = [];
    const auditFailures: Array<{ directory: string; error: string }> = [];
    for (const dir of dirs) {
      const outcome = runNpmAudit(dir);
      if (outcome.kind === 'audited') results.push(outcome.result);
      else if (outcome.kind === 'failed') {
        auditFailures.push({ directory: outcome.directory, error: outcome.error });
        // Surfaced as an agent error so the run is logged as failed rather than counted clean.
        errors.push(`npm audit failed in ${outcome.directory}: ${outcome.error}`);
      }
    }

    const totalCritical = results.reduce((s, r) => s + r.critical, 0);
    const totalHigh = results.reduce((s, r) => s + r.high, 0);
    const totalVulns = results.reduce((s, r) => s + r.total, 0);

    // A count is only a count of what was actually audited. When nothing was, the answer is
    // "unknown", and it must not read as zero.
    const nothingAudited = results.length === 0;
    const partial = auditFailures.length > 0;

    actions.push({
      campaign_id: '',
      action: nothingAudited ? 'dependency_audit_unknown' : 'dependency_audit',
      reason: nothingAudited
        ? `No project audited successfully (${auditFailures.length} audit failure(s)) — vulnerability count is UNKNOWN, not zero.`
        : `Audited ${results.length} project(s): ${totalVulns} vulnerabilities (${totalCritical} critical, ${totalHigh} high)`
          + (partial ? `; ${auditFailures.length} project(s) failed to audit, so this count is partial` : ''),
      confidence: nothingAudited ? 0 : partial ? 0.5 : 0.9,
      before_state: null,
      after_state: {
        projects_audited: results.length,
        audit_failures: auditFailures.length,
        coverage: nothingAudited ? 'none' : partial ? 'partial' : 'complete',
        total_vulns: nothingAudited ? null : totalVulns,
        critical: nothingAudited ? null : totalCritical,
        high: nothingAudited ? null : totalHigh,
      },
      result: nothingAudited || partial ? 'flagged' : totalCritical > 0 || totalHigh > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (securityDept) {
      const deptId = (securityDept as any).id;

      await DepartmentEvent.create({
        department_id: deptId,
        event_type: 'security_scan' as any,
        title: nothingAudited
          ? 'Dependency Audit: UNKNOWN — no project audited successfully'
          : `Dependency Audit: ${totalVulns} vulnerability(ies) across ${results.length} project(s)`
            + (partial ? ' (partial)' : ''),
        description: nothingAudited
          ? `Every npm audit failed (${auditFailures.map((f) => `${f.directory}: ${f.error}`).join('; ')}). `
            + 'This is not a clean result — the dependency tree was never read.'
          : `Critical: ${totalCritical}, High: ${totalHigh}, Moderate: ${results.reduce((s, r) => s + r.moderate, 0)}, Low: ${results.reduce((s, r) => s + r.low, 0)}`
            + (partial ? `. Partial: ${auditFailures.length} project(s) failed to audit.` : ''),
        // An unknown result is not "normal". An estate nobody could read is at least as
        // interesting as one with a high-severity finding in it.
        severity: nothingAudited ? 'high' : totalCritical > 0 ? 'critical' : totalHigh > 0 ? 'high' : 'normal',
        metadata: {
          agent: AGENT_NAME,
          results,
          audit_failures: auditFailures,
          coverage: nothingAudited ? 'none' : partial ? 'partial' : 'complete',
        },
      });

      // Ticket for critical vulnerabilities
      if (totalCritical > 0) {
        const critAdvisories = results.flatMap((r) => r.advisories.filter((a) => a.severity === 'critical'));
        try {
          await createTicket({
            title: `[Security] ${totalCritical} critical dependency vulnerability(ies)`,
            description: `npm audit found ${totalCritical} critical CVE(s): ${critAdvisories.map((a) => `${a.module_name} — ${a.title}`).join('; ')}`,
            priority: 'critical',
            type: 'bug',
            source: 'security',
            created_by_type: 'agent',
            created_by_id: agentId,
            entity_type: 'system',
            entity_id: deptId,
            metadata: { advisories: critAdvisories },
          });
        } catch (err: any) {
          errors.push(`Ticket failed: ${err.message?.slice(0, 100)}`);
        }
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Dependency security error');
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
  };
}
