/**
 * Backend Context Service — Full-Stack Visibility
 *
 * Reads a BP's backend implementation files from GitHub and extracts
 * structured metadata: API routes, database models, agent capabilities.
 * Results are cached on the Capability model (backend_context JSONB)
 * with a 1hr TTL.
 *
 * Used by:
 *   - Section 3.2 "Backend Stack" in the portal BP detail view
 *   - UI Feedback LLM prompts (so suggestions leverage backend capabilities)
 */

import { readFileFromRepo } from './githubService';

export interface ApiRoute {
  method: string;
  path: string;
  source_file: string;
  middleware?: string[];    // e.g. ['requireAdmin', 'validateBody']
  description?: string;    // from inline comments
}

export interface ModelField {
  name: string;
  type: string;            // e.g. 'UUID', 'STRING(255)', 'JSONB', 'BOOLEAN'
  nullable?: boolean;
  default_value?: string;
  primary_key?: boolean;
  references?: string;     // FK reference
}

export interface DataModel {
  name: string;
  table_name: string;
  fields: ModelField[];
  source_file: string;
  description?: string;
  associations?: string[]; // e.g. ['hasMany(Feature)', 'belongsTo(Project)']
}

export interface AgentInfo {
  name: string;
  capabilities: string[];
  source_file: string;
  description?: string;    // from class/file comments
  methods?: Array<{ name: string; params: string; description?: string }>;
}

export interface BackendContext {
  api_routes: ApiRoute[];
  models: DataModel[];
  agents: AgentInfo[];
  possibilities: string[];
  extracted_at: string;
}

const MAX_BACKEND_FILES = 10;
const MAX_MODEL_FILES = 10;
const MAX_AGENT_FILES = 5;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Route extraction (multi-framework regex)
// ---------------------------------------------------------------------------

