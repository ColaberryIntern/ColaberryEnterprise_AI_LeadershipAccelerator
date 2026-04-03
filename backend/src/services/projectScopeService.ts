/**
 * Project Scope Service
 *
 * Manages the enable/disable state of Capabilities, Features, and Requirements.
 * Cascading: disabling a Capability disables all its Features and Requirements.
 */
import Capability from '../models/Capability';
import Feature from '../models/Feature';
import { RequirementsMap } from '../models';
import { getProjectByEnrollment } from './projectService';

export interface CapabilityNode {
  id: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  source: string;
  completion_pct: number;
  total_active: number;
  completed_active: number;
  features: FeatureNode[];
}

export interface FeatureNode {
  id: string;
  name: string;
  description: string;
  success_criteria: string;
  status: string;
  priority: string;
  completion_pct: number;
  total_active: number;
  completed_active: number;
  requirements: RequirementNode[];
}

export interface RequirementNode {
  id: string;
  key: string;
  text: string;
  status: string;
  is_active: boolean;
  github_file_paths: string[];
  confidence_score: number;
}

// ---------------------------------------------------------------------------
// 1. Get full hierarchy with computed stats
// ---------------------------------------------------------------------------

export async function getCapabilityHierarchy(projectId: string): Promise<CapabilityNode[]> {
  const capabilities = await Capability.findAll({
    where: { project_id: projectId },
    order: [['sort_order', 'ASC'], ['name', 'ASC']],
  });

  const result: CapabilityNode[] = [];

  for (const cap of capabilities) {
    const features = await Feature.findAll({
      where: { capability_id: cap.id },
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });

    const featureNodes: FeatureNode[] = [];

    for (const feat of features) {
      const reqs = await RequirementsMap.findAll({
        where: { feature_id: feat.id },
        order: [['requirement_key', 'ASC']],
      });

      const reqNodes: RequirementNode[] = reqs.map(r => ({
        id: r.id,
        key: r.requirement_key,
        text: r.requirement_text,
        status: (r.status === 'verified' || r.status === 'matched') ? 'completed'
          : r.status === 'partial' ? 'in_progress' : 'not_started',
        is_active: r.is_active !== false,
        github_file_paths: r.github_file_paths || [],
        confidence_score: r.confidence_score || 0,
      }));

      const activeReqs = reqNodes.filter(r => r.is_active);
      const completedActive = activeReqs.filter(r => r.status === 'completed').length;
      const totalActive = activeReqs.length;

      featureNodes.push({
        id: feat.id,
        name: feat.name,
        description: feat.description || '',
        success_criteria: feat.success_criteria || '',
        status: feat.status || 'active',
        priority: feat.priority || 'medium',
        completion_pct: totalActive > 0 ? Math.round((completedActive / totalActive) * 100) : 0,
        total_active: totalActive,
        completed_active: completedActive,
        requirements: reqNodes,
      });
    }

    const capTotalActive = featureNodes.reduce((sum, f) => sum + f.total_active, 0);
    const capCompletedActive = featureNodes.reduce((sum, f) => sum + f.completed_active, 0);

    result.push({
      id: cap.id,
      name: cap.name,
      description: cap.description || '',
      status: cap.status || 'active',
      priority: cap.priority || 'medium',
      source: cap.source || 'parsed',
      completion_pct: capTotalActive > 0 ? Math.round((capCompletedActive / capTotalActive) * 100) : 0,
      total_active: capTotalActive,
      completed_active: capCompletedActive,
      features: featureNodes,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 2. Toggle scope
// ---------------------------------------------------------------------------

export async function toggleCapability(capabilityId: string, active: boolean): Promise<void> {
  const cap = await Capability.findByPk(capabilityId);
  if (!cap) throw new Error('Capability not found');

  cap.status = active ? 'active' : 'disabled';
  await cap.save();

  // Cascade to features
  await Feature.update(
    { status: active ? 'active' : 'disabled' },
    { where: { capability_id: capabilityId } }
  );

  // Cascade to requirements
  await RequirementsMap.update(
    { is_active: active },
    { where: { capability_id: capabilityId } }
  );
}

export async function toggleFeature(featureId: string, active: boolean): Promise<void> {
  const feat = await Feature.findByPk(featureId);
  if (!feat) throw new Error('Feature not found');

  feat.status = active ? 'active' : 'disabled';
  await feat.save();

  // Cascade to requirements
  await RequirementsMap.update(
    { is_active: active },
    { where: { feature_id: featureId } }
  );
}

export async function toggleRequirement(requirementId: string, active: boolean): Promise<void> {
  const req = await RequirementsMap.findByPk(requirementId);
  if (!req) throw new Error('Requirement not found');

  req.is_active = active;
  await req.save();
}
