import * as fs from 'fs';
import * as path from 'path';
import { Department, DepartmentEvent } from '../../../models';
import { createTicket } from '../../ticketService';
import { resolveProjectRoot } from './sourceTreeRoot';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'SecretDetectionAgent';

// Regex patterns for common secret types
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; severity: 'critical' | 'high' | 'medium' }> = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, severity: 'critical' },
  { name: 'Connection String', pattern: /(?:postgres|mysql|mongodb):\/\/[^\s'"]{10,}/i, severity: 'critical' },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, severity: 'high' },
  { name: 'Generic Secret Assignment', pattern: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token|password)\s*[:=]\s*['"][^'"]{8,}['"]/i, severity: 'high' },
  { name: 'OpenAI Key', pattern: /sk-[a-zA-Z0-9]{20,}/, severity: 'critical' },
  { name: 'Supabase Key', pattern: /sbp_[a-zA-Z0-9]{20,}/, severity: 'critical' },
];

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.env', '.env.example', '.env.local'];
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', '.git', '.next', 'coverage'];
const EXCLUDE_FILES = ['.test.ts', '.test.tsx', '.spec.ts', '.md', 'package-lock.json'];

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  const base = path.basename(filePath);
  if (!SCAN_EXTENSIONS.includes(ext) && !base.startsWith('.env')) return false;
  if (EXCLUDE_FILES.some((ex) => filePath.endsWith(ex))) return false;
  return true;
}

function walkDir(dir: string, files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, files);
      } else if (shouldScanFile(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Permission errors or missing dirs — skip silently
  }
  return files;
}

/**
 * A finding carries WHERE the secret is, never the secret.
 *
 * This used to keep `snippet`: the first 80 characters of the matching line. Up to five of those
 * went into the ticket's metadata, so the ticket raised to report a leaked key could contain the
 * key — in a record that is broader-read than the file it came from, and against the platform's
 * own policy, where `secret_exfiltration` is default-denied (executionPolicy.ts). Quincy found
 * this on 2026-10-26 while building Ellis's security posture capability.
 *
 * The field is gone rather than redacted at the point of use. `file` and `line` are enough to
 * find the secret, triage needs nothing more, and a field that never holds the secret cannot be
 * copied into a new sink by the next person to add a report here.
 */
interface SecretFinding {
  file: string;
  line: number;
  pattern_name: string;
  severity: 'critical' | 'high' | 'medium';
}