function extractRoutes(content: string, filePath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Express: router.get('/path', middleware1, middleware2, async (req, res) => {
    const expressMatch = line.match(/(?:router|app|r)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*([^{]+))?\s*/i);
    if (expressMatch) {
      const method = expressMatch[1].toUpperCase();
      const path = expressMatch[2];
      const key = `${method} ${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Extract middleware from the handler chain
      const middlewareStr = expressMatch[3] || '';
      const middleware = middlewareStr.split(',').map(s => s.trim()).filter(s => s && !s.startsWith('async') && !s.startsWith('(') && !s.startsWith('function'));
      // Look for comment above the route (description)
      let description = '';
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = lines[j].trim();
        if (prev.startsWith('//') || prev.startsWith('*') || prev.startsWith('/**')) {
          description = prev.replace(/^\/\*\*?\s*|\*\/\s*$|^\*\s*|^\/\/\s*/g, '').trim();
          if (description) break;
        } else if (prev && !prev.startsWith('*')) break;
      }
      routes.push({ method, path, source_file: filePath, middleware: middleware.length > 0 ? middleware : undefined, description: description || undefined });
      continue;
    }

    // FastAPI / Flask
    const pyMatch = line.match(/@(?:app|router)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i);
    if (pyMatch) {
      const key = `${pyMatch[1].toUpperCase()} ${pyMatch[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        let desc = '';
        if (i + 2 < lines.length) {
          const docLine = lines[i + 2]?.trim();
          if (docLine?.startsWith('"""') || docLine?.startsWith("'''")) desc = docLine.replace(/['"]{3}/g, '').trim();
        }
        routes.push({ method: pyMatch[1].toUpperCase(), path: pyMatch[2], source_file: filePath, description: desc || undefined });
      }
    }
  }

  return routes;
}

// ---------------------------------------------------------------------------
// Model extraction (multi-ORM regex)
// ---------------------------------------------------------------------------

function extractModels(content: string, filePath: string): DataModel[] {
  const models: DataModel[] = [];
  const fileName = filePath.split('/').pop()?.replace(/\.(ts|js|py|go)$/, '') || '';

  // Extract file-level description from first comment block
  const descMatch = content.match(/^\/\*\*\s*\n\s*\*\s*(.+?)(?:\n|\*\/)/);
  const fileDesc = descMatch ? descMatch[1].trim() : undefined;

  // Extract associations (Sequelize)
  const associations: string[] = [];
  const assocRe = /(?:hasMany|hasOne|belongsTo|belongsToMany)\((\w+)/g;
  let am;
  while ((am = assocRe.exec(content)) !== null) associations.push(am[0]);

  // Sequelize: tableName + DataTypes fields with full detail
  const tableMatch = content.match(/tableName:\s*['"]([^'"]+)['"]/);
  if (tableMatch) {
    const fields: ModelField[] = [];
    // Match field definitions: fieldName: { type: DataTypes.TYPE, allowNull: ..., defaultValue: ... }
    const fieldBlockRe = /(\w+):\s*\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = fieldBlockRe.exec(content)) !== null) {
      const fieldName = m[1];
      const block = m[2];
      const typeMatch = block.match(/type:\s*DataTypes\.(\w+(?:\([^)]*\))?)/);
      if (!typeMatch) continue;
      const field: ModelField = { name: fieldName, type: typeMatch[1] };
      if (/allowNull:\s*true/i.test(block)) field.nullable = true;
      if (/allowNull:\s*false/i.test(block)) field.nullable = false;
      if (/primaryKey:\s*true/i.test(block)) field.primary_key = true;
      const defMatch = block.match(/defaultValue:\s*(?:DataTypes\.)?(\w+(?:\([^)]*\))?|'[^']*'|"[^"]*"|\d+|true|false|null)/);
      if (defMatch) field.default_value = defMatch[1];
      const refMatch = block.match(/references:\s*\{[^}]*model:\s*['"](\w+)['"]/);
      if (refMatch) field.references = refMatch[1];
      fields.push(field);
    }
    // Also catch simple: fieldName: DataTypes.TYPE
    const simpleRe = /(\w+):\s*DataTypes\.(\w+(?:\([^)]*\))?)\s*[,\n]/g;
    while ((m = simpleRe.exec(content)) !== null) {
      if (!fields.find(f => f.name === m[1])) {
        fields.push({ name: m[1], type: m[2] });
      }
    }
    models.push({ name: fileName, table_name: tableMatch[1], fields: fields.slice(0, 30), source_file: filePath, description: fileDesc, associations: associations.length > 0 ? associations : undefined });
    return models;
  }

  // Prisma: model Name { field Type @attributes }
  const prismaRe = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let pm;
  while ((pm = prismaRe.exec(content)) !== null) {
    const fields: ModelField[] = pm[2].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('@')).map(l => {
      const parts = l.split(/\s+/);
      const field: ModelField = { name: parts[0], type: parts[1] || 'unknown' };
      if (l.includes('@id')) field.primary_key = true;
      if (l.includes('?')) field.nullable = true;
      if (l.includes('@default')) { const dm = l.match(/@default\(([^)]+)\)/); if (dm) field.default_value = dm[1]; }
      if (l.includes('@relation')) { const rm = l.match(/@relation.*references:\s*\[(\w+)\]/); if (rm) field.references = rm[1]; }
      return field;
    });
    models.push({ name: pm[1], table_name: pm[1].toLowerCase() + 's', fields: fields.slice(0, 30), source_file: filePath, description: fileDesc });
  }

  // Fallback: TypeScript interface/class with typed fields
  if (models.length === 0) {
    const classMatch = content.match(/(?:class|interface)\s+(\w+)/);
    if (classMatch) {
      const fields: ModelField[] = [];
      const declRe = /(?:declare\s+)?(\w+)(\?)?\s*:\s*(string|number|boolean|Date|any|Record<[^>]+>|Array<[^>]+>|\w+(?:\[\])?)/g;
      let dm2;
      while ((dm2 = declRe.exec(content)) !== null) {
        fields.push({ name: dm2[1], type: dm2[3], nullable: dm2[2] === '?' });
      }
      if (fields.length > 0) {
        models.push({ name: classMatch[1], table_name: classMatch[1].toLowerCase().replace(/model$/, '') + 's', fields: fields.slice(0, 30), source_file: filePath, description: fileDesc });
      }
    }
  }

  return models;
}

// ---------------------------------------------------------------------------
// Agent extraction
// ---------------------------------------------------------------------------

function extractAgents(content: string, filePath: string): AgentInfo[] {
  const agents: AgentInfo[] = [];
  const fileName = filePath.split('/').pop()?.replace(/\.(ts|js|py)$/, '') || '';

  // Extract file-level description from first comment block
  let fileDesc = '';
  const descMatch = content.match(/^\/\*\*\s*\n\s*\*\s*(.+?)(?:\n|\*\/)/);
  if (descMatch) fileDesc = descMatch[1].trim();
  // Also try single-line comment at top
  if (!fileDesc) {
    const lineDesc = content.match(/^\/\/\s*(.+)/);
    if (lineDesc) fileDesc = lineDesc[1].trim();
  }

  const lines = content.split('\n');

  // Class-based agents
  const classRe = /(?:class|function)\s+(\w*Agent\w*)/g;
  let m;
  while ((m = classRe.exec(content)) !== null) {
    const methods: Array<{ name: string; params: string; description?: string }> = [];
    // Extract method definitions with parameters
    for (let i = 0; i < lines.length; i++) {
      const methodMatch = lines[i].match(/(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/);
      if (methodMatch && !['constructor', 'toString', 'valueOf', 'if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
        let methodDesc = '';
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prev = lines[j].trim();
          if (prev.startsWith('//') || prev.startsWith('*')) {
            methodDesc = prev.replace(/^\/\*\*?\s*|\*\/\s*$|^\*\s*|^\/\/\s*/g, '').trim();
            if (methodDesc) break;
          } else if (prev && !prev.startsWith('*')) break;
        }
        methods.push({ name: methodMatch[1], params: methodMatch[2].trim().substring(0, 80), description: methodDesc || undefined });
      }
    }
    agents.push({
      name: m[1],
      capabilities: methods.map(m2 => m2.name).slice(0, 10),
      source_file: filePath,
      description: fileDesc || undefined,
      methods: methods.slice(0, 10),
    });
  }

  // Exported functions in agent files
  if (agents.length === 0 && /agent/i.test(filePath)) {
    const methods: Array<{ name: string; params: string; description?: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const exportMatch = lines[i].match(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (exportMatch) {
        let methodDesc = '';
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prev = lines[j].trim();
          if (prev.startsWith('//') || prev.startsWith('*')) {
            methodDesc = prev.replace(/^\/\*\*?\s*|\*\/\s*$|^\*\s*|^\/\/\s*/g, '').trim();
            if (methodDesc) break;
          } else if (prev) break;
        }
        methods.push({ name: exportMatch[1], params: exportMatch[2].trim().substring(0, 80), description: methodDesc || undefined });
      }
    }
    if (methods.length > 0) {
      agents.push({
        name: fileName,
        capabilities: methods.map(m2 => m2.name),
        source_file: filePath,
        description: fileDesc || undefined,
        methods: methods.slice(0, 10),
      });
    }
  }

  return agents;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

export async function extractBackendContext(
  enrollmentId: string,
  implementationLinks: { backend?: string[]; models?: string[]; agents?: string[]; frontend?: string[] },
): Promise<BackendContext> {
  const ctx: BackendContext = { api_routes: [], models: [], agents: [], possibilities: [], extracted_at: new Date().toISOString() };

  const readFile = async (path: string): Promise<string | null> => {
    try { return await readFileFromRepo(enrollmentId, path); } catch { return null; }
  };

  // Extract routes from backend files
  const backendFiles = (implementationLinks.backend || []).slice(0, MAX_BACKEND_FILES);
  for (const f of backendFiles) {
    const content = await readFile(f);
    if (content) ctx.api_routes.push(...extractRoutes(content, f));
  }

  // Extract models
  const modelFiles = (implementationLinks.models || []).slice(0, MAX_MODEL_FILES);
  for (const f of modelFiles) {
    const content = await readFile(f);
    if (content) ctx.models.push(...extractModels(content, f));
  }

  // Extract agents
  const agentFiles = (implementationLinks.agents || []).slice(0, MAX_AGENT_FILES);
  for (const f of agentFiles) {
    const content = await readFile(f);
    if (content) ctx.agents.push(...extractAgents(content, f));
  }

  // Generate "what's possible" suggestions
  ctx.possibilities = suggestPossibilities(ctx);

  return ctx;
}

function suggestPossibilities(ctx: BackendContext): string[] {
  const suggestions: string[] = [];

  const writeEndpoints = ctx.api_routes.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
  if (writeEndpoints.length > 0) {
    suggestions.push(`${writeEndpoints.length} write endpoint${writeEndpoints.length > 1 ? 's' : ''} available — consider adding create/edit forms or action buttons`);
  }

  if (ctx.agents.length > 0) {
    suggestions.push(`${ctx.agents.length} agent${ctx.agents.length > 1 ? 's' : ''} available (${ctx.agents.map(a => a.name).join(', ')}) — could add automated workflows or AI-powered features`);
  }

  for (const model of ctx.models) {
    if (model.fields.length > 5) {
      suggestions.push(`${model.name} has ${model.fields.length} fields — consider a detail view or expanded data table`);
    }
  }

  const getEndpoints = ctx.api_routes.filter(r => r.method === 'GET');
  if (getEndpoints.length > ctx.models.length * 2) {
    suggestions.push(`${getEndpoints.length} GET endpoints suggest rich data — consider dashboards, charts, or filter views`);
  }

  return suggestions.slice(0, 5);
}

/**
 * Check if cached context is still fresh.
 */
export function isCacheFresh(cachedContext: BackendContext | null): boolean {
  if (!cachedContext?.extracted_at) return false;
  const age = Date.now() - new Date(cachedContext.extracted_at).getTime();
  return age < CACHE_TTL_MS;
}

/**
 * Format backend context as a text block for LLM prompt injection.
 */
export function formatForPrompt(ctx: BackendContext): string {
  if (ctx.api_routes.length === 0 && ctx.models.length === 0 && ctx.agents.length === 0) return '';

  const parts: string[] = ['Backend capabilities available for this page:'];

  if (ctx.api_routes.length > 0) {
    parts.push('API Endpoints: ' + ctx.api_routes.slice(0, 15).map(r => `${r.method} ${r.path}`).join(', '));
  }

  if (ctx.models.length > 0) {
    parts.push('Data Models: ' + ctx.models.slice(0, 8).map(m => `${m.name}(${m.fields.slice(0, 8).join(', ')})`).join('; '));
  }

  if (ctx.agents.length > 0) {
    parts.push('Agents: ' + ctx.agents.map(a => a.name).join(', '));
  }

  parts.push('');
  parts.push('When suggesting UI improvements, leverage these backend capabilities.');
  parts.push('If the backend supports data or actions not yet exposed in the UI, suggest adding them.');

  return parts.join('\n');
}
