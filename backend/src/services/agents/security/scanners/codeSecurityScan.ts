/**
 * Pure static security scan over the backend TypeScript source.
 *
 * Extracted from codeSecurityAuditAgent.ts, which mixed three concerns: walking
 * the source tree, matching vulnerability patterns, and writing tickets to the
 * database. Only the last needs a database — but because they lived together,
 * the scan could only ever run somewhere a database existed.
 *
 * That mattered: the production image ships compiled `dist` with no TypeScript
 * source, so the agent could never scan anything in the one environment it was
 * scheduled to run in. This module has no I/O beyond reading files and no
 * database dependency, so CI — where the source actually IS checked out — can
 * run the identical scan the agent runs.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface VulnPattern {
  name: string;
  category: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

export interface CodeFinding {
  file: string;
  line: number;
  vuln_name: string;
  category: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

export const VULN_PATTERNS: VulnPattern[] = [
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

/** Recursively collect scannable .ts files (skipping tests, declarations, and build output). */
export function walkTs(dir: string, files: string[] = []): string[] {
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

export interface CodeScanResult {
  filesScanned: number;
  findings: CodeFinding[];
}

/**
 * Scan `backendSrc` for vulnerability patterns. Paths in findings are reported
 * relative to `projectRoot` so they are stable across machines and CI runners.
 */
export function scanCodeForVulnerabilities(backendSrc: string, projectRoot: string): CodeScanResult {
  const findings: CodeFinding[] = [];
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

  return { filesScanned, findings };
}
