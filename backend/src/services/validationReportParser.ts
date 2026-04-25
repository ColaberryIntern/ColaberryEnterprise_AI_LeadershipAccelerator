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
 *
 * When a user submits a validation report, that IS the verification.
 * The report is evidence from the AI that actually built the code.
 * If the report has files/routes/status, mark ALL requirements for
 * this BP as verified — don't try to keyword-match individual
 * requirements (many are process-level and can never match files).
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
  const hasEvidence = allEvidence.length > 0 || report.rawText.length > 50;

  const reqs = await RequirementsMap.findAll({
    where: { capability_id: capabilityId },
  });

  let verified = 0;

  // Classify files by layer for intelligent linking
  const backendFiles: string[] = [];
  const frontendFiles: string[] = [];
  const agentFiles: string[] = [];
  const modelFiles: string[] = [];

  for (const f of allFiles) {
    const lower = f.toLowerCase();
    const name = (f.split('/').pop() || '').toLowerCase();
    if (name.includes('agent') || lower.includes('/agents/') || lower.includes('/intelligence/')) {
      agentFiles.push(f);
    } else if (name.endsWith('.tsx') || name.endsWith('.jsx') || lower.includes('/component') || lower.includes('/page') || lower.includes('/frontend/')) {
      frontendFiles.push(f);
    } else if (lower.includes('/model') || lower.includes('/schema') || lower.includes('/entity') || lower.includes('/migration')) {
      modelFiles.push(f);
    } else if (lower.includes('/service') || lower.includes('/route') || lower.includes('/controller') || lower.includes('/handler') || lower.includes('/api/') || lower.includes('/backend/')) {
      backendFiles.push(f);
    } else {
      // Default: if it's a .ts/.js file, assume backend
      if (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.py')) backendFiles.push(f);
    }
  }

  if (hasEvidence) {
    // Mark requirements as verified with per-category file assignment
    for (const req of reqs) {
      if ((req as any).verified_by === 'manual') continue;
      (req as any).status = 'verified';
      // Assign files by requirement category when possible
      const reqText = ((req as any).requirement_text || (req as any).requirement_key || '').toLowerCase();
      const isUIReq = /\b(ui|page|component|display|layout|form|button|screen|view)\b/.test(reqText);
      const isAgentReq = /\b(agent|automat|monitor|schedule|autonomous|intelligence)\b/.test(reqText);
      const isDataReq = /\b(model|database|table|schema|migration|persist|store)\b/.test(reqText);
      const relevantFiles = isUIReq && frontendFiles.length > 0 ? frontendFiles
        : isAgentReq && agentFiles.length > 0 ? agentFiles
        : isDataReq && modelFiles.length > 0 ? modelFiles
        : backendFiles.length > 0 ? backendFiles : allFiles;
      (req as any).github_file_paths = relevantFiles.slice(0, 5);
      (req as any).confidence_score = 1.0;
      (req as any).verified_by = 'validation_report';
      await req.save();
      verified++;
    }
  }

  // Save report on the capability for audit + store classified file links
  const cap = await Capability.findByPk(capabilityId);
  if (cap) {
    const prevExec = (cap as any).last_execution || {};

    // Merge new files with any existing linked files (accumulative across builds)
    const prevBackend = (cap as any).linked_backend_services || [];
    const prevFrontend = (cap as any).linked_frontend_components || [];
    const prevAgents = (cap as any).linked_agents || [];
    (cap as any).linked_backend_services = [...new Set([...prevBackend, ...backendFiles, ...modelFiles])];
    (cap as any).linked_frontend_components = [...new Set([...prevFrontend, ...frontendFiles])];
    (cap as any).linked_agents = [...new Set([...prevAgents, ...agentFiles])];

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
        classified: { backend: backendFiles, frontend: frontendFiles, agents: agentFiles, models: modelFiles },
      },
      completed_steps: [...new Set([...(prevExec.completed_steps || []), 'validation_report_applied'])],
    };
    (cap as any).changed('last_execution', true);
    (cap as any).changed('linked_backend_services', true);
    (cap as any).changed('linked_frontend_components', true);
    (cap as any).changed('linked_agents', true);
    await cap.save();
  }

  return {
    requirementsVerified: verified,
    requirementsTotal: reqs.length,
    duplicatesDetected: report.duplicatesNoted,
  };
}
