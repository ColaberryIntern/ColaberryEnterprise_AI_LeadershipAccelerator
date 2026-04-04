import Capability from '../models/Capability';
import Feature from '../models/Feature';
import { RequirementsMap } from '../models';

export interface CapabilityNode {
  id: string; name: string; description: string; status: string; priority: string; source: string;
  completion_pct: number; total_active: number; completed_active: number;
  features: FeatureNode[];
}

export interface FeatureNode {
  id: string; name: string; description: string; success_criteria: string; status: string; priority: string;
  completion_pct: number; total_active: number; completed_active: number;
  requirements: RequirementNode[];
}

export interface RequirementNode {
  id: string; key: string; text: string; status: string; is_active: boolean;
  github_file_paths: string[]; confidence_score: number;
}

export async function getCapabilityHierarchy(projectId: string): Promise<CapabilityNode[]> {
  const capabilities = await Capability.findAll({ where: { project_id: projectId }, order: [['sort_order', 'ASC'], ['name', 'ASC']] });
  const result: CapabilityNode[] = [];

  for (const cap of capabilities) {
    const features = await Feature.findAll({ where: { capability_id: cap.id }, order: [['sort_order', 'ASC'], ['name', 'ASC']] });
    const featureNodes: FeatureNode[] = [];

    for (const feat of features) {
      const reqs = await RequirementsMap.findAll({ where: { feature_id: feat.id }, order: [['requirement_key', 'ASC']] });
      const reqNodes: RequirementNode[] = reqs.map(r => ({
        id: r.id, key: r.requirement_key, text: r.requirement_text,
        status: r.status || 'not_started',
        is_active: r.is_active !== false,
        github_file_paths: r.github_file_paths || [],
        confidence_score: r.confidence_score || 0,
      }));

      const active = reqNodes.filter(r => r.is_active);
      const completed = active.filter(r => r.status === 'matched' || r.status === 'verified').length;

      featureNodes.push({
        id: feat.id, name: feat.name, description: feat.description || '', success_criteria: feat.success_criteria || '',
        status: feat.status || 'active', priority: feat.priority || 'medium',
        completion_pct: active.length > 0 ? Math.round((completed / active.length) * 100) : 0,
        total_active: active.length, completed_active: completed,
        requirements: reqNodes,
      });
    }

    const totalActive = featureNodes.reduce((s, f) => s + f.total_active, 0);
    const completedActive = featureNodes.reduce((s, f) => s + f.completed_active, 0);

    result.push({
      id: cap.id, name: cap.name, description: cap.description || '',
      status: cap.status || 'active', priority: cap.priority || 'medium', source: cap.source || 'parsed',
      completion_pct: totalActive > 0 ? Math.round((completedActive / totalActive) * 100) : 0,
      total_active: totalActive, completed_active: completedActive,
      features: featureNodes,
    });
  }
  return result;
}

export async function toggleCapability(id: string, active: boolean): Promise<void> {
  await Capability.update({ status: active ? 'active' : 'disabled' }, { where: { id } });
  await Feature.update({ status: active ? 'active' : 'disabled' }, { where: { capability_id: id } });
  await RequirementsMap.update({ is_active: active } as any, { where: { capability_id: id } });
}

export async function toggleFeature(id: string, active: boolean): Promise<void> {
  await Feature.update({ status: active ? 'active' : 'disabled' }, { where: { id } });
  await RequirementsMap.update({ is_active: active } as any, { where: { feature_id: id } });
}

export async function toggleRequirement(id: string, active: boolean): Promise<void> {
  await RequirementsMap.update({ is_active: active } as any, { where: { id } });
}
