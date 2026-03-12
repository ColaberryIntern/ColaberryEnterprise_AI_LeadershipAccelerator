import * as fs from 'fs';
import * as path from 'path';
import { Department, DepartmentEvent } from '../../../models';
import { createTicket } from '../../ticketService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AccessControlGuardianAgent';

interface RouteFinding {
  file: string;
  line: number;
  route: string;
  method: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium';
}

const ROUTE_PATTERN = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i;
const ADMIN_GUARD = /requireAdmin/;
const AUTH_GUARD = /requireAuth|requireAdmin|authenticate|isAuthenticated/;

function walkRouteFiles(dir: string, files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkRouteFiles(fullPath, files);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch { /* skip */ }
  return files;
}

export async function runAccessControlGuardianAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const findings: RouteFinding[] = [];

  try {
    const projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../../../..');
    const routesDir = path.join(projectRoot, 'backend', 'src', 'routes');

    if (!fs.existsSync(routesDir)) {
      errors.push(`Routes directory not found: ${routesDir}`);
      return { agent_name: AGENT_NAME, campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - start };
    }

    const routeFiles = walkRouteFiles(routesDir);
    let routesScanned = 0;

    for (const filePath of routeFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const relPath = path.relative(projectRoot, filePath);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = line.match(ROUTE_PATTERN);
          if (!match) continue;

          routesScanned++;
          const method = match[1].toUpperCase();
          const routePath = match[2];

          // Check admin routes without requireAdmin
          if (routePath.includes('/admin/') && !ADMIN_GUARD.test(line)) {
            // Check the few lines before for middleware chain
            const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
            if (!ADMIN_GUARD.test(context)) {
              findings.push({
                file: relPath,
                line: i + 1,
                route: routePath,
                method,
                issue: 'Admin route without requireAdmin middleware',
                severity: 'critical',
              });
            }
          }

          // Check sensitive operations without any auth
          if ((method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
            && !routePath.includes('/public/')
            && !routePath.includes('/auth/')
            && !routePath.includes('/webhook')
            && !routePath.includes('/chat/')) {
            const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
            if (!AUTH_GUARD.test(context)) {
              findings.push({
                file: relPath,
                line: i + 1,
                route: routePath,
                method,
                issue: `${method} endpoint without authentication`,
                severity: 'high',
              });
            }
          }
        }

        // Check for Helmet
        if (filePath.endsWith('server.ts') || filePath.endsWith('app.ts')) {
          if (!content.includes('helmet')) {
            findings.push({
              file: relPath,
              line: 1,
              route: 'N/A',
              method: 'N/A',
              issue: 'Helmet middleware not detected in server configuration',
              severity: 'medium',
            });
          }
        }
      } catch { /* skip unreadable */ }
    }

    actions.push({
      campaign_id: '',
      action: 'access_control_audit',
      reason: `Scanned ${routeFiles.length} route file(s), ${routesScanned} route(s), found ${findings.length} issue(s)`,
      confidence: 0.8,
      before_state: null,
      after_state: {
        route_files: routeFiles.length,
        routes_scanned: routesScanned,
        findings_count: findings.length,
        by_severity: findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {} as Record<string, number>),
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
        title: `Access Control Audit: ${findings.length} issue(s) in ${routeFiles.length} file(s)`,
        description: findings.length > 0
          ? `Issues: ${[...new Set(findings.map((f) => f.issue))].join('; ')}`
          : `Clean audit — all ${routesScanned} route(s) properly protected`,
        severity,
        metadata: { agent: AGENT_NAME, routes_scanned: routesScanned, findings: findings.slice(0, 15) },
      });

      // Ticket for critical findings (unprotected admin routes)
      const critFindings = findings.filter((f) => f.severity === 'critical');
      if (critFindings.length > 0) {
        try {
          await createTicket({
            title: `[Security] ${critFindings.length} unprotected admin route(s)`,
            description: `Access control audit found admin routes without requireAdmin: ${critFindings.map((f) => `${f.method} ${f.route} (${f.file}:${f.line})`).join('; ')}`,
            priority: 'critical',
            type: 'bug',
            source: 'security',
            created_by_type: 'agent',
            created_by_id: agentId,
            entity_type: 'system',
            entity_id: deptId,
            metadata: { findings: critFindings },
          });
        } catch (err: any) {
          errors.push(`Ticket failed: ${err.message?.slice(0, 100)}`);
        }
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Access control audit error');
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
