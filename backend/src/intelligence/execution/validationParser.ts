/**
 * Validation Report Parser
 * Parses structured VALIDATION REPORT output from Claude Code into actionable data.
 */

export interface ParsedValidation {
  filesCreated: string[];
  filesModified: string[];
  routes: string[];
  database: string[];
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'UNKNOWN';
  rawText: string;
}

/**
 * Parse a VALIDATION REPORT text block into structured JSON.
 * Expected format:
 * ```
 * VALIDATION REPORT
 * Files Created:
 * - path/to/file.ts
 * Routes:
 * - GET /api/...
 * Database:
 * - TableName
 * Status: COMPLETE
 * ```
 */
export function parseValidationReport(text: string): ParsedValidation {
  const result: ParsedValidation = {
    filesCreated: [],
    filesModified: [],
    routes: [],
    database: [],
    status: 'UNKNOWN',
    rawText: text,
  };

  if (!text || typeof text !== 'string') return result;

  const lines = text.split('\n').map(l => l.trim());
  let section: 'none' | 'created' | 'modified' | 'routes' | 'database' = 'none';

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Detect section headers
    if (lower.startsWith('files created')) { section = 'created'; continue; }
    if (lower.startsWith('files modified')) { section = 'modified'; continue; }
    if (lower.startsWith('routes')) { section = 'routes'; continue; }
    if (lower.startsWith('database')) { section = 'database'; continue; }
    if (lower.startsWith('status:')) {
      const val = line.split(':').slice(1).join(':').trim().toUpperCase();
      if (val.includes('COMPLETE')) result.status = 'COMPLETE';
      else if (val.includes('PARTIAL')) result.status = 'PARTIAL';
      else if (val.includes('FAIL')) result.status = 'FAILED';
      section = 'none';
      continue;
    }

    // Parse list items (- item or * item)
    const item = line.replace(/^[-*•]\s*/, '').trim();
    if (!item || item.startsWith('```') || item === 'VALIDATION REPORT') continue;

    // Stop section if we hit another header-like line
    if (item.includes(':') && !item.startsWith('/') && !item.startsWith('GET') && !item.startsWith('POST') && !item.startsWith('PUT') && !item.startsWith('DELETE')) {
      section = 'none';
    }

    if (section === 'created' && item) result.filesCreated.push(normalizePath(item));
    else if (section === 'modified' && item) result.filesModified.push(normalizePath(item));
    else if (section === 'routes' && item) result.routes.push(item);
    else if (section === 'database' && item) result.database.push(item);
  }

  // Deduplicate
  result.filesCreated = [...new Set(result.filesCreated)];
  result.filesModified = [...new Set(result.filesModified)];
  result.routes = [...new Set(result.routes)];
  result.database = [...new Set(result.database)];

  // Infer status if not explicitly stated
  if (result.status === 'UNKNOWN') {
    if (result.filesCreated.length > 0 || result.filesModified.length > 0) {
      result.status = 'PARTIAL';
    }
  }

  return result;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
