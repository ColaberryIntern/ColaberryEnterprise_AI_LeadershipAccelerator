import * as fs from 'fs';
import * as path from 'path';
import { Department, DepartmentEvent } from '../../../models';
import { createTicket } from '../../ticketService';
import { resolveProjectRoot } from './sourceTreeRoot';
import { scanCodeForVulnerabilities, type CodeFinding } from './scanners/codeSecurityScan';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'CodeSecurityAuditAgent';

export async function runCodeSecurityAuditAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const findings: CodeFinding[] = [];

  try {
    const projectRoot = resolveProjectRoot();
    const backendSrc = projectRoot === null ? null : path.join(projectRoot, 'backend', 'src');

    // See accessControlGuardianAgent: the production image has no source tree,
    // so a missing backend/src is an expected skip, not an agent failure.
    if (projectRoot === null || backendSrc === null || !fs.existsSync(backendSrc)) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'backend', event: 'source_scan_skipped_no_source_tree',
        outcome: 'partial', context: { agent: AGENT_NAME, looked_for: backendSrc || '<no project root>' },
      }));
      actions.push({
        campaign_id: null,
        action: 'scan_skipped_no_source',
        reason: 'Source tree not present in this runtime (compiled build) — static security scan is a CI-time check.',
        confidence: 1,
        before_state: null,
        after_state: { skipped: true },
        result: 'skipped',
        entity_type: 'system',
      } as AgentAction);
      return { agent_name: AGENT_NAME, campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - start };
    }

    const scan = scanCodeForVulnerabilities(backendSrc, projectRoot);
    const filesScanned = scan.filesScanned;
    findings.push(...scan.findings);

    actions.push({
      campaign_id: '',
      action: 'code_security_audit',
      reason: `Audited ${filesScanned} files, found ${findings.length} potential vulnerability(ies)`,
      confidence: 0.8,
      before_state: null,
      after_state: {
        files_scanned: filesScanned,
        findings_count: findings.length,
        by_category: findings.reduce((acc, f) => { acc[f.category] = (acc[f.category] || 0) + 1; return acc; }, {} as Record<string, number>),
      },
      result: findings.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (securityDept) {
      const deptId = (securityDept as any).id;
      const severity = findings.some((f) => f.severity === 'critical') ? 'critical'
        : findings.some((f) => f.severity === 'high') ? 'high' : 'normal';

      await DepartmentEvent.create({
        department_id: deptId,
        event_type: 'security_scan' as any,
        title: `Code Audit: ${findings.length} finding(s) in ${filesScanned} files`,
        description: findings.length > 0
          ? `Categories: ${[...new Set(findings.map((f) => f.category))].join(', ')}`
          : `Clean audit — no vulnerabilities in ${filesScanned} files`,
        severity,
        metadata: { agent: AGENT_NAME, files_scanned: filesScanned, findings: findings.slice(0, 20) },
      });

      // Create tickets for critical/high categories
      const categories = [...new Set(findings.filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => f.category))];
      for (const cat of categories) {
        const catFindings = findings.filter((f) => f.category === cat);
        try {
          await createTicket({
            title: `[Security] ${cat.replace('_', ' ')} vulnerability (${catFindings.length} instance(s))`,
            description: `Code security audit found ${catFindings.length} ${cat} issue(s). Files: ${[...new Set(catFindings.map((f) => f.file))].slice(0, 5).join(', ')}`,
            priority: catFindings.some((f) => f.severity === 'critical') ? 'critical' : 'high',
            type: 'bug',
            source: 'security',
            created_by_type: 'agent',
            created_by_id: agentId,
            entity_type: 'system',
            entity_id: deptId,
            metadata: { category: cat, findings: catFindings.slice(0, 10) },
          });
        } catch (err: any) {
          errors.push(`Ticket failed for ${cat}: ${err.message?.slice(0, 100)}`);
        }
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Code security audit error');
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: findings.length,
  };
}
