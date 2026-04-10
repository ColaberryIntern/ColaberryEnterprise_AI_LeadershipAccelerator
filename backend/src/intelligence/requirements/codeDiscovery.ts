/**
 * Code Discovery Engine — scans the GitHub file tree to discover existing
 * business capabilities. ALWAYS merges into existing taxonomy BPs.
 * Never creates standalone tiny BPs.
 *
 * Groups files by naming convention stems, then maps each group to the
 * closest existing BP using taxonomy keywords + LLM fallback.
 * Creates verified requirements pointing to the actual files.
 */

export interface DiscoveredCapability {
  name: string;
  stem: string;
  files: { path: string; type: 'service' | 'route' | 'model' | 'agent' | 'other' }[];
  has_service: boolean;
  has_route: boolean;
  has_model: boolean;
  has_agent: boolean;
  mapped_to?: string; // which taxonomy BP this was assigned to
}

export interface DiscoveryResult {
  capabilities_discovered: number;
  files_cataloged: number;
  merged_into_existing: number;
  unmapped: number;
  details: DiscoveredCapability[];
}

/**
 * Discover existing capabilities from the GitHub file tree.
 * Groups files by stem, maps to existing taxonomy BPs, adds as verified features.
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
        name: stemToReadableName(stem),
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

  // Only consider groups with 2+ files (real capabilities)
  const realCapabilities = [...groups.values()].filter(g => g.files.length >= 2);

  // Load existing BPs + taxonomy
  const { Capability, Feature, RequirementsMap } = await import('../../models');
  const existingBPs = await Capability.findAll({
    where: { project_id: projectId },
    attributes: ['id', 'name'],
  });

  let taxonomyCategories: { name: string; keywords: string[] }[] = [];
  try {
    const { Project } = await import('../../models');
    const project = await Project.findByPk(projectId);
    const vars = (project as any)?.project_variables || {};
    if (vars.generated_taxonomy?.categories) {
      taxonomyCategories = vars.generated_taxonomy.categories;
    }
  } catch {}

  // Map each discovered group to the closest existing BP
  let mergedCount = 0, unmappedCount = 0, filesCataloged = 0;

  for (const cap of realCapabilities) {
    // Try to find the best matching existing BP
    const targetBP = findBestMatch(cap, existingBPs as any[], taxonomyCategories);

    if (!targetBP) {
      cap.mapped_to = 'unmapped';
      unmappedCount++;
      continue;
    }

    cap.mapped_to = (targetBP as any).name;

    // Create a feature for this discovered module under the existing BP
    const featureName = `${cap.name} (Existing)`;
    const existingFeature = await Feature.findOne({
      where: { capability_id: (targetBP as any).id, name: featureName },
    });

    if (existingFeature) {
      mergedCount++;
      continue; // Already discovered
    }

    const feat = await Feature.create({
      capability_id: (targetBP as any).id,
      name: featureName,
      description: `Discovered: ${cap.files.map(f => f.path.split('/').pop()).join(', ')}`,
      status: 'active',
      priority: 'medium',
      sort_order: 100,
      source: 'discovered',
    } as any);

    // Create verified requirements for each file
    for (const file of cap.files) {
      const fileName = file.path.split('/').pop() || file.path;
      await RequirementsMap.create({
        project_id: projectId,
        capability_id: (targetBP as any).id,
        feature_id: feat.id,
        requirement_key: `DISC-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        requirement_text: `[Existing] ${fileName} — ${file.type} implementation`,
        status: 'verified',
        confidence_score: 1.0,
        github_file_paths: [file.path],
        verified_by: 'code_discovery',
      });
      filesCataloged++;
    }

    mergedCount++;
  }

  console.log(`[CodeDiscovery] Discovered ${realCapabilities.length} modules, merged ${mergedCount} into existing BPs, ${filesCataloged} files cataloged`);

  return {
    capabilities_discovered: realCapabilities.length,
    files_cataloged: filesCataloged,
    merged_into_existing: mergedCount,
    unmapped: unmappedCount,
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

function stemToReadableName(stem: string): string {
  // Insert spaces before capitals: "campaignAnalytics" → "Campaign Analytics"
  const spaced = stem.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function classifyFile(path: string): 'service' | 'route' | 'model' | 'agent' | 'other' {
  if (path.includes('/services/')) return 'service';
  if (path.includes('/routes/')) return 'route';
  if (path.includes('/models/')) return 'model';
  if (path.includes('/agents/')) return 'agent';
  return 'other';
}

/**
 * Find the best matching existing BP for a discovered code module.
 * Uses three strategies:
 * 1. Direct stem match against BP names
 * 2. Taxonomy keyword match
 * 3. Semantic word overlap
 */
