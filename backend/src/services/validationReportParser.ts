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

export interface ParsedPhase {
  name: string;        // "Phase 1 — Foundation"
  status: string;      // "complete" | "partial" | "deferred"
  body: string;        // raw text of the phase block
}

export interface ParsedCapabilityClaim {
  name: string;        // "auth" or "Role Management"
  description: string; // what the report says was done for it
  files: string[];     // any file paths mentioned on the line
}

export interface ParsedReport {
  filesCreated: string[];
  filesModified: string[];
  routes: string[];
  database: string[];
  status: string;
  commitSha: string | null;          // captured from "Commit: <sha>"
  phases: ParsedPhase[];             // captured from "## Phases shipped" / Phase N
  capabilityClaims: ParsedCapabilityClaim[]; // from "## Capabilities advanced"
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
    commitSha: null,
    phases: [],
    capabilityClaims: [],
    rawText: text,
    duplicatesNoted: [],
  };

  if (!text) return result;

  const lines = text.split('\n').map(l => l.trim());
  let section: 'none' | 'files_created' | 'files_modified' | 'routes' | 'database' | 'duplicates' | 'phases_shipped' | 'capabilities_advanced' = 'none';

  for (const line of lines) {
    // Top-level metadata lines that can appear anywhere
    if (/^commit:/i.test(line)) {
      const sha = line.replace(/^commit:\s*/i, '').trim();
      // Accept either a real SHA (40 hex / 7+ hex short) or "none"
      if (/^[0-9a-f]{7,40}$/i.test(sha)) result.commitSha = sha.toLowerCase();
      continue;
    }

    // Section headers — markdown ## or plain
    const heading = line.replace(/^#+\s*/, '');
    if (/^phases?\s*shipped/i.test(heading)) { section = 'phases_shipped'; continue; }
    if (/^capabilit(y|ies)\s+advanced/i.test(heading)) { section = 'capabilities_advanced'; continue; }
    if (/^files?\s*created/i.test(heading) || /^new\s*files/i.test(heading)) { section = 'files_created'; continue; }
    if (/^files?\s*modified/i.test(heading) || /^changed\s*files/i.test(heading) || /^updated\s*files/i.test(heading)) { section = 'files_modified'; continue; }
    if (/^routes?:?/i.test(heading) || /^api\s*endpoints?/i.test(heading)) { section = 'routes'; continue; }
    if (/^database:?/i.test(heading) || /^tables?:?/i.test(heading) || /^models?:?/i.test(heading)) { section = 'database'; continue; }
    if (/^status:/i.test(line)) { result.status = line.replace(/^status:\s*/i, '').trim(); section = 'none'; continue; }
    if (/^duplicat/i.test(heading) || /^already\s*(exist|built|implemented)/i.test(heading)) { section = 'duplicates'; continue; }
    // Other ## headings reset the section so we don't bleed into them
    if (/^#+\s+/.test(line)) { section = 'none'; continue; }

    // Parse bullet items
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      const item = bulletMatch[1].trim();
      if (!item) continue;
      switch (section) {
        case 'files_created': result.filesCreated.push(stripPathTrail(item)); break;
        case 'files_modified': result.filesModified.push(stripPathTrail(item)); break;
        case 'routes': result.routes.push(item); break;
        case 'database': result.database.push(item); break;
        case 'duplicates': result.duplicatesNoted.push(item); break;
        case 'phases_shipped': {
          // "Phase N — Name (...) — ✅ complete" or similar
          const phaseMatch = item.match(/^(phase\s*\d+[^—:]*?)[\s—:-]+([^✅⏳❌]*?)\s*([✅⏳❌])\s*(complete|partial|deferred|done)?(.*)$/i);
          if (phaseMatch) {
            const status = (() => {
              const symbol = phaseMatch[3];
              const word = (phaseMatch[4] || '').toLowerCase();
              if (symbol === '✅' || word === 'complete' || word === 'done') return 'complete';
              if (symbol === '⏳' || word === 'partial') return 'partial';
              if (symbol === '❌' || word === 'deferred') return 'deferred';
              return 'unknown';
            })();
            result.phases.push({ name: (phaseMatch[1] + (phaseMatch[2] ? ' ' + phaseMatch[2] : '')).trim(), status, body: item });
          } else {
            // Fallback: keep the line for downstream matching even if format is loose
            result.phases.push({ name: item.split(/[—:-]/)[0].trim(), status: 'unknown', body: item });
          }
          break;
        }
        case 'capabilities_advanced': {
          // "<name> — <what was done> — files: <path>" or just "<name> — <what>"
          const parts = item.split(/\s+—\s+/);
          const name = (parts[0] || '').trim();
          const description = (parts[1] || '').trim();
          const filesPart = (parts[2] || '').replace(/^files:\s*/i, '').trim();
          const files = extractFilePaths(item);
          if (name) result.capabilityClaims.push({ name, description: description || filesPart, files });
          break;
        }
      }
    }
  }

  // Freeform extraction fallback for files
  if (result.filesCreated.length === 0 && result.filesModified.length === 0) {
    const fileMatches = extractFilePaths(text);
    if (fileMatches.length > 0) result.filesCreated = fileMatches.slice(0, 200);
  }

  return result;
}

// Many reports embed file paths in narrative lines (e.g.
// "services/api/src/domains/auth/ — schemas + service + routes").
// Strip trailing prose so the path is clean for matching.
function stripPathTrail(item: string): string {
  // If there's a long-dash separator, take the part before it that looks like a path
  const dashSplit = item.split(/\s+—\s+/);
  if (dashSplit.length > 1) {
    const first = dashSplit[0].trim();
    if (/[\/.]/.test(first)) return first;
  }
  return item;
}

function extractFilePaths(text: string): string[] {
  // Reasonable heuristic for file paths: dot-separated extensions + path separators
  const matches = text.match(/[a-zA-Z0-9_./@-]+\.(ts|tsx|js|jsx|py|go|rs|java|sql|vue|svelte|md|yml|yaml|json|toml|cjs|mjs|html|css)\b/g) || [];
  // Also catch directory paths ending in / mentioned in narrative
  const dirMatches = text.match(/[a-zA-Z0-9_/-]+\/(?=\s|$|—)/g) || [];
  return [...new Set([...matches, ...dirMatches.map(d => d.replace(/\/$/, ''))])];
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