export async function runSecretDetectionAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const findings: SecretFinding[] = [];

  try {
    /**
     * No source tree means SKIPPED, not clean.
     *
     * The old `process.env.PROJECT_ROOT || path.resolve(__dirname, '../../../../..')` resolved to
     * `/` inside the production container, so every run looked for `/backend/src`, found nothing,
     * scanned zero files and recorded "Clean scan — no secrets detected in 0 files". A clean bill
     * of health from a scan that never happened is worse than no scan at all, because it answers
     * the question it never asked. `codeSecurityAuditAgent` was moved onto `resolveProjectRoot`
     * for exactly this reason; the secret and dependency scanners were left behind. Quincy found
     * that on 2026-10-26.
     */
    const projectRoot = resolveProjectRoot();
    if (projectRoot === null) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'backend', event: 'source_scan_skipped_no_source_tree',
        outcome: 'partial', context: { agent: AGENT_NAME },
      }));
      actions.push({
        campaign_id: null,
        action: 'scan_skipped_no_source',
        reason: 'Source tree not present in this runtime (compiled build) — secret scanning is a CI-time check.',
        confidence: 1,
        before_state: null,
        after_state: { skipped: true },
        result: 'skipped',
        entity_type: 'system',
      } as AgentAction);
      return {
        agent_name: AGENT_NAME,
        campaigns_processed: 0,
        actions_taken: actions,
        errors,
        duration_ms: Date.now() - start,
        entities_processed: 0,
      };
    }

    const scanDirs = [
      path.join(projectRoot, 'backend', 'src'),
      path.join(projectRoot, 'frontend', 'src'),
    ];

    let filesScanned = 0;
    for (const scanDir of scanDirs) {
      if (!fs.existsSync(scanDir)) continue;
      const files = walkDir(scanDir);

      for (const filePath of files) {
        filesScanned++;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comment lines and import lines
            if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('import ')) continue;
            // Skip lines that reference env vars (these are safe)
            if (line.includes('process.env.') || line.includes('getenv')) continue;

            for (const sp of SECRET_PATTERNS) {
              if (sp.pattern.test(line)) {
                // Don't report patterns in test/example contexts
                const lower = line.toLowerCase();
                if (lower.includes('example') || lower.includes('placeholder') || lower.includes('xxx')) continue;

                findings.push({
                  file: path.relative(projectRoot, filePath),
                  line: i + 1,
                  pattern_name: sp.name,
                  severity: sp.severity,
                });
                break; // One finding per line
              }
            }
          }
        } catch {
          // Can't read file — skip
        }
      }
    }

    actions.push({
      campaign_id: '',
      action: 'secret_scan',
      reason: `Scanned ${filesScanned} files, found ${findings.length} potential secret(s)`,
      confidence: 0.85,
      before_state: null,
      after_state: { files_scanned: filesScanned, findings_count: findings.length },
      result: findings.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    // Log DepartmentEvent
    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (securityDept) {
      const deptId = (securityDept as any).id;
      const severity = findings.some((f) => f.severity === 'critical') ? 'critical'
        : findings.some((f) => f.severity === 'high') ? 'high' : 'normal';

      await DepartmentEvent.create({
        department_id: deptId,
        event_type: findings.length > 0 ? 'threat_detected' as any : 'security_scan' as any,
        title: `Secret Scan: ${findings.length} finding(s) in ${filesScanned} files`,
        description: findings.length > 0
          ? `Found ${findings.length} potential secret(s): ${[...new Set(findings.map((f) => f.pattern_name))].join(', ')}`
          // Zero findings over zero files is not a clean scan. The source-tree skip above is the
          // main way that used to happen, and this keeps the record honest if it happens any
          // other way.
          : filesScanned === 0
            ? 'UNKNOWN — no files were read, so this is not a clean result'
            : `Clean scan — no secrets detected in ${filesScanned} files`,
        severity,
        metadata: {
          agent: AGENT_NAME,
          files_scanned: filesScanned,
          findings_count: findings.length,
          findings_by_type: findings.reduce((acc, f) => { acc[f.pattern_name] = (acc[f.pattern_name] || 0) + 1; return acc; }, {} as Record<string, number>),
          top_findings: findings.slice(0, 10).map((f) => ({ file: f.file, line: f.line, type: f.pattern_name, severity: f.severity })),
        },
      });

      // Create tickets for critical findings
      const criticalTypes = [...new Set(findings.filter((f) => f.severity === 'critical').map((f) => f.pattern_name))];
      for (const secretType of criticalTypes) {
        const typeFindings = findings.filter((f) => f.pattern_name === secretType);
        try {
          await createTicket({
            title: `[Security] ${secretType} detected in ${typeFindings.length} file(s)`,
            description: `Secret detection agent found ${typeFindings.length} instance(s) of ${secretType}. Files: ${typeFindings.map((f) => f.file).join(', ')}. Move secrets to environment variables immediately.`,
            priority: 'critical',
            type: 'bug',
            source: 'security',
            created_by_type: 'agent',
            created_by_id: agentId,
            entity_type: 'system',
            entity_id: deptId,
            // Explicitly named fields, not the finding object. `SecretFinding` no longer carries
          // the matched text, and spelling the fields out here keeps it that way should anyone
          // widen that type again.
          metadata: {
            threat_type: secretType,
            findings: typeFindings.slice(0, 5).map((f) => ({
              file: f.file, line: f.line, type: f.pattern_name, severity: f.severity,
            })),
          },
          });
        } catch (err: any) {
          errors.push(`Ticket creation failed for ${secretType}: ${err.message?.slice(0, 100)}`);
        }
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Secret detection error');
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
