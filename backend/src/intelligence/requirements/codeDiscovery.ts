/**
 * Code Discovery Engine — scans the GitHub file tree to discover existing
 * business capabilities that are already built. Creates BPs with source='discovered'
 * and high maturity. Runs automatically on GitHub connect.
 *
 * Groups files by naming convention stems (e.g., deploymentService.ts +
 * deploymentRoutes.ts + Deployment.ts = "Deployment Management" capability).
 *
 * Feature-level depth: each route file becomes a feature under the BP.
 * Files without matching routes become features under their closest BP.
 */

export interface DiscoveredCapability {
  name: string;
  stem: string;
  files: { path: string; type: 'service' | 'route' | 'model' | 'agent' | 'other' }[];
  has_service: boolean;
  has_route: boolean;
  has_model: boolean;
  has_agent: boolean;
}

export interface DiscoveryResult {
  capabilities_discovered: number;
  capabilities_created: number;
  capabilities_merged: number;
  single_files_assigned: number;
  details: DiscoveredCapability[];
}

/**
 * Discover existing capabilities from the GitHub file tree.
 * Groups files by stem, maps to taxonomy, creates BPs.
 */
export async function discoverExistingCode(
  projectId: string,
  enrollmentId: string
): Promise<DiscoveryResult> {
  const { getConnection } = await import('../../services/githubService');
  const conn = await getConnection(enrollmentId);
  if (!conn?.file_tree_json?.tree) throw new Error('No GitHub file tree available');

  const blobs: string[] = conn.file_tree_json.tree
    .filter((t: any) => t.type === 'blob')
    .map((t: any) => t.path);

  // Filter to implementation files only
  const implFiles = blobs.filter(p => {
    if (!p.endsWith('.ts') && !p.endsWith('.tsx')) return false;
    const name = p.split('/').pop() || '';
    if (name === 'index.ts' || name.startsWith('.') || /^\d{14}/.test(name)) return false;
    if (p.includes('__tests__') || p.includes('migrations/') || p.includes('node_modules/')) return false;
    if (p.includes('/services/') || p.includes('/routes/') || p.includes('/models/') || p.includes('/agents/')) return true;
    return false;
  });

  // Group files by stem
  const groups = new Map<string, DiscoveredCapability>();

  for (const filePath of implFiles) {
    const stem = extractStem(filePath);
    if (!stem || stem.length < 3) continue;

    if (!groups.has(stem)) {
      groups.set(stem, {
        name: stemToName(stem),
        stem,
        files: [],
        has_service: false, has_route: false, has_model: false, has_agent: false,
      });
    }

    const group = groups.get(stem)!;
    const type = classifyFile(filePath);
    group.files.push({ path: filePath, type });
    if (type === 'service') group.has_service = true;
    if (type === 'route') group.has_route = true;
    if (type === 'model') group.has_model = true;
    if (type === 'agent') group.has_agent = true;
  }

  // Filter to groups with 2+ files (real capabilities) or service+route combos
  const realCapabilities = [...groups.values()].filter(g =>
    g.files.length >= 2 || (g.has_service && g.has_route)
  );

  // Assign single files to closest capability or create standalone
  const singleFiles = [...groups.values()].filter(g => g.files.length === 1);

  // Try to map capabilities to existing taxonomy categories
  let taxonomyCategories: string[] = [];
  try {
    const { Project } = await import('../../models');
    const project = await Project.findByPk(projectId);
    const vars = (project as any)?.project_variables || {};
    const taxonomy = vars.generated_taxonomy;
    if (taxonomy?.categories) {
      taxonomyCategories = taxonomy.categories.map((c: any) => c.name);
    }
  } catch {}

  // Create BPs in database
  const { Capability, Feature, RequirementsMap } = await import('../../models');
  let created = 0, merged = 0, singlesAssigned = 0;

  for (const cap of realCapabilities) {
    // Check if a BP already exists with similar name
    const { Op } = await import('sequelize');
    const existing = await Capability.findOne({
      where: { project_id: projectId, name: { [Op.iLike]: `%${cap.stem}%` } },
    });

    if (existing) {
      // Merge: update existing BP with discovered files
      merged++;
      continue; // Files will be matched via resync
    }

    // Map to taxonomy category if available
    const mappedName = mapToTaxonomy(cap.name, taxonomyCategories) || cap.name;

    // Check if taxonomy category BP already exists
    const taxonomyBP = await Capability.findOne({
      where: { project_id: projectId, name: mappedName },
    });

    let targetCapId: string;

    if (taxonomyBP) {
      targetCapId = (taxonomyBP as any).id;
      merged++;
    } else {
      // Create new capability
      const newCap = await Capability.create({
        project_id: projectId,
        name: mappedName,
        description: `Discovered from existing codebase: ${cap.files.map(f => f.path.split('/').pop()).join(', ')}`,
        status: 'active',
        priority: 'medium',
        sort_order: 0,
        source: 'discovered',
        lifecycle_status: 'active',
        applicability_status: 'active',
      } as any);
      targetCapId = newCap.id;
      created++;
    }

    // Create features for each file type group
    const featureGroups: Record<string, string[]> = {};
    for (const file of cap.files) {
      const fType = file.type === 'service' ? 'Backend Service' :
        file.type === 'route' ? 'API Routes' :
        file.type === 'model' ? 'Data Model' :
        file.type === 'agent' ? 'AI Agent' : 'Implementation';
      if (!featureGroups[fType]) featureGroups[fType] = [];
      featureGroups[fType].push(file.path);
    }

    for (const [featureName, files] of Object.entries(featureGroups)) {
      const feat = await Feature.create({
        capability_id: targetCapId,
        name: featureName,
        description: files.map(f => f.split('/').pop()).join(', '),
        status: 'active',
        priority: 'medium',
        sort_order: 0,
        source: 'discovered',
      } as any);

      // Create a verified requirement for each file (representing existing implementation)
      for (const filePath of files) {
        const fileName = filePath.split('/').pop() || filePath;
        await RequirementsMap.create({
          project_id: projectId,
          capability_id: targetCapId,
          feature_id: feat.id,
          requirement_key: `DISC-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          requirement_text: `Existing implementation: ${fileName}`,
          status: 'verified',
          confidence_score: 1.0,
          github_file_paths: [filePath],
          verified_by: 'code_discovery',
        });
      }
    }
  }

  // Assign single files to closest existing capability
  for (const single of singleFiles) {
    const file = single.files[0];
    // Find closest capability by stem overlap
    const closest = realCapabilities.find(c =>
      c.stem.includes(single.stem) || single.stem.includes(c.stem)
    );
    if (closest) singlesAssigned++;
    // Single files are picked up by resync's keyword matching
  }

  return {
    capabilities_discovered: realCapabilities.length,
    capabilities_created: created,
    capabilities_merged: merged,
    single_files_assigned: singlesAssigned,
    details: realCapabilities,
  };
}

// ─── Helpers ──────────────────────────────────────────────

function extractStem(path: string): string {
  const name = path.split('/').pop() || '';
  return name
    .replace(/\.(ts|tsx|js|jsx)$/, '')
    .replace(/(Service|Routes?|Controller|Agent|Model|Schema)s?$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function stemToName(stem: string): string {
  // Convert camelCase/lowercase stem to readable Title Case name
  // Insert spaces before capitals: "campaignAnalytics" → "Campaign Analytics"
  const spaced = stem
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const titleCase = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  // Don't add "Management" if the name already implies a domain
  const suffixes = ['analytics', 'tracking', 'monitoring', 'response', 'integration', 'management'];
  const lower = titleCase.toLowerCase();
  if (suffixes.some(s => lower.includes(s))) return titleCase.trim();
  return titleCase.trim();
}

function classifyFile(path: string): 'service' | 'route' | 'model' | 'agent' | 'other' {
  if (path.includes('/services/')) return 'service';
  if (path.includes('/routes/')) return 'route';
  if (path.includes('/models/')) return 'model';
  if (path.includes('/agents/')) return 'agent';
  return 'other';
}

function mapToTaxonomy(capName: string, taxonomyCategories: string[]): string | null {
  if (taxonomyCategories.length === 0) return null;
  const capWords = capName.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const cat of taxonomyCategories) {
    const catWords = cat.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const overlap = capWords.filter(w => catWords.some(cw => cw.includes(w) || w.includes(cw)));
    const score = overlap.length / Math.max(1, capWords.length);
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = cat;
    }
  }

  return bestMatch;
}
