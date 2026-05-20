/**
 * Frontend Page Discovery Service
 *
 * Detects frontend pages from the repo tree, identifies orphaned pages
 * (no BP mapping), and auto-creates BPs for them.
 *
 * Runs during:
 * 1. Initial project setup (onboarding)
 * 2. GitHub sync/resync (new pages detected)
 * 3. Manual trigger
 */
import Capability from '../models/Capability';
import Feature from '../models/Feature';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Route extraction from repo file tree
// ---------------------------------------------------------------------------

interface DiscoveredPage {
  route: string;
  filePath: string;
  category: 'admin' | 'portal' | 'public' | 'other';
  pageName: string;
}

/**
 * Read the registered React Router paths from the repo. These are the
 * AUTHORITATIVE pages — any cap whose frontend_route isn't in this set
 * is either a phantom (component mistakenly classified as a page) or
 * uses a stale route format that needs fixing.
 *
 * Added 2026-05-19 after the operator surfaced a 404 on the top
 * ui_review priority: /trust-badges was stored on a "Trust Badges Page"
 * cap that the scanner auto-created from src/components/TrustBadges.tsx,
 * but `<TrustBadges>` is just an embedded section inside HomePage,
 * never registered as a route. Cross-referencing showed 24 of 44 page
 * caps had routes that don't exist in React Router.
 *
 * Source files we scan for `path="..."`:
 *   - frontend/src/App.tsx
 *   - frontend/src/routes/*.tsx (publicRoutes, adminRoutes, etc.)
 *
 * Patterns we match:
 *   - <Route path="/foo" element={...} />
 *   - <Route path="/foo/:id" element={...} />
 *
 * Returns null when no route files were found in the tree (caller falls
 * back to the legacy heuristic-only behavior).
 */
import * as fs from 'fs';
import * as path from 'path';

export function readRegisteredRoutes(fileTree: string[], repoRoot?: string): Set<string> | null {
  const routeFiles = fileTree.filter(f =>
    /(?:^|\/)frontend\/src\/App\.tsx$/.test(f)
    || /(?:^|\/)frontend\/src\/routes\/[^/]+\.tsx$/.test(f),
  );
  if (routeFiles.length === 0) return null;

  const root = repoRoot || path.resolve(__dirname, '../../..');
  const out = new Set<string>();
  for (const rel of routeFiles) {
    try {
      const abs = path.resolve(root, rel);
      if (!abs.startsWith(root)) continue;
      const content = fs.readFileSync(abs, 'utf8');
      extractPathsInto(content, out);
    } catch {
      // file unreadable — skip
    }
  }
  return out.size > 0 ? out : null;
}

/**
 * Same parser as readRegisteredRoutes but for callers that have
 * already fetched file CONTENTS (e.g., via GitHub API rather than
 * local filesystem). Used by the engine refresh path in production
 * where the container doesn't carry source files.
 *
 * Returns null when no path declarations were extracted (caller
 * treats null as "no registry available" — same as the local-fs
 * variant).
 */
export function readRegisteredRoutesFromContents(
  contents: ReadonlyArray<string | null | undefined>,
): Set<string> | null {
  const out = new Set<string>();
  for (const c of contents) {
    if (!c) continue;
    extractPathsInto(c, out);
  }
  return out.size > 0 ? out : null;
}

/** Canonical route-files list (paths relative to repo root) — used by
 * both readRegisteredRoutes (local fs) and engine refresh (GitHub API). */
export const ROUTE_FILE_PATHS: ReadonlyArray<string> = [
  'frontend/src/App.tsx',
  'frontend/src/routes/publicRoutes.tsx',
  'frontend/src/routes/adminRoutes.tsx',
  'frontend/src/routes/portalRoutes.tsx',
  'frontend/src/routes/referralRoutes.tsx',
];

function extractPathsInto(content: string, out: Set<string>): void {
  const pattern = /path\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    out.add(m[1]);
  }
}

/**
 * Extract path → component-name bindings from route file contents.
 * Looks for `<Route path="/x" element={<ComponentName .../>} />` patterns.
 * Lets the engine derive cap.frontend_route from a cap's
 * linked_frontend_components by looking up which route renders each
 * component.
 *
 * Returns a Map<componentName, route>. When multiple routes share a
 * component (rare), the last one wins — fine for our use case since
 * the operator only needs one canonical URL per cap.
 */
