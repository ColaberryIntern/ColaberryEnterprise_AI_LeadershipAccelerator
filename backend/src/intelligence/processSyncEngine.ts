/**
 * Process Sync Engine
 * Parses Claude Code validation reports and updates requirement states.
 *
 * Requirement States:
 * - unmatched: No code mapping found (UNMAPPED)
 * - partial: Keyword-matched but not verified (PLANNED)
 * - matched: Code exists via auto-match (BUILT - unverified)
 * - verified: Confirmed via validation report or manual review (VERIFIED)
 */
import { RequirementsMap } from '../models';
import { Op } from 'sequelize';

export interface ValidationReport {
  files_created: string[];
  routes_created: string[];
  database_tables: string[];
  status: 'complete' | 'partial';
  notes?: string;
}

export interface SyncResult {
  requirements_updated: number;
  newly_verified: number;
  newly_built: number;
  total_files: number;
  summary: string;
}

/**
 * Parse a validation report (text format from Claude Code output)
 */
export function parseValidationReport(rawText: string): ValidationReport {
  const report: ValidationReport = {
    files_created: [],
    routes_created: [],
    database_tables: [],
    status: 'partial',
  };

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  let section = '';

  for (const line of lines) {
    if (line.toLowerCase().includes('files created') || line.toLowerCase().includes('files:')) {
      section = 'files'; continue;
    }
    if (line.toLowerCase().includes('routes') || line.toLowerCase().includes('api:') || line.toLowerCase().includes('endpoints:')) {
      section = 'routes'; continue;
    }
    if (line.toLowerCase().includes('database') || line.toLowerCase().includes('tables') || line.toLowerCase().includes('models:')) {
      section = 'database'; continue;
    }
    if (line.toLowerCase().includes('status:')) {
      if (line.toLowerCase().includes('complete')) report.status = 'complete';
      continue;
    }

    // Extract file paths from bullet points or plain lines
    const cleaned = line.replace(/^[-*•]\s*/, '').replace(/`/g, '').trim();
    if (!cleaned || cleaned.length < 3) continue;

    if (section === 'files' && (cleaned.includes('/') || cleaned.includes('.'))) {
      report.files_created.push(cleaned);
    } else if (section === 'routes' && (cleaned.includes('/') || cleaned.includes('GET') || cleaned.includes('POST'))) {
      report.routes_created.push(cleaned);
    } else if (section === 'database') {
      report.database_tables.push(cleaned);
    }
  }

  return report;
}

/**
 * Sync a process's requirements based on a validation report
 */
export async function syncProcessFromReport(
  projectId: string,
  capabilityId: string,
  report: ValidationReport
): Promise<SyncResult> {
  // Get all requirements for this capability
  const requirements = await RequirementsMap.findAll({
    where: { project_id: projectId, capability_id: capabilityId },
  });

  let updated = 0;
  let newlyVerified = 0;
  let newlyBuilt = 0;

  const allNewFiles = [...report.files_created, ...report.routes_created];

  for (const req of requirements) {
    const currentStatus = req.status;
    const currentFiles = req.github_file_paths || [];

    // Check if any new files match this requirement (keyword match)
    const reqWords = (req.requirement_text || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchingFiles = allNewFiles.filter(f => {
      const fLower = f.toLowerCase();
      return reqWords.some(w => fLower.includes(w));
    });

    if (matchingFiles.length > 0 || report.status === 'complete') {
      // Update file paths
      const mergedFiles = [...new Set([...currentFiles, ...matchingFiles])];

      if (report.status === 'complete') {
        // Full completion — mark as verified
        if (currentStatus !== 'verified') {
          req.status = 'verified';
          req.verified_by = 'sync';
          req.confidence_score = 1.0;
          newlyVerified++;
        }
      } else if (matchingFiles.length > 0 && currentStatus !== 'verified') {
        // Partial — mark as matched (built)
        req.status = 'matched';
        req.verified_by = 'sync';
        req.confidence_score = 0.8;
        newlyBuilt++;
      }

      req.github_file_paths = mergedFiles;
      await req.save();
      updated++;
    }
  }

  return {
    requirements_updated: updated,
    newly_verified: newlyVerified,
    newly_built: newlyBuilt,
    total_files: allNewFiles.length,
    summary: `Updated ${updated} requirements: ${newlyVerified} verified, ${newlyBuilt} built. ${allNewFiles.length} files processed.`,
  };
}
