/**
 * System Model Scanner
 *
 * Repo-agnostic file classification engine. Scans a GitHub file tree
 * and classifies every file into components, layers, and types.
 * Works for ANY repository — no hardcoded project names.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentType = 'service' | 'api' | 'model' | 'ui_page' | 'ui_component' | 'agent' | 'middleware' | 'config' | 'migration' | 'test' | 'utility';
export type SystemLayer = 'frontend' | 'api' | 'service' | 'data' | 'agent' | 'infra';

export interface ClassifiedFile {
  path: string;
  name: string;
  type: ComponentType;
  layer: SystemLayer;
  stem: string;  // domain stem: "campaign", "user", "lead"
}

export interface SystemComponent {
  id: string;
  name: string;
  type: ComponentType;
  layer: SystemLayer;
  files: string[];
  file_count: number;
}

export interface SystemFlow {
  from: string;
  to: string;
  type: 'calls' | 'imports' | 'inferred';
  confidence: number;
}

export interface InfraComponent {
  id: string;
  type: 'container' | 'database' | 'proxy' | 'service';
  name: string;
  config_file: string;
  port?: number;
  image?: string;
}

export interface SystemModel {
  scanned_at: string;
  file_count: number;
  components: SystemComponent[];
  flows: SystemFlow[];
  infrastructure: InfraComponent[];
  layers: Record<SystemLayer, { count: number; components: string[] }>;
  frameworks: string[];
  primary_language: string;
  architecture_style: string;
}

// ---------------------------------------------------------------------------
// File Classification Rules (repo-agnostic)
// ---------------------------------------------------------------------------

const SKIP_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.next\//,
  /coverage\//,
  /\.cache\//,
  /__pycache__\//,
];

const SKIP_FILES = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.ts',
  '.gitignore', '.eslintrc', '.prettierrc', 'README.md', 'CLAUDE.md',
  'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs', 'tailwind.config.ts',
]);

function classifyFile(path: string): ClassifiedFile | null {
  const name = path.split('/').pop() || '';
  const lower = path.toLowerCase();
  const nameLower = name.toLowerCase();

  // Skip non-implementation files
  if (SKIP_PATTERNS.some(p => p.test(path))) return null;
  if (SKIP_FILES.has(name)) return null;
  if (!name.match(/\.(ts|tsx|js|jsx|py|go|java|rb|rs)$/)) return null;
  if (/^\d{14}/.test(name)) return null; // migration timestamps

  // Extract stem (domain name)
  const stem = extractStem(name);

  // Classification rules (first match wins)
  let type: ComponentType = 'utility';
  let layer: SystemLayer = 'service';

  // Test files
  if (lower.includes('/tests/') || lower.includes('/__tests__/') || name.match(/\.(test|spec)\./)) {
    type = 'test'; layer = 'service';
  }
  // Migrations/seeds
  else if (lower.includes('/migrations/') || lower.includes('/seeds/') || nameLower.includes('seed')) {
    type = 'migration'; layer = 'data';
  }
  // Config/infra
  else if (nameLower.includes('dockerfile') || nameLower.includes('docker-compose') || nameLower.endsWith('.config.ts') || nameLower.endsWith('.config.js')) {
    type = 'config'; layer = 'infra';
  }
  // Middleware
  else if (lower.includes('/middleware/') || lower.includes('/guards/') || lower.includes('/interceptors/')) {
    type = 'middleware'; layer = 'api';
  }
  // API Routes
  else if (lower.includes('/routes/') || lower.includes('/controllers/') || lower.includes('/api/') || nameLower.includes('route') || nameLower.includes('controller')) {
    type = 'api'; layer = 'api';
  }
  // Agents
  else if ((lower.includes('/agents/') || lower.includes('/intelligence/')) && (nameLower.includes('agent') || nameLower.includes('engine'))) {
    type = 'agent'; layer = 'agent';
  }
  // Models
  else if (lower.includes('/models/') || lower.includes('/entities/') || lower.includes('/schemas/')) {
    type = 'model'; layer = 'data';
  }
  // Services
  else if (lower.includes('/services/') || lower.includes('/handlers/') || lower.includes('/usecases/') || nameLower.includes('service')) {
    type = 'service'; layer = 'service';
  }
  // Frontend pages
  else if ((lower.includes('/pages/') || lower.includes('/app/')) && (nameLower.endsWith('.tsx') || nameLower.endsWith('.jsx'))) {
    type = 'ui_page'; layer = 'frontend';
  }
  // Frontend components
  else if ((lower.includes('/components/') || lower.includes('/views/')) && (nameLower.endsWith('.tsx') || nameLower.endsWith('.jsx'))) {
    type = 'ui_component'; layer = 'frontend';
  }
  // Frontend catch-all
  else if (lower.includes('frontend/') && (nameLower.endsWith('.tsx') || nameLower.endsWith('.jsx') || nameLower.endsWith('.css'))) {
    type = 'ui_component'; layer = 'frontend';
  }

  return { path, name, type, layer, stem };
}

function extractStem(filename: string): string {
  return filename
    .replace(/\.(ts|tsx|js|jsx|py|go|java|rb|rs)$/, '')
    .replace(/(Service|Routes?|Controller|Agent|Engine|Model|Page|Component|Middleware|Handler)$/i, '')
    .replace(/([A-Z])/g, ' $1').trim().split(/\s+/)[0].toLowerCase() || 'misc';
}

// ---------------------------------------------------------------------------
// Framework Detection
// ---------------------------------------------------------------------------

function detectFrameworks(fileTree: string[]): { frameworks: string[]; language: string; style: string } {
  const frameworks: string[] = [];
  const hasFile = (pattern: string) => fileTree.some(f => f.toLowerCase().includes(pattern));

  // Frontend
  if (hasFile('next.config')) frameworks.push('Next.js');
  else if (hasFile('react-scripts') || hasFile('src/app.tsx') || hasFile('src/index.tsx')) frameworks.push('React');
  if (hasFile('angular.json')) frameworks.push('Angular');
  if (hasFile('vue.config') || hasFile('nuxt.config')) frameworks.push('Vue');

  // Backend
  if (hasFile('express') || fileTree.some(f => f.includes('routes/') && f.endsWith('.ts'))) frameworks.push('Express');
  if (hasFile('fastapi') || hasFile('main.py')) frameworks.push('FastAPI');
  if (hasFile('django') || hasFile('manage.py')) frameworks.push('Django');
  if (hasFile('go.mod')) frameworks.push('Go');

  // Infra
  if (hasFile('docker-compose')) frameworks.push('Docker');
  if (hasFile('.github/workflows')) frameworks.push('GitHub Actions');
  if (hasFile('vercel.json') || hasFile('.vercel')) frameworks.push('Vercel');

  // Language detection
  const tsFiles = fileTree.filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).length;
  const pyFiles = fileTree.filter(f => f.endsWith('.py')).length;
  const goFiles = fileTree.filter(f => f.endsWith('.go')).length;
  const language = tsFiles > pyFiles && tsFiles > goFiles ? 'TypeScript' : pyFiles > goFiles ? 'Python' : goFiles > 0 ? 'Go' : 'JavaScript';

  // Architecture style
  const hasFrontend = frameworks.some(f => ['React', 'Next.js', 'Angular', 'Vue'].includes(f));
  const hasBackend = frameworks.some(f => ['Express', 'FastAPI', 'Django', 'Go'].includes(f));
  const hasDocker = frameworks.includes('Docker');
  const style = hasDocker && hasBackend ? (hasFrontend ? 'fullstack' : 'microservice') : hasFrontend && hasBackend ? 'spa+api' : hasFrontend ? 'spa' : 'backend';

  return { frameworks, language, style };
}

// ---------------------------------------------------------------------------
// Infrastructure Detection
// ---------------------------------------------------------------------------

function detectInfrastructure(fileTree: string[]): InfraComponent[] {
  const infra: InfraComponent[] = [];

  // Docker compose services
  const composeFiles = fileTree.filter(f => f.toLowerCase().includes('docker-compose'));
  for (const file of composeFiles) {
    infra.push({ id: `infra:docker:${file}`, type: 'container', name: 'Docker Compose', config_file: file });
  }

  // Dockerfiles
  const dockerfiles = fileTree.filter(f => f.toLowerCase().includes('dockerfile'));
  for (const file of dockerfiles) {
    const dir = file.split('/').slice(0, -1).join('/') || 'root';
    infra.push({ id: `infra:container:${dir}`, type: 'container', name: `Container (${dir})`, config_file: file });
  }

  // Database detection from common files
  if (fileTree.some(f => f.includes('models/') && f.endsWith('.ts'))) {
    infra.push({ id: 'infra:db:postgres', type: 'database', name: 'PostgreSQL', config_file: '.env' });
  }

  return infra;
}

// ---------------------------------------------------------------------------
// Main: Build System Model
// ---------------------------------------------------------------------------

export function buildSystemModel(fileTree: string[]): SystemModel {
  // 1. Classify all files
  const classified = fileTree.map(classifyFile).filter(Boolean) as ClassifiedFile[];

  // 2. Group into components by (layer, stem)
  const componentMap = new Map<string, SystemComponent>();
  for (const file of classified) {
    if (file.type === 'test' || file.type === 'migration' || file.type === 'config') continue;
    const key = `${file.layer}:${file.stem}`;
    if (!componentMap.has(key)) {
      componentMap.set(key, {
        id: key,
        name: `${file.stem.charAt(0).toUpperCase() + file.stem.slice(1)} ${file.layer === 'frontend' ? (file.type === 'ui_page' ? 'Page' : 'Component') : file.layer.charAt(0).toUpperCase() + file.layer.slice(1)}`,
        type: file.type,
        layer: file.layer,
        files: [],
        file_count: 0,
      });
    }
    const comp = componentMap.get(key)!;
    comp.files.push(file.path);
    comp.file_count = comp.files.length;
  }

  // 3. Infer flows from naming conventions
  const components = Array.from(componentMap.values());
  const flows: SystemFlow[] = [];
  const stemGroups = new Map<string, SystemComponent[]>();
  for (const comp of components) {
    const stem = comp.id.split(':')[1];
    if (!stemGroups.has(stem)) stemGroups.set(stem, []);
    stemGroups.get(stem)!.push(comp);
  }

  for (const [_stem, group] of stemGroups) {
    // Within same stem: frontend → api → service → data
    const layerOrder: SystemLayer[] = ['frontend', 'api', 'service', 'data', 'agent'];
    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const aIdx = layerOrder.indexOf(a.layer);
        const bIdx = layerOrder.indexOf(b.layer);
        if (aIdx >= 0 && bIdx >= 0 && aIdx < bIdx) {
          flows.push({ from: a.id, to: b.id, type: 'inferred', confidence: 0.8 });
        }
      }
    }
  }

  // 4. Build layer summary
  const layers: Record<SystemLayer, { count: number; components: string[] }> = {
    frontend: { count: 0, components: [] },
    api: { count: 0, components: [] },
    service: { count: 0, components: [] },
    data: { count: 0, components: [] },
    agent: { count: 0, components: [] },
    infra: { count: 0, components: [] },
  };
  for (const comp of components) {
    layers[comp.layer].count += comp.file_count;
    layers[comp.layer].components.push(comp.id);
  }

  // 5. Detect frameworks and infra
  const { frameworks, language, style } = detectFrameworks(fileTree);
  const infrastructure = detectInfrastructure(fileTree);

  return {
    scanned_at: new Date().toISOString(),
    file_count: fileTree.length,
    components,
    flows,
    infrastructure,
    layers,
    frameworks,
    primary_language: language,
    architecture_style: style,
  };
}
