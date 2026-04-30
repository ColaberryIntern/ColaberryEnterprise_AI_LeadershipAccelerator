/**
 * Frontend Route Detection
 *
 * Scans the connected repo's router configuration to find what URL
 * route a given page/component file is mapped to. Used by the
 * validation report flow: when a per-BP build commits a new frontend
 * page, we try to derive its route automatically so the UI tab + iframe
 * preview unlock without the user having to open Define Component.
 *
 * Strategy:
 *   1. Find candidate router files (App.tsx, routes.tsx, router.tsx,
 *      *Routes.tsx, etc.) from the cached file tree.
 *   2. Read each candidate from GitHub.
 *   3. Look for the page file's basename being imported AND used as a
 *      <Route ... element={...} /> JSX entry. Extract the path.
 *   4. Return the highest-confidence match.
 *
 * Heuristic, not perfect — but catches React Router v6 patterns
 * which is what Accelerator-style projects use.
 */
import { getConnection, getFileTree, readFileFromRepo } from './githubService';

export interface RouteCandidate {
  route: string;        // e.g. "/milestones"
  confidence: number;   // 0..1
  source: string;       // "App.tsx", "routes.tsx", etc.
  via: string;          // "import + Route element" | "lazy" | "inferred from path"
}

const ROUTER_FILE_PATTERNS = [
  /(^|\/)App\.(t|j)sx$/,
  /(^|\/)routes\.(t|j)sx$/,
  /(^|\/)Routes\.(t|j)sx$/,
  /(^|\/)router\.(t|j)sx$/,
  /(^|\/)Router\.(t|j)sx$/,
  /Routes?\.(t|j)sx$/, // adminRoutes.tsx, publicRoutes.tsx, etc.
  /(^|\/)main\.(t|j)sx$/,
  /(^|\/)index\.(t|j)sx$/,
];

function basenameNoExt(filePath: string): string {
  const name = (filePath.split('/').pop() || '').replace(/\.(tsx?|jsx?|vue|svelte)$/, '');
  return name;
}

/**
 * Detect a route for a single page file.
 */
export async function detectRouteForPage(
  enrollmentId: string,
  pageFilePath: string,
): Promise<RouteCandidate | null> {
  const candidates = await detectRouteCandidates(enrollmentId, pageFilePath);
  return candidates[0] || null;
}

/**
 * Detect all candidate routes for a page file (sorted by confidence).
 * Returned to the frontend when no single high-confidence match exists,
 * so the user can pick.
 */
export async function detectRouteCandidates(
  enrollmentId: string,
  pageFilePath: string,
): Promise<RouteCandidate[]> {
  const connection = await getConnection(enrollmentId);
  if (!connection) return [];

  const tree = await getFileTree(enrollmentId);
  if (!tree?.tree) return [];

  const allFiles: string[] = tree.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);

  // Find router config candidates — files whose path matches typical
  // router patterns. Sort by likelihood (App.tsx > routes.tsx > others).
  const routerFiles = allFiles
    .filter(f => ROUTER_FILE_PATTERNS.some(re => re.test(f)))
    .sort((a, b) => routerPriority(a) - routerPriority(b));

  if (routerFiles.length === 0) return [];

  const componentName = basenameNoExt(pageFilePath);
  if (!componentName) return [];

  const candidates: RouteCandidate[] = [];

  for (const routerFile of routerFiles) {
    const content = await readFileFromRepo(enrollmentId, routerFile);
    if (!content) continue;

    // Pattern A — explicit import + <Route ... element={<Component />}>
    const importRegex = new RegExp(`import\\s+\\{?\\s*${escapeRegex(componentName)}\\b`, 'm');
    const lazyRegex = new RegExp(`(const|let|var)\\s+${escapeRegex(componentName)}\\s*=\\s*lazy\\s*\\(`, 'm');
    const importsComponent = importRegex.test(content) || lazyRegex.test(content);
    if (!importsComponent) continue;

    // Look for any <Route path="..." element={<Component .../>} pattern.
    // Allow self-closing or wrapped (<Component />), and React Router v6
    // shorthand (<Route path="..." Component={Component} />).
    const routeJsxPatterns = [
      // <Route path="..." element={<Component .../>} />
      new RegExp(`<Route[^>]+?path\\s*=\\s*["']([^"']+)["'][^>]+?element\\s*=\\s*\\{\\s*<\\s*${escapeRegex(componentName)}\\b[^}]*?\\}`, 'gs'),
      // <Route path="..." element={<Component>...</Component>} />
      new RegExp(`<Route[^>]+?path\\s*=\\s*["']([^"']+)["'][^>]+?<\\s*${escapeRegex(componentName)}\\b`, 'gs'),
      // path: "/...", element: <Component />  (object-config router)
      new RegExp(`path\\s*:\\s*["']([^"']+)["'][\\s\\S]{0,200}?element\\s*:\\s*<\\s*${escapeRegex(componentName)}\\b`, 'g'),
      // { path: "/...", Component: Component }
      new RegExp(`path\\s*:\\s*["']([^"']+)["'][\\s\\S]{0,200}?Component\\s*:\\s*${escapeRegex(componentName)}\\b`, 'g'),
    ];

    for (const re of routeJsxPatterns) {
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = re.exec(content)) !== null) {
        const route = m[1];
        if (!route || seen.has(route)) continue;
        seen.add(route);
        candidates.push({
          route: normalizeRoute(route),
          confidence: 0.95,
          source: routerFile,
          via: 'import + Route element',
        });
      }
    }
  }

  // De-dup by route, keep highest confidence
  const byRoute = new Map<string, RouteCandidate>();
  for (const c of candidates) {
    const existing = byRoute.get(c.route);
    if (!existing || existing.confidence < c.confidence) byRoute.set(c.route, c);
  }

  // Inferred fallback: if no JSX match, derive a guess from the page name.
  // "MilestonesPage.tsx" → "/milestones". Low confidence so the frontend
  // surfaces this as a suggestion not a decision.
  if (byRoute.size === 0) {
    const guess = inferRouteFromName(componentName);
    if (guess) byRoute.set(guess, { route: guess, confidence: 0.3, source: 'inferred', via: 'inferred from page name' });
  }

  return [...byRoute.values()].sort((a, b) => b.confidence - a.confidence);
}

function routerPriority(filePath: string): number {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('/app.tsx') || lower.endsWith('/app.jsx')) return 0;
  if (/\/routes\.(t|j)sx$/.test(lower)) return 1;
  if (/\/router\.(t|j)sx$/.test(lower)) return 2;
  if (/routes\.(t|j)sx$/.test(lower)) return 3;
  return 5;
}

function normalizeRoute(r: string): string {
  let route = r.trim();
  if (!route.startsWith('/')) route = '/' + route;
  // strip trailing slash unless route is just "/"
  if (route.length > 1 && route.endsWith('/')) route = route.slice(0, -1);
  return route;
}

function inferRouteFromName(componentName: string): string | null {
  // "MilestonesPage" → "milestones"
  // "RolesPage" → "roles"
  // "HRDashboard" → "hr-dashboard"
  let name = componentName.replace(/Page$|Screen$|View$|Component$/, '');
  if (!name) return null;
  // CamelCase → kebab
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  if (!kebab) return null;
  return '/' + kebab;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
