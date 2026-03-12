import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Department, DepartmentEvent } from '../../../models';
import { createTicket } from '../../ticketService';
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

function runNpmAudit(dir: string): AuditResult | null {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return null;

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
      directory: path.basename(dir),
      critical,
      high,
      moderate,
      low,
      total: critical + high + moderate + low,
      advisories,
    };
  } catch {
    return null;
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
    const projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../../../..');
    const dirs = [
      path.join(projectRoot, 'backend'),
      path.join(projectRoot, 'frontend'),
    ];

    const results: AuditResult[] = [];
    for (const dir of dirs) {
      const result = runNpmAudit(dir);
      if (result) results.push(result);
    }

    const totalCritical = results.reduce((s, r) => s + r.critical, 0);
    const totalHigh = results.reduce((s, r) => s + r.high, 0);
    const totalVulns = results.reduce((s, r) => s + r.total, 0);

    actions.push({
      campaign_id: '',
      action: 'dependency_audit',
      reason: `Audited ${results.length} project(s): ${totalVulns} vulnerabilities (${totalCritical} critical, ${totalHigh} high)`,
      confidence: 0.9,
      before_state: null,
      after_state: { projects_audited: results.length, total_vulns: totalVulns, critical: totalCritical, high: totalHigh },
      result: totalCritical > 0 || totalHigh > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (securityDept) {
      const deptId = (securityDept as any).id;

      await DepartmentEvent.create({
        department_id: deptId,
        event_type: 'security_scan' as any,
        title: `Dependency Audit: ${totalVulns} vulnerability(ies) across ${results.length} project(s)`,
        description: `Critical: ${totalCritical}, High: ${totalHigh}, Moderate: ${results.reduce((s, r) => s + r.moderate, 0)}, Low: ${results.reduce((s, r) => s + r.low, 0)}`,
        severity: totalCritical > 0 ? 'critical' : totalHigh > 0 ? 'high' : 'normal',
        metadata: { agent: AGENT_NAME, results },
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
