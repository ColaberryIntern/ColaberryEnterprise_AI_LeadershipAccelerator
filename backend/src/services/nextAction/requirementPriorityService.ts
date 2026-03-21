import { ArtifactRelationship, ArtifactDefinition, AssignmentSubmission } from '../../models';
import { Op } from 'sequelize';

interface RequirementRow {
  id: string;
  project_id: string;
  requirement_key: string;
  requirement_text: string;
  source_artifact_id?: string | null;
  github_file_paths?: string[];
  confidence_score?: number;
  status: string;
}

export interface PrioritizedRequirement {
  requirement: RequirementRow;
  priorityScore: number;
  statusWeight: number;
  dependencyWeight: number;
  systemRuleWeight: number;
}

// ---------------------------------------------------------------------------
// Status weights
// ---------------------------------------------------------------------------
const STATUS_WEIGHTS: Record<string, number> = {
  unmatched: 3,
  partial: 2,
  matched: 0,
  verified: 0,
};

// ---------------------------------------------------------------------------
// Main: Prioritize requirements
// ---------------------------------------------------------------------------

export async function prioritizeRequirements(
  requirements: RequirementRow[],
  systemDocContent: string
): Promise<PrioritizedRequirement[]> {
  // Filter to actionable requirements only
  const actionable = requirements.filter(
    (r) => r.status === 'unmatched' || r.status === 'partial'
  );

  if (actionable.length === 0) return [];

  // Precompute dependency weights for all source artifacts
  const sourceArtifactIds = actionable
    .map((r) => r.source_artifact_id)
    .filter((id): id is string => !!id);

  const dependencyWeights = await computeDependencyWeights(sourceArtifactIds);

  // Tokenize system doc content for keyword matching
  const systemKeywords = tokenize(systemDocContent);

  const prioritized: PrioritizedRequirement[] = actionable.map((req) => {
    const statusWeight = STATUS_WEIGHTS[req.status] || 1;
    const dependencyWeight = req.source_artifact_id
      ? dependencyWeights.get(req.source_artifact_id) || 1
      : 1;
    const systemRuleWeight = computeSystemRuleWeight(req.requirement_text, systemKeywords);

    const priorityScore = statusWeight * dependencyWeight * systemRuleWeight;

    return {
      requirement: req,
      priorityScore,
      statusWeight,
      dependencyWeight,
      systemRuleWeight,
    };
  });

  // Sort by priority descending
  prioritized.sort((a, b) => b.priorityScore - a.priorityScore);

  console.log(
    `[NextAction:Priority] Scored ${prioritized.length} requirements. Top: ${prioritized[0]?.requirement.requirement_key} (score: ${prioritized[0]?.priorityScore.toFixed(2)})`
  );

  return prioritized;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeDependencyWeights(
  artifactIds: string[]
): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  if (artifactIds.length === 0) return weights;

  // Count how many children each artifact has in the graph
  const edges = await ArtifactRelationship.findAll({
    where: { parent_artifact_id: { [Op.in]: artifactIds } },
    attributes: ['parent_artifact_id'],
  });

  const childCounts = new Map<string, number>();
  for (const edge of edges) {
    const current = childCounts.get(edge.parent_artifact_id) || 0;
    childCounts.set(edge.parent_artifact_id, current + 1);
  }

  for (const id of artifactIds) {
    const childCount = childCounts.get(id) || 0;
    weights.set(id, 1 + childCount * 0.5);
  }

  return weights;
}

function computeSystemRuleWeight(
  requirementText: string,
  systemKeywords: Set<string>
): number {
  if (systemKeywords.size === 0) return 1.0;

  const reqTokens = tokenize(requirementText);
  let matchCount = 0;
  for (const token of reqTokens) {
    if (systemKeywords.has(token)) matchCount++;
  }

  // If >=20% of requirement tokens appear in system docs, boost
  const overlap = reqTokens.size > 0 ? matchCount / reqTokens.size : 0;
  return overlap >= 0.2 ? 1.5 : 1.0;
}

function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'must', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'or',
    'but', 'not', 'no', 'that', 'this', 'it', 'all', 'each', 'every',
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );
}
