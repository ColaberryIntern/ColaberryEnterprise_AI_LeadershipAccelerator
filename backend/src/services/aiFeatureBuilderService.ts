import OpenAI from 'openai';
import Capability from '../models/Capability';
import Feature from '../models/Feature';
import { RequirementsMap } from '../models';
import { getProjectByEnrollment } from './projectService';
import { getCapabilityHierarchy } from './projectScopeService';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export async function generateFeature(
  enrollmentId: string, description: string, capabilityId?: string
): Promise<{ capability: { id: string; name: string }; feature: { id: string; name: string }; requirements: Array<{ key: string; text: string }> }> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const existingCaps = await getCapabilityHierarchy(project.id);
  const capList = existingCaps.map(c => `- ${c.name}: ${c.description}`).join('\n');
  const maxReq = await RequirementsMap.findOne({ where: { project_id: project.id }, order: [['requirement_key', 'DESC']] });
  const maxNum = maxReq ? parseInt(maxReq.requirement_key.replace('REQ-', ''), 10) : 0;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You create structured features with atomic requirements. Respond with valid JSON only.' },
      { role: 'user', content: `User wants: "${description}"\n\nExisting capabilities:\n${capList || 'None'}\n\nGenerate:\n{"capability_name":"...","capability_description":"...","is_new_capability":true/false,"feature_name":"...","feature_description":"...","success_criteria":"...","requirements":[{"key":"REQ-${String(maxNum + 1).padStart(3, '0')}","text":"..."}]}` },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response');
  const result = JSON.parse(content);

  let capability: Capability;
  if (capabilityId) {
    capability = (await Capability.findByPk(capabilityId))!;
    if (!capability) throw new Error('Capability not found');
  } else {
    const existing = await Capability.findOne({ where: { project_id: project.id, name: result.capability_name } });
    capability = existing || await Capability.create({ project_id: project.id, name: result.capability_name, description: result.capability_description || '', source: 'ai_generated' });
  }

  const feature = await Feature.create({ capability_id: capability.id, name: result.feature_name, description: result.feature_description || '', success_criteria: result.success_criteria || '', source: 'ai_generated' });

  const createdReqs: Array<{ key: string; text: string }> = [];
  for (const req of (result.requirements || [])) {
    await RequirementsMap.create({ project_id: project.id, requirement_key: req.key, requirement_text: req.text, capability_id: capability.id, feature_id: feature.id, is_active: true, status: 'unmatched', github_file_paths: [], confidence_score: 0 } as any);
    createdReqs.push({ key: req.key, text: req.text });
  }

  return { capability: { id: capability.id, name: capability.name }, feature: { id: feature.id, name: feature.name }, requirements: createdReqs };
}
