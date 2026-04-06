/**
 * Requirement Grouping + Reclassification Engine
 * Redistributes uncategorized requirements to existing or new processes.
 * Two-pass: 1) match to existing processes, 2) cluster remaining into new ones.
 */
import Capability from '../../models/Capability';
import Feature from '../../models/Feature';
import { RequirementsMap } from '../../models';
import { Op } from 'sequelize';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'with',
  'that', 'this', 'be', 'as', 'by', 'at', 'it', 'must', 'should', 'will', 'can', 'all',
  'each', 'from', 'have', 'has', 'not', 'but', 'use', 'using', 'used', 'also', 'such',
  'may', 'would', 'could', 'when', 'where', 'how', 'what', 'which', 'their', 'they',
  'them', 'then', 'than', 'been', 'being', 'its', 'into', 'only', 'any', 'some', 'more',
  'most', 'other', 'over', 'new', 'just', 'get', 'set', 'add', 'make', 'like', 'about',
  'after', 'before', 'between', 'through', 'during', 'without', 'within', 'across',
  'along', 'based', 'need', 'needs', 'include', 'ensure', 'provide', 'support',
  'system', 'data', 'process', 'user', 'create', 'manage', 'track', 'allow', 'enable',
  'shall', 'able', 'implement', 'feature', 'requirement', 'following', 'specific',
]);

function extractKeywords(text: string): string[] {
  return (text || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOPWORDS.has(w));
}

function scoreSimilarity(reqKeywords: string[], processKeywords: string[]): number {
  if (reqKeywords.length === 0 || processKeywords.length === 0) return 0;
  const processSet = new Set(processKeywords);
  const overlap = reqKeywords.filter(k => processSet.has(k) || [...processSet].some(pk => (pk.length > 4 && k.length > 4 && (pk.includes(k) || k.includes(pk)))));
  return overlap.length / Math.max(3, reqKeywords.length);
}

export interface GroupingResult {
  matched: number;
  clustered: number;
  remaining: number;
  new_processes: string[];
  details: Array<{ req_key: string; action: string; target: string; confidence: number }>;
}

/**
 * Main grouping function — redistributes uncategorized requirements.
 */