function findBestMatch(
  cap: DiscoveredCapability,
  existingBPs: { id: string; name: string }[],
  taxonomyCategories: { name: string; keywords: string[] }[]
): { id: string; name: string } | null {
  if (existingBPs.length === 0) return null;

  const stemLower = cap.stem.toLowerCase();
  const stemWords = cap.name.toLowerCase().split(/\W+/).filter((w: string) => w.length > 2);

  // Strategy 1: Direct name match (stem appears in BP name)
  for (const bp of existingBPs) {
    const bpLower = bp.name.toLowerCase();
    if (bpLower.includes(stemLower) || stemLower.includes(bpLower.split(/\W+/)[0])) {
      return bp;
    }
  }

  // Strategy 2: Taxonomy keyword match
  let bestKeywordMatch: { id: string; name: string } | null = null;
  let bestKeywordScore = 0;

  for (const cat of taxonomyCategories) {
    const keywords = cat.keywords || [];
    const matchCount = keywords.filter((kw: string) =>
      stemLower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(stemLower)
    ).length;
    if (matchCount > bestKeywordScore) {
      bestKeywordScore = matchCount;
      // Find the BP with this taxonomy name
      const bp = existingBPs.find(b => b.name.toLowerCase() === cat.name.toLowerCase());
      if (bp) bestKeywordMatch = bp;
    }
  }

  if (bestKeywordMatch && bestKeywordScore >= 1) return bestKeywordMatch;

  // Strategy 3: Word overlap with BP names
  let bestOverlap: { id: string; name: string } | null = null;
  let bestOverlapScore = 0;

  for (const bp of existingBPs) {
    const bpWords = bp.name.toLowerCase().split(/\W+/).filter((w: string) => w.length > 2);
    const overlap = stemWords.filter((w: string) =>
      bpWords.some((bw: string) => bw.includes(w) || w.includes(bw))
    ).length;
    const score = overlap / Math.max(1, stemWords.length);
    if (score > bestOverlapScore && score > 0.3) {
      bestOverlapScore = score;
      bestOverlap = bp;
    }
  }

  if (bestOverlap) return bestOverlap;

  // Strategy 4: Fallback — assign to largest BP (most generic = most likely to absorb)
  // Sort by name length (shorter = more generic = better catch-all)
  const sorted = [...existingBPs].sort((a, b) => a.name.length - b.name.length);
  // Pick a reasonable default based on file type
  const hasRoute = cap.has_route;
  const hasModel = cap.has_model;
  const hasAgent = cap.has_agent;

  if (hasAgent) {
    const aiMatch = existingBPs.find(b => b.name.toLowerCase().includes('ai') || b.name.toLowerCase().includes('automation'));
    if (aiMatch) return aiMatch;
  }
  if (hasModel) {
    const dataMatch = existingBPs.find(b => b.name.toLowerCase().includes('data'));
    if (dataMatch) return dataMatch;
  }
  if (hasRoute) {
    const apiMatch = existingBPs.find(b => b.name.toLowerCase().includes('api') || b.name.toLowerCase().includes('integration'));
    if (apiMatch) return apiMatch;
  }

  // Last resort: first BP
  return sorted[0] || null;
}
