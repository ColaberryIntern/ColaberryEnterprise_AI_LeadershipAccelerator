import * as fs from 'fs';
import * as path from 'path';
import { Department, DepartmentEvent } from '../../../models';
import { createTicket } from '../../ticketService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'CodeSecurityAuditAgent';

interface VulnPattern {
  name: string;
  category: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

const VULN_PATTERNS: VulnPattern[] = [
  // SQL Injection
  { name: 'SQL String Interpolation', category: 'sql_injection', pattern: /`[^`]*\$\{[^}]+\}[^`]*(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)/i, severity: 'critical', description: 'Template literal used in SQL query — use parameterized queries' },
  { name: 'SQL Concatenation', category: 'sql_injection', pattern: /(?:query|sql)\s*[+=]\s*['"][^'"]*\+/i, severity: 'high', description: 'String concatenation in SQL query context' },
  // XSS
  { name: 'innerHTML Assignment', category: 'xss', pattern: /\.innerHTML\s*=/, severity: 'high', description: 'Direct innerHTML assignment — use textContent or sanitize' },
  { name: 'dangerouslySetInnerHTML', category: 'xss', pattern: /dangerouslySetInnerHTML/, severity: 'medium', description: 'React dangerouslySetInnerHTML usage — ensure input is sanitized' },
  { name: 'document.write', category: 'xss', pattern: /document\.write\s*\(/, severity: 'high', description: 'document.write usage — potential XSS vector' },
  // Command Injection
  { name: 'exec() Call', category: 'command_injection', pattern: /(?:child_process|require\(['"]child_process['"]\)).*exec\(/, severity: 'critical', description: 'child_process.exec with potential unsanitized input' },
  { name: 'execSync Usage', category: 'command_injection', pattern: /execSync\s*\(/, severity: 'high', description: 'Synchronous command execution — ensure input is sanitized' },
  // Eval
  { name: 'eval() Usage', category: 'code_injection', pattern: /\beval\s*\(/, severity: 'critical', description: 'eval() usage — never use with untrusted input' },
  { name: 'Function Constructor', category: 'code_injection', pattern: /new\s+Function\s*\(/, severity: 'high', description: 'new Function() acts like eval — avoid with untrusted input' },
  // Path Traversal
  { name: 'Path Traversal Risk', category: 'path_traversal', pattern: /(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync)\s*\([^)]*(?:req\.|params\.|query\.)/, severity: 'high', description: 'File operation with request-derived path — validate and sanitize' },
];

const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', '.git', 'coverage'];

function walkTs(dir: string, files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkTs(fullPath, files);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch { /* skip */ }
  return files;
}

interface CodeFinding {
  file: string;
  line: number;
  vuln_name: string;
  category: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

export async function runCodeSecurityAuditAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const findings: CodeFinding[] = [];

  try {
    const projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../../../..');
    const backendSrc = path.join(projectRoot, 'backend', 'src');

    if (!fs.existsSync(backendSrc)) {
      errors.push(`Backend src not found at ${backendSrc}`);
      return { agent_name: AGENT_NAME, campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - start };
    }

    const files = walkTs(backendSrc);
    let filesScanned = 0;

    for (const filePath of files) {
      filesScanned++;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

          for (const vp of VULN_PATTERNS) {
            if (vp.pattern.test(line)) {
              findings.push({
                file: path.relative(projectRoot, filePath),
                line: i + 1,
                vuln_name: vp.name,
                category: vp.category,
                severity: vp.severity,
                description: vp.description,
              });
              break;
            }
          }
        }
      } catch { /* skip unreadable */ }
    }

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
