/**
 * CI entry point for the static security scan.
 *
 * CodeSecurityAuditAgent is scheduled in production, but the production image
 * ships only compiled `dist` — there is no TypeScript source there to scan, so
 * in the one environment it actually runs it can never find anything. The scan
 * belongs in CI, where the repository is checked out.
 *
 * This script runs the SAME scan the agent runs (shared
 * scanners/codeSecurityScan.ts — not a reimplementation that could drift), with
 * no database dependency.
 *
 * Report-only by default: it prints findings and exits 0, so it starts by
 * telling us the real baseline rather than blocking every PR on day one.
 * Pass --fail-on=critical (or high/medium) to make it gate.
 *
 * Usage:
 *   npx ts-node src/scripts/runSecurityScan.ts
 *   npx ts-node src/scripts/runSecurityScan.ts --fail-on=critical
 */
import * as path from 'path';
import * as fs from 'fs';
import { scanCodeForVulnerabilities, type CodeFinding } from '../services/agents/security/scanners/codeSecurityScan';

type Severity = 'critical' | 'high' | 'medium';
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium'];

function parseFailOn(argv: string[]): Severity | null {
  const arg = argv.find((a) => a.startsWith('--fail-on='));
  if (!arg) return null;
  const value = arg.split('=')[1] as Severity;
  if (!SEVERITY_ORDER.includes(value)) {
    console.error(`Invalid --fail-on value "${value}". Expected one of: ${SEVERITY_ORDER.join(', ')}`);
    process.exit(2);
  }
  return value;
}

/** At or above the given severity — 'high' includes 'critical'. */
function atOrAbove(findings: CodeFinding[], threshold: Severity): CodeFinding[] {
  const cutoff = SEVERITY_ORDER.indexOf(threshold);
  return findings.filter((f) => SEVERITY_ORDER.indexOf(f.severity) <= cutoff);
}

function main(): void {
  const failOn = parseFailOn(process.argv.slice(2));

  // This script lives at backend/src/scripts, so the repo root is three up.
  const projectRoot = path.resolve(__dirname, '../../..');
  const backendSrc = path.join(projectRoot, 'backend', 'src');

  if (!fs.existsSync(backendSrc)) {
    console.error(`[SecurityScan] backend/src not found at ${backendSrc} — cannot scan.`);
    process.exit(2);
  }

  const { filesScanned, findings } = scanCodeForVulnerabilities(backendSrc, projectRoot);

  const byCategory = findings.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const bySeverity = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`[SecurityScan] Scanned ${filesScanned} files — ${findings.length} potential finding(s)`);
  if (findings.length > 0) {
    console.log(`[SecurityScan] By severity: ${JSON.stringify(bySeverity)}`);
    console.log(`[SecurityScan] By category: ${JSON.stringify(byCategory)}`);
    console.log('');
    for (const severity of SEVERITY_ORDER) {
      const group = findings.filter((f) => f.severity === severity);
      if (group.length === 0) continue;
      console.log(`--- ${severity.toUpperCase()} (${group.length}) ---`);
      for (const f of group) {
        console.log(`  ${f.file}:${f.line}  ${f.vuln_name} — ${f.description}`);
      }
      console.log('');
    }
  }

  // These are regex heuristics, not proof. They flag lines worth a human look;
  // false positives are expected, which is exactly why gating is opt-in.
  if (!failOn) {
    console.log('[SecurityScan] Report-only (no --fail-on given) — exiting 0.');
    return;
  }

  const blocking = atOrAbove(findings, failOn);
  if (blocking.length > 0) {
    console.error(`[SecurityScan] FAILED: ${blocking.length} finding(s) at or above "${failOn}".`);
    process.exit(1);
  }
  console.log(`[SecurityScan] PASSED: no findings at or above "${failOn}".`);
}

main();
