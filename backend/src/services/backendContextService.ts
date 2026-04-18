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
}

export interface DataModel {
  name: string;
  table_name: string;
  fields: string[];
  source_file: string;
}

export interface AgentInfo {
  name: string;
  capabilities: string[];
  source_file: string;
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

  // Express: router.get('/path', ...) or app.post('/path', ...)
  const expressRe = /(?:router|app|r)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi;
  let m;
  while ((m = expressRe.exec(content)) !== null) {
    const key = `${m[1].toUpperCase()} ${m[2]}`;
    if (!seen.has(key)) { seen.add(key); routes.push({ method: m[1].toUpperCase(), path: m[2], source_file: filePath }); }
  }

  // FastAPI / Flask: @app.get("/path") or @router.post("/path")
  const pyRe = /@(?:app|router)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/gi;
  while ((m = pyRe.exec(content)) !== null) {
    const key = `${m[1].toUpperCase()} ${m[2]}`;
    if (!seen.has(key)) { seen.add(key); routes.push({ method: m[1].toUpperCase(), path: m[2], source_file: filePath }); }
  }

  // Go: http.HandleFunc("/path", handler) or r.GET("/path", ...)
  const goRe = /(?:HandleFunc|Handle|GET|POST|PUT|DELETE|PATCH)\(\s*['"]([^'"]+)['"]/gi;
  while ((m = goRe.exec(content)) !== null) {
    const method = m[0].match(/GET|POST|PUT|DELETE|PATCH/i)?.[0]?.toUpperCase() || 'GET';
    const key = `${method} ${m[1]}`;
    if (!seen.has(key)) { seen.add(key); routes.push({ method, path: m[1], source_file: filePath }); }
  }

  return routes;
}

// ---------------------------------------------------------------------------
// Model extraction (multi-ORM regex)
// ---------------------------------------------------------------------------

function extractModels(content: string, filePath: string): DataModel[] {
  const models: DataModel[] = [];
  const fileName = filePath.split('/').pop()?.replace(/\.(ts|js|py|go)$/, '') || '';

  // Sequelize: tableName + DataTypes fields
  const tableMatch = content.match(/tableName:\s*['"]([^'"]+)['"]/);
  if (tableMatch) {
    const fields: string[] = [];
    const fieldRe = /(\w+):\s*\{?\s*type:\s*DataTypes\.\w+/g;
    let m;
    while ((m = fieldRe.exec(content)) !== null) fields.push(m[1]);
    // Also catch simple field definitions: fieldName: DataTypes.STRING
    const simpleRe = /(\w+):\s*DataTypes\.\w+/g;
    while ((m = simpleRe.exec(content)) !== null) {
      if (!fields.includes(m[1])) fields.push(m[1]);
    }
    models.push({ name: fileName, table_name: tableMatch[1], fields: fields.slice(0, 20), source_file: filePath });
    return models;
  }

  // Prisma: model Name { field Type }
  const prismaRe = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let pm;
  while ((pm = prismaRe.exec(content)) !== null) {
    const fields = pm[2].split('\n').map(l => l.trim().split(/\s+/)[0]).filter(f => f && !f.startsWith('//') && !f.startsWith('@'));
    models.push({ name: pm[1], table_name: pm[1].toLowerCase() + 's', fields: fields.slice(0, 20), source_file: filePath });
  }

  // Django: class Name(models.Model)
  const djangoRe = /class\s+(\w+)\((?:models\.Model|Base)\)/g;
  let dm;
  while ((dm = djangoRe.exec(content)) !== null) {
    const fields: string[] = [];
    const fieldRe = /(\w+)\s*=\s*(?:models\.|Column\()/g;
    let fm;
    while ((fm = fieldRe.exec(content)) !== null) fields.push(fm[1]);
    models.push({ name: dm[1], table_name: dm[1].toLowerCase() + 's', fields: fields.slice(0, 20), source_file: filePath });
  }

  // SQLAlchemy: __tablename__
  const saMatch = content.match(/__tablename__\s*=\s*['"]([^'"]+)['"]/);
  if (saMatch) {
    const fields: string[] = [];
    const colRe = /(\w+)\s*=\s*(?:db\.)?Column\(/g;
    let cm;
    while ((cm = colRe.exec(content)) !== null) fields.push(cm[1]);
    models.push({ name: fileName, table_name: saMatch[1], fields: fields.slice(0, 20), source_file: filePath });
  }

  // Fallback: if file is in models/ dir and has class/interface with fields
  if (models.length === 0 && filePath.includes('model')) {
    const classMatch = content.match(/(?:class|interface)\s+(\w+)/);
    if (classMatch) {
      const fields: string[] = [];
      const declRe = /(?:declare\s+)?(\w+)(?:\?)?:\s*(?:string|number|boolean|Date|any|Record|Array)/g;
      let dm2;
      while ((dm2 = declRe.exec(content)) !== null) fields.push(dm2[1]);
      if (fields.length > 0) {
        models.push({ name: classMatch[1], table_name: classMatch[1].toLowerCase().replace(/model$/, '') + 's', fields: fields.slice(0, 20), source_file: filePath });
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

  // Class-based agents
  const classRe = /(?:class|function)\s+(\w*Agent\w*)/g;
  let m;
  while ((m = classRe.exec(content)) !== null) {
    const caps: string[] = [];
    // Extract method names as capabilities
    const methodRe = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/g;
    let mm;
    while ((mm = methodRe.exec(content)) !== null) {
      if (!['constructor', 'toString', 'valueOf'].includes(mm[1])) caps.push(mm[1]);
    }
    agents.push({ name: m[1], capabilities: caps.slice(0, 10), source_file: filePath });
  }

  // Exported functions in agent files
  if (agents.length === 0 && /agent/i.test(filePath)) {
    const exportRe = /export\s+(?:async\s+)?function\s+(\w+)/g;
    const caps: string[] = [];
    while ((m = exportRe.exec(content)) !== null) caps.push(m[1]);
    if (caps.length > 0) {
      agents.push({ name: fileName, capabilities: caps.slice(0, 10), source_file: filePath });
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