export async function groupRequirements(projectId: string): Promise<GroupingResult> {
  const result: GroupingResult = { matched: 0, clustered: 0, remaining: 0, new_processes: [], details: [] };

  // Find the uncategorized capability
  const uncatCap = await Capability.findOne({
    where: { project_id: projectId, name: { [Op.like]: '%ncategorized%' } },
  });
  if (!uncatCap) return result;

  // Load uncategorized requirements
  const uncatReqs = await RequirementsMap.findAll({
    where: { project_id: projectId, capability_id: uncatCap.id },
  });
  if (uncatReqs.length === 0) return result;

  // Load all other processes with their keywords
  const otherCaps = await Capability.findAll({
    where: { project_id: projectId, id: { [Op.ne]: uncatCap.id } },
  });

  const processProfiles = otherCaps.map(cap => ({
    id: cap.id,
    name: cap.name,
    keywords: extractKeywords(`${cap.name} ${cap.description || ''}`),
  }));

  // Also load features for each process (for assignment)
  const featureMap = new Map<string, string>(); // capability_id → first feature_id
  for (const cap of otherCaps) {
    const feat = await Feature.findOne({ where: { capability_id: cap.id }, order: [['sort_order', 'ASC']] });
    if (feat) featureMap.set(cap.id, feat.id);
  }

  // ── PASS 1: Match to existing processes ──
  const unmatched: typeof uncatReqs = [];

  for (const req of uncatReqs) {
    const reqKeywords = extractKeywords(req.requirement_text || '');
    if (reqKeywords.length === 0) { unmatched.push(req); continue; }

    let bestScore = 0;
    let bestCapId = '';
    let bestCapName = '';

    for (const profile of processProfiles) {
      const score = scoreSimilarity(reqKeywords, profile.keywords);
      if (score > bestScore) {
        bestScore = score;
        bestCapId = profile.id;
        bestCapName = profile.name;
      }
    }

    if (bestScore >= 0.3 && bestCapId) {
      // Get or create feature
      let featId = featureMap.get(bestCapId);
      if (!featId) {
        const newFeat = await Feature.create({
          capability_id: bestCapId, name: 'Core Functionality',
          description: 'Auto-assigned requirements', status: 'active', priority: 'medium', sort_order: 0, source: 'auto',
        } as any);
        featId = newFeat.id;
        featureMap.set(bestCapId, featId);
      }

      req.capability_id = bestCapId;
      req.feature_id = featId;
      await req.save();
      result.matched++;
      result.details.push({ req_key: req.requirement_key, action: 'matched', target: bestCapName, confidence: Math.round(bestScore * 100) });
    } else {
      unmatched.push(req);
    }
  }

  // ── PASS 2: Cluster remaining by keyword similarity ──
  const clusters = new Map<string, typeof uncatReqs>(); // dominant keyword → requirements

  for (const req of unmatched) {
    const keywords = extractKeywords(req.requirement_text || '');
    if (keywords.length === 0) {
      result.remaining++;
      continue;
    }

    // Find the most distinctive keyword (least common = most specific)
    const sorted = keywords.sort((a, b) => a.length - b.length).reverse(); // longer = more specific
    const dominant = sorted[0] || 'general';

    // Try to find existing cluster with similar dominant keyword
    let assigned = false;
    for (const [clusterKey, members] of clusters) {
      if (clusterKey === dominant || clusterKey.includes(dominant) || dominant.includes(clusterKey)) {
        members.push(req);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.set(dominant, [req]);
    }
  }

  // Merge small clusters (< 3 members) into a "Miscellaneous" cluster
  const miscReqs: typeof uncatReqs = [];
  const finalClusters = new Map<string, typeof uncatReqs>();

  for (const [key, members] of clusters) {
    if (members.length >= 3) {
      finalClusters.set(key, members);
    } else {
      miscReqs.push(...members);
    }
  }
  if (miscReqs.length > 0) {
    finalClusters.set('miscellaneous', miscReqs);
  }

  // Create capabilities + features for each cluster
  for (const [clusterName, members] of finalClusters) {
    const capName = `Auto: ${clusterName.charAt(0).toUpperCase() + clusterName.slice(1)}`;

    const [newCap] = await Capability.findOrCreate({
      where: { project_id: projectId, name: capName },
      defaults: {
        project_id: projectId, name: capName,
        description: `Auto-generated process grouping ${members.length} related requirements.`,
        status: 'active', priority: 'medium', sort_order: 100, source: 'auto',
      } as any,
    });

    const [newFeat] = await Feature.findOrCreate({
      where: { capability_id: newCap.id, name: 'Core Functionality' },
      defaults: {
        capability_id: newCap.id, name: 'Core Functionality',
        description: 'Auto-grouped requirements', status: 'active', priority: 'medium', sort_order: 0, source: 'auto',
      } as any,
    });

    for (const req of members) {
      req.capability_id = newCap.id;
      req.feature_id = newFeat.id;
      await req.save();
    }

    result.clustered += members.length;
    result.new_processes.push(`${capName} (${members.length} reqs)`);
    result.details.push({ req_key: `${members.length} reqs`, action: 'clustered', target: capName, confidence: 50 });
  }

  // ── CLEANUP: Delete uncategorized if empty ──
  const remainingCount = await RequirementsMap.count({ where: { project_id: projectId, capability_id: uncatCap.id } });
  if (remainingCount === 0) {
    await Feature.destroy({ where: { capability_id: uncatCap.id } });
    await uncatCap.destroy();
  }
  result.remaining = remainingCount;

  return result;
}
