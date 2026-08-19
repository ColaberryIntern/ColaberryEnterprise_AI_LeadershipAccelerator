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
  // Matches an interpolated template literal that is ACTUALLY SQL.
  //
  // The previous pattern was `...\$\{...\}...(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)/i` and
  // produced 229 hits of which 213 were noise: case-insensitive single keywords
  // mean any English prose containing "from", "deleted" or "updated" matched, so
  // `console.log(\`Extracted \${n} chars from \${file}\`)` was reported as critical
  // SQL injection. A scanner that cries wolf 93% of the time trains people to
  // ignore it, which is worse than not running it.
  //
  // Two changes do the work:
  //   1. NO /i flag. SQL keywords are written uppercase in this codebase; English
  //      prose is not. This alone removes the "from"/"deleted" class of noise.
  //   2. Require a full statement SHAPE (verb + its object), not a lone keyword —
  //      SELECT..FROM, INSERT INTO, UPDATE..SET, DELETE FROM.
  // The leading lookahead keeps the requirement that the literal is interpolated;
  // a fully static SQL string is not an injection risk.
  { name: 'SQL String Interpolation', category: 'sql_injection', pattern: /`(?=[^`]*\$\{)[^`]*(?:SELECT\b[^`]*\bFROM\b|INSERT\s+INTO\b|UPDATE\b[^`]*\bSET\b|DELETE\s+FROM\b)/, severity: 'critical', description: 'Interpolated template literal used as a SQL statement — use parameterized queries, or escape identifiers' },
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

/**
 * Files whose CONTENT is not executable application logic, so a pattern match in
 * them is noise by definition rather than a vulnerability.
 *
 * Kept deliberately small and specific — an exclusion list is how a scanner
 * quietly stops covering real code, so each entry states why it is here and is
 * matched on an exact repo-relative path, never a broad glob.
 */
const EXCLUDE_FILES: { path: string; reason: string }[] = [
  {
    // This file IS the pattern list. Its `eval()` rule contains the literal
    // string `eval(` inside its own regex, so the scanner reports itself every
    // run — a permanent false positive that can never be "fixed" in place.
    path: 'backend/src/services/agents/security/scanners/codeSecurityScan.ts',
    reason: 'scanner pattern definitions match themselves',
  },
  {
    // Curriculum content: teaching material that quotes SQL and JavaScript as
    // examples for students. The snippets are data in a lesson, never executed.
    path: 'backend/src/data/classTeachWeeks.ts',
    reason: 'curriculum content — code samples are lesson data, not executed',
  },
];

/** True if this file is on the documented exclusion list. */
export function isExcludedFile(relativePath: string): boolean {
  // Normalise BOTH separators, not just path.sep: CI runs on Linux where
  // path.sep is '/', so a Windows-style path passed in would never match.
  const normalised = relativePath.replace(/\\/g, '/');
  return EXCLUDE_FILES.some((e) => e.path === normalised);
}

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
  /** Files skipped via EXCLUDE_FILES, reported so coverage loss is never silent. */
  filesExcluded: { path: string; reason: string }[];
  findings: CodeFinding[];
}

/**
 * Scan `backendSrc` for vulnerability patterns. Paths in findings are reported
 * relative to `projectRoot` so they are stable across machines and CI runners.
 */
export function scanCodeForVulnerabilities(backendSrc: string, projectRoot: string): CodeScanResult {
  const findings: CodeFinding[] = [];
  const files = walkTs(backendSrc);
  const filesExcluded: { path: string; reason: string }[] = [];
  let filesScanned = 0;

  for (const filePath of files) {
    const relative = path.relative(projectRoot, filePath);
    // Skip BEFORE counting: an excluded file was never examined, and counting it
    // as scanned would overstate coverage.
    if (isExcludedFile(relative)) {
      const normalised = relative.replace(/\\/g, '/');
      const entry = EXCLUDE_FILES.find((e) => e.path === normalised);
      if (entry) filesExcluded.push(entry);
      continue;
    }

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
              file: relative,
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

  return { filesScanned, filesExcluded, findings };
}
