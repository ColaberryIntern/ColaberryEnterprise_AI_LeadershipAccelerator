/**
 * uiSynchronizer — merges manifest-declared UI changes into a project UI map.
 *
 * Output conforms to /system/ui/ui_contract.schema.json.
 *
 * Foundation only — discovery (filesystem scan of pages/) is stubbed.
 *
 * Contract: UI_CONTRACT.md
 */
import type { BuildManifest } from './buildManifestSchema';

export interface UIMap {
  ui_version: '1.0';
  project_id: string;
  generated_at: string;
  source: 'manifest' | 'declared' | 'discovered' | 'merged';
  pages: PageEntry[];
  components: ComponentEntry[];
  visual_reviews: any[];
}

export interface PageEntry {
  route: string;
  component_file?: string;
  title?: string;
  category?: 'admin' | 'public' | 'portal' | 'internal';
  bp_id?: string | null;
  actions: { id: string; label?: string; kind: string; handler?: string }[];
  critical_workflows: string[];
  accessibility_warnings: string[];
  ux_debt: string[];
}

export interface ComponentEntry {
  name: string;
  file: string;
  kind?: 'page' | 'widget' | 'form' | 'modal' | 'layout';
  used_by_pages: string[];
}

function inferCategory(route: string): PageEntry['category'] {
  if (route.startsWith('/admin')) return 'admin';
  if (route.startsWith('/portal')) return 'portal';
  if (route.startsWith('/internal')) return 'internal';
  return 'public';
}

export function buildUIMapFromManifests(
  projectId: string,
  manifests: ReadonlyArray<BuildManifest & { id: string }>,
): UIMap {
  const pageMap = new Map<string, PageEntry>();
  const componentMap = new Map<string, ComponentEntry>();

  for (const m of manifests) {
    for (const r of m.frontend_routes_added || []) {
      const existing = pageMap.get(r.route);
      pageMap.set(r.route, {
        route: r.route,
        component_file: r.component_file ?? existing?.component_file,
        title: existing?.title,
        category: existing?.category ?? inferCategory(r.route),
        bp_id: m.bp_id ?? existing?.bp_id ?? null,
        actions: existing?.actions ?? [],
        critical_workflows: existing?.critical_workflows ?? [],
        accessibility_warnings: existing?.accessibility_warnings ?? [],
        ux_debt: existing?.ux_debt ?? [],
      });
    }
    for (const c of [...(m.ui_components_added || []), ...(m.ui_components_modified || [])]) {
      const existing = componentMap.get(c.name);
      componentMap.set(c.name, {
        name: c.name,
        file: c.file,
        kind: c.category ?? existing?.kind ?? 'widget',
        used_by_pages: existing?.used_by_pages ?? [],
      });
    }
  }

  return {
    ui_version: '1.0',
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source: 'manifest',
    pages: Array.from(pageMap.values()),
    components: Array.from(componentMap.values()),
    visual_reviews: [],
  };
}

export async function buildUIMapForProject(projectId: string): Promise<UIMap> {
  const { loadManifestsForProject } = await import('./telemetryIngestionService');
  const manifests = await loadManifestsForProject(projectId, { limit: 500 });
  return buildUIMapFromManifests(projectId, manifests as any);
}

export async function persistReferenceCopy(map: UIMap): Promise<void> {
  try {
    const path = await import('path');
    const fs = await import('fs/promises');
    const repoRoot = path.resolve(__dirname, '../../../../..');
    const target = path.join(repoRoot, 'system', 'ui', 'ui_map.json');
    await fs.writeFile(target, JSON.stringify(map, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[uiSynchronizer] persistReferenceCopy failed:', err?.message);
  }
}