export function extractRouteComponentBindings(
  contents: ReadonlyArray<string | null | undefined>,
): Map<string, string> {
  const out = new Map<string, string>();
  // Matches: <Route path="/foo" element={<BarPage ...prop/>} />
  //          <Route path="/foo" element={<BarPage />} />
  const pattern = /<Route\s+path\s*=\s*"([^"]+)"\s+element\s*=\s*\{\s*<(\w+)/g;
  for (const c of contents) {
    if (!c) continue;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(c)) !== null) {
      const [, route, componentName] = m;
      out.set(componentName, route);
    }
  }
  return out;
}

/**
 * Given a cap's linked_frontend_components + the component→route
 * binding map, derive the cap's canonical frontend_route. Picks the
 * route whose component name most closely matches the cap name.
 * Falls back to the first matched component.
 *
 * Returns null when no linked component resolves to a registered
 * route (caller should leave frontend_route unset rather than
 * inventing one).
 */
export function deriveFrontendRouteFromComponents(
  capName: string,
  linkedComponents: ReadonlyArray<string>,
  componentToRoute: ReadonlyMap<string, string>,
): string | null {
  if (linkedComponents.length === 0 || componentToRoute.size === 0) return null;

  const candidates: Array<{ component: string; route: string }> = [];
  for (const comp of linkedComponents) {
    // Component name = filename without .tsx/.jsx extension
    const filename = comp.split('/').pop() || '';
    const compName = filename.replace(/\.(tsx?|jsx?)$/, '');
    const route = componentToRoute.get(compName);
    if (route) candidates.push({ component: compName, route });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].route;

  // Multiple candidates: pick the one whose component name most closely
  // matches the cap name. Strip common suffixes for the comparison.
  const normalize = (s: string) => s.toLowerCase()
    .replace(/(page|view|screen|dashboard|admin)$/g, '')
    .replace(/[^a-z0-9]/g, '');
  const capKey = normalize(capName);

  // Best match by stem overlap
  let best = candidates[0];
  let bestScore = 0;
  for (const c of candidates) {
    const compKey = normalize(c.component);
    // Score = length of longest shared substring (cheap heuristic)
    let score = 0;
    for (let i = 2; i <= Math.min(compKey.length, capKey.length); i++) {
      for (let j = 0; j <= compKey.length - i; j++) {
        if (capKey.includes(compKey.substring(j, j + i))) score = Math.max(score, i);
      }
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best.route;
}

/**
 * Extract all frontend routes from a repo file tree.
 * Supports Next.js app router AND React CRA pages.
 *
 * When registeredRoutes is supplied, the component-as-page heuristic
 * paths (lines that infer routes from filenames) are gated against the
 * actual React Router registrations. Files that LOOK like pages but
 * don't correspond to any registered route are treated as embedded
 * components and skipped. This is what prevents phantom-page caps.
 */
export function discoverFrontendPages(fileTree: string[], registeredRoutes?: Set<string> | null): DiscoveredPage[] {
  const pages: DiscoveredPage[] = [];
  const seen = new Set<string>();
  const hasRegistry = registeredRoutes !== undefined && registeredRoutes !== null;
  const isRegistered = (route: string): boolean => {
    if (!hasRegistry || !registeredRoutes) return true; // permissive fallback
    if (registeredRoutes.has(route)) return true;
    // Tolerate parameterized variants: /foo/:id matches /foo
    for (const r of registeredRoutes) {
      const base = r.replace(/\/:[^/]+/g, '');
      if (base === route) return true;
    }
    return false;
  };

  for (const f of fileTree) {
    // Next.js app router: frontend/app/{route}/page.tsx
    const appMatch = f.match(/(?:frontend\/)?app\/(.+?)\/page\.tsx$/);
    if (appMatch) {
      const route = '/' + appMatch[1].replace(/\[.*?\]/g, ':param');
      if (!seen.has(route)) {
        seen.add(route);
        pages.push({
          route,
          filePath: f,
          category: route.startsWith('/admin') ? 'admin' : route.startsWith('/portal') ? 'portal' : 'public',
          pageName: appMatch[1].split('/').pop() || appMatch[1],
        });
      }
      continue;
    }

    // React CRA: src/pages/*Page.tsx or src/pages/admin/*Page.tsx
    const craMatch = f.match(/pages\/(?:admin\/)?(\w+Page)\.tsx$/);
    if (craMatch) {
      const rawName = craMatch[1].replace(/Page$/, '');
      const cleanName = rawName.replace(/^Admin/, '');
      const route = cleanName
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
      const isAdmin = f.includes('/admin/') || rawName.startsWith('Admin');
      const fullRoute = isAdmin ? '/admin/' + route : '/' + route;

      if (!seen.has(fullRoute)) {
        seen.add(fullRoute);
        pages.push({
          route: fullRoute,
          filePath: f,
          category: isAdmin ? 'admin' : fullRoute.startsWith('/portal') ? 'portal' : 'public',
          pageName: cleanName,
        });
      }
      continue;
    }

    // Generic component-as-page: src/components/*Page.tsx or *Console.tsx or *Home.tsx
    // Also handles: services/web/src/components/AdminPage.tsx
    //
    // Route-aware gate (2026-05-19): when registeredRoutes is supplied,
    // only create a page entry if the inferred route is actually
    // registered. Files in src/components/ are MORE often embedded
    // components than real pages — without this gate, the scanner
    // creates phantom-page caps for every PascalCase component file.
    const compPageMatch = f.match(/(?:src|web)\/components\/(\w+(?:Page|Console|Home|Dashboard|View))\.tsx$/);
    if (compPageMatch) {
      const rawName = compPageMatch[1];
      const cleanName = rawName.replace(/(?:Page|Console|Home|Dashboard|View)$/, '');
      const route = '/' + cleanName
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();

      if (!seen.has(route) && isRegistered(route)) {
        seen.add(route);
        pages.push({
          route,
          filePath: f,
          category: rawName.toLowerCase().includes('admin') ? 'admin' : 'public',
          pageName: cleanName,
        });
      }
      continue;
    }

    // Standalone component files that look like pages (Login, Shipments, Carriers, Queue)
    // Pattern: src/components/{Name}.tsx where Name is PascalCase and not a utility
    const standaloneMatch = f.match(/(?:src|web)\/components\/([A-Z]\w+)\.tsx$/);
    if (standaloneMatch) {
      const name = standaloneMatch[1];
      // Skip utility/non-page components — comprehensive exclusion list
      if (/^(Drawer|Button|Modal|Header|Footer|Sidebar|Nav|Icon|Spinner|Layout|Provider|Context|Form|Input|Select|Table|Card|Badge|Alert|Toast|Tooltip|Popover|Dropdown|Tab|Accordion|Collapse|Pagination|Breadcrumb|Avatar|Chip|Tag|Divider|Skeleton|Loading|Progress|Stepper|Timeline|Rating|Toggle|Switch|Radio|Checkbox|Slider|Search|Filter|Sort|Upload|Download|Preview|Embed|Wrapper|Container|Grid|Row|Col|Flex|Stack|Box|List|Item|Cell|Section|Panel|Pane|Split|Resize|Scroll|Drag|Drop|Dnd|Animate|Transition|Fade|Slide|Zoom|Scale|Rotate|Flip)/i.test(name)) continue;
      // Skip drawers, pills, modals, login/auth screens, and component variants
      if (/drawer|pill|modal|dialog|popup|overlay|sheet|snackbar|banner|widget|chip|login|signin|signup|register|auth|forgot|reset|verify|callback|oauth|sso/i.test(name)) continue;
      // Skip if the filename is clearly a sub-component (contains "Item", "Cell", "Row", "Entry")
      if (/Item$|Cell$|Row$|Entry$|Slot$|Tile$|Chip$|Pill$/.test(name)) continue;
      const route = '/' + name
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();

      // Route-aware gate (2026-05-19): same as the *Page heuristic above.
      // This was the biggest phantom-page source — TrustBadges, MayaAvatar,
      // DreamBigSection etc. all matched this path despite being
      // embedded-only components.
      if (!seen.has(route) && isRegistered(route)) {
        seen.add(route);
        pages.push({
          route,
          filePath: f,
          category: name.toLowerCase().includes('admin') ? 'admin' : 'public',
          pageName: name,
        });
      }
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Orphan detection + auto-BP creation
// ---------------------------------------------------------------------------

export interface OrphanResult {
  total_pages: number;
  mapped_pages: number;
  orphaned_pages: number;
  created_bps: number;
  details: Array<{ route: string; status: 'mapped' | 'created' | 'skipped'; bp_name?: string }>;
}

/**
 * Find pages with no BP and create BPs for them.
 * BPs created this way have source='frontend_page' and start with 0 requirements.
 */
export async function processOrphanedPages(options: {
  projectId: string;
  fileTree: string[];
  dryRun?: boolean;
}): Promise<OrphanResult> {
  const { projectId, fileTree, dryRun = false } = options;
  const registeredRoutes = readRegisteredRoutes(fileTree);
  const pages = discoverFrontendPages(fileTree, registeredRoutes);
  const result: OrphanResult = { total_pages: pages.length, mapped_pages: 0, orphaned_pages: 0, created_bps: 0, details: [] };

  // Get all existing BPs with their frontend_route
  const existingCaps = await Capability.findAll({
    where: { project_id: projectId },
    attributes: ['id', 'name', 'frontend_route'],
  });
  const mappedRoutes = new Set(existingCaps.map(c => (c as any).frontend_route).filter(Boolean));
  // Also build a set of existing BP name stems for fuzzy matching
  const existingNameStems = new Set<string>();
  existingCaps.forEach(c => {
    c.name.toLowerCase().split(/\W+/).filter(w => w.length >= 4).forEach(s => existingNameStems.add(s));
  });

  // Skip utility pages and non-page components that don't need BPs
  const SKIP_ROUTES = new Set(['/admin/login', '/portal/login', '/portal/verify', '/:param', '/enroll/success', '/enroll/cancel', '/', '/login', '/signin', '/signup', '/register', '/forgot-password', '/reset-password', '/callback', '/oauth']);
  // Skip routes that look like sub-components, drawers, or modals
  const isNonPageRoute = (route: string, name: string) => {
    const lower = (name || route).toLowerCase();
    return /drawer|pill|modal|dialog|popup|overlay|sheet|widget|login|signin|signup|auth/i.test(lower);
  };

  for (const page of pages) {
    if (SKIP_ROUTES.has(page.route) || isNonPageRoute(page.route, page.pageName)) {
      result.details.push({ route: page.route, status: 'skipped' });
      continue;
    }

    if (mappedRoutes.has(page.route)) {
      result.mapped_pages++;
      result.details.push({ route: page.route, status: 'mapped', bp_name: existingCaps.find(c => (c as any).frontend_route === page.route)?.name });
      continue;
    }

    // Check if this page's name matches any existing BP (fuzzy)
    const pageStems = page.pageName.replace(/([A-Z])/g, ' $1').toLowerCase().trim().split(/\W+/).filter(w => w.length >= 4);
    const matchesExistingBP = pageStems.some(s => existingNameStems.has(s));
    if (matchesExistingBP) {
      result.mapped_pages++;
      result.details.push({ route: page.route, status: 'mapped', bp_name: '(name match)' });
      continue;
    }

    result.orphaned_pages++;

    if (!dryRun) {
      // Generate a clean BP name from the page
      const bpName = generateBPName(page);

      // Check if BP with this name already exists
      const existing = await Capability.findOne({ where: { project_id: projectId, name: bpName } });
      if (existing) {
        // Just set the route on the existing BP
        (existing as any).frontend_route = page.route;
        await existing.save();
        result.details.push({ route: page.route, status: 'mapped', bp_name: bpName });
        result.mapped_pages++;
        result.orphaned_pages--;
        continue;
      }

      // Create new BP
      const cap = await Capability.create({
        project_id: projectId,
        name: bpName,
        description: `Frontend page at ${page.route}. Add UX requirements to improve this page.`,
        status: 'active',
        priority: 'medium',
        sort_order: 200, // lower priority than document-derived BPs
        source: 'frontend_page',
        frontend_route: page.route,
        lifecycle_status: 'active',
        applicability_status: 'active',
      } as any);

      // Create a default feature
      await Feature.create({
        capability_id: cap.id,
        name: 'User Experience',
        description: `UX requirements for the ${page.pageName} page`,
        status: 'active',
        priority: 'medium',
        sort_order: 0,
        source: 'frontend_page',
      } as any);

      result.created_bps++;
      result.details.push({ route: page.route, status: 'created', bp_name: bpName });
    } else {
      result.details.push({ route: page.route, status: 'created', bp_name: generateBPName(page) });
    }
  }

  if (!dryRun) {
    console.log(`[PageDiscovery] ${result.total_pages} pages, ${result.mapped_pages} mapped, ${result.created_bps} new BPs created`);
  }

  return result;
}

function generateBPName(page: DiscoveredPage): string {
  // Convert route to readable name: /admin/campaigns → Campaign Management
  // /portal/curriculum → Curriculum Delivery
  // /pricing → Pricing Page
  const segment = page.route.split('/').filter(s => s && s !== 'admin' && s !== 'portal').pop() || 'home';
  const words = segment.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  const titleCase = words.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  if (page.category === 'admin') return `${titleCase} Management`;
  if (page.category === 'portal') return `${titleCase} Experience`;
  return `${titleCase} Page`;
}
