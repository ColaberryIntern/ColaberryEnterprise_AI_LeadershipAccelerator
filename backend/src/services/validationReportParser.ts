/**
 * Validation Report Parser
 *
 * Parses the structured VALIDATION REPORT that Claude Code outputs after
 * implementing a feature. Extracts files created/modified, routes added,
 * database changes, and status. Uses these to match requirements as verified.
 *
 * Report format (baked into every prompt):
 *   VALIDATION REPORT
 *   Files Created:
 *   - path/to/file1.ts
 *   - path/to/file2.ts
 *   Routes:
 *   - GET /api/...
 *   - POST /api/...
 *   Database:
 *   - TableName (if any)
 *   Status: COMPLETE
 */

import { Op } from 'sequelize';
import { RequirementsMap, Capability } from '../models';

export interface ParsedReport {
  filesCreated: string[];
  filesModified: string[];
  routes: string[];
  database: string[];
  status: string;
  rawText: string;
  duplicatesNoted: string[];
}

export function parseValidationReport(text: string): ParsedReport {
  const result: ParsedReport = {
    filesCreated: [],
    filesModified: [],
    routes: [],
    database: [],
    status: 'UNKNOWN',
    rawText: text,
    duplicatesNoted: [],
  };

  if (!text) return result;

  const lines = text.split('\n').map(l => l.trim());
  let section: 'none' | 'files_created' | 'files_modified' | 'routes' | 'database' | 'duplicates' = 'none';

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Detect section headers
    if (/^files?\s*created/i.test(line) || /^new\s*files/i.test(line)) { section = 'files_created'; continue; }
    if (/^files?\s*modified/i.test(line) || /^changed\s*files/i.test(line) || /^updated\s*files/i.test(line)) { section = 'files_modified'; continue; }
    if (/^routes?:/i.test(line) || /^api\s*endpoints?/i.test(line)) { section = 'routes'; continue; }
    if (/^database/i.test(line) || /^tables?/i.test(line) || /^models?:/i.test(line)) { section = 'database'; continue; }
    if (/^status:/i.test(line)) { result.status = line.replace(/^status:\s*/i, '').trim(); section = 'none'; continue; }
    if (/^duplicat/i.test(line) || /^already\s*(exist|built|implemented)/i.test(line)) { section = 'duplicates'; continue; }

    // Parse bullet items
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      const item = bulletMatch[1].trim();
      if (!item) continue;
      switch (section) {
        case 'files_created': result.filesCreated.push(item); break;
        case 'files_modified': result.filesModified.push(item); break;
        case 'routes': result.routes.push(item); break;
        case 'database': result.database.push(item); break;
        case 'duplicates': result.duplicatesNoted.push(item); break;
      }
    }
  }

  // Also try to extract files from freeform text (common when users paste less structured output)
  if (result.filesCreated.length === 0 && result.filesModified.length === 0) {
    const fileMatches = text.match(/[a-zA-Z0-9_/.-]+\.(ts|tsx|js|jsx|py|go|rs|java|sql|vue|svelte)\b/g);
    if (fileMatches) {
      result.filesCreated = [...new Set(fileMatches)].slice(0, 30);
    }
  }

  return result;
}

/**
 * Apply a parsed validation report to a BP's requirements.
 * Matches report evidence (files, routes) to requirement keywords
 * and marks matches as verified.
 */
export async function applyReportToBP(
  capabilityId: string,
  report: ParsedReport,
  commitSha?: string,
): Promise<{
  requirementsVerified: number;
  requirementsTotal: number;
  duplicatesDetected: string[];
}> {
  const allFiles = [...report.filesCreated, ...report.filesModified];
  const allEvidence = [...allFiles, ...report.routes, ...report.database];

  if (allEvidence.length === 0) {
    return { requirementsVerified: 0, requirementsTotal: 0, duplicatesDetected: report.duplicatesNoted };
  }

  // Build keyword set from all evidence
  const evidenceKeywords = new Set<string>();
  for (const item of allEvidence) {
    for (const w of item.toLowerCase().split(/[/\\_.\-\s:]+/)) {
      if (w.length > 2) evidenceKeywords.add(w);
    }
  }

  const reqs = await RequirementsMap.findAll({
    where: { capability_id: capabilityId },
  });

  let verified = 0;

  for (const req of reqs) {
    // Skip already verified
    if ((req as any).status === 'verified' || (req as any).verified_by === 'manual') continue;

    const text = ((req as any).requirement_text || '').toLowerCase();
    const reqWords = text.split(/\W+/).filter((w: string) => w.length > 3);
    if (reqWords.length === 0) continue;

    // Score: what fraction of requirement keywords appear in evidence?
    let hits = 0;
    for (const w of reqWords) {
      if (evidenceKeywords.has(w)) hits++;
      // Partial stem match
      for (const ek of evidenceKeywords) {
        if (ek.length > 4 && w.length > 4 && (ek.includes(w.substring(0, 5)) || w.includes(ek.substring(0, 5)))) {
          hits += 0.3;
          break;
        }
      }
    }
    const score = hits / reqWords.length;

    if (score >= 0.25) {
      (req as any).status = 'verified';
      (req as any).github_file_paths = allFiles.slice(0, 5);
      (req as any).confidence_score = Math.min(1.0, score);
      (req as any).verified_by = 'validation_report';
      await req.save();
      verified++;
    }
  }

  // Save report on the capability for audit
  const cap = await Capability.findByPk(capabilityId);
  if (cap) {
    const prevExec = (cap as any).last_execution || {};
    (cap as any).last_execution = {
      ...prevExec,
      validation_report: {
        filesCreated: report.filesCreated,
        filesModified: report.filesModified,
        routes: report.routes,
        database: report.database,
        status: report.status,
        duplicatesNoted: report.duplicatesNoted,
        commitSha: commitSha || null,
        appliedAt: new Date().toISOString(),
        requirementsVerified: verified,
      },
      completed_steps: [...new Set([...(prevExec.completed_steps || []), 'validation_report_applied'])],
    };
    (cap as any).changed('last_execution', true);
    await cap.save();
  }

  return {
    requirementsVerified: verified,
    requirementsTotal: reqs.length,
    duplicatesDetected: report.duplicatesNoted,
  };
}
