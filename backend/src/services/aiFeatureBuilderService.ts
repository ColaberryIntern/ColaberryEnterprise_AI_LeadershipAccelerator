/**
 * AI Feature Builder Service
 *
 * User describes a feature in natural language → LLM generates
 * Capability + Feature + Requirements → inserts into the hierarchy.
 */
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
  enrollmentId: string,
  description: string,
  capabilityId?: string
): Promise<{
  capability: { id: string; name: string };
  feature: { id: string; name: string };
  requirements: Array<{ key: string; text: string }>;
}> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // Get existing capabilities for context
  const existingCaps = await getCapabilityHierarchy(project.id);
  const capList = existingCaps.map(c => `- ${c.name}: ${c.description}`).join('\n');

  // Find max requirement key
  const maxReq = await RequirementsMap.findOne({
    where: { project_id: project.id },
    order: [['requirement_key', 'DESC']],
  });
  const maxNum = maxReq ? parseInt(maxReq.requirement_key.replace('REQ-', ''), 10) : 0;

  // LLM call
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a business analyst who creates structured features with atomic requirements. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `A user wants to add a new feature to their project.

User description: "${description}"

Existing capabilities in the project:
${capList || 'None yet'}

${capabilityId ? `Add this feature to the capability with the ID context above.` : 'Determine the best-fit existing capability, or suggest a new one if none fit.'}

Generate:
1. A capability name (use existing if it fits, or create new)
2. A feature with name, description, and success criteria
3. 3-8 atomic requirements (numbered starting from REQ-${String(maxNum + 1).padStart(3, '0')})

Respond with:
{
  "capability_name": "...",
  "capability_description": "...",
  "is_new_capability": true/false,
  "feature_name": "...",
  "feature_description": "...",
  "success_criteria": "...",
  "requirements": [
    { "key": "REQ-xxx", "text": "..." }
  ]
}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty LLM response');

  const result = JSON.parse(content);

  // Resolve or create capability
  let capability: Capability;
  if (capabilityId) {
    const existing = await Capability.findByPk(capabilityId);
    if (!existing) throw new Error('Capability not found');
    capability = existing;
  } else if (!result.is_new_capability) {
    // Try to find existing by name
    const existing = await Capability.findOne({
      where: { project_id: project.id, name: result.capability_name },
    });
    capability = existing || await Capability.create({
      project_id: project.id,
      name: result.capability_name,
      description: result.capability_description || '',
      source: 'ai_generated',
    });
  } else {
    capability = await Capability.create({
      project_id: project.id,
      name: result.capability_name,
      description: result.capability_description || '',
      source: 'ai_generated',
    });
  }

  // Create feature
  const feature = await Feature.create({
    capability_id: capability.id,
    name: result.feature_name,
    description: result.feature_description || '',
    success_criteria: result.success_criteria || '',
    source: 'ai_generated',
  });

  // Create requirements
  const createdReqs: Array<{ key: string; text: string }> = [];
  for (const req of (result.requirements || [])) {
    await RequirementsMap.create({
      project_id: project.id,
      requirement_key: req.key,
      requirement_text: req.text,
      capability_id: capability.id,
      feature_id: feature.id,
      is_active: true,
      status: 'unmatched',
      github_file_paths: [],
      confidence_score: 0,
    } as any);
    createdReqs.push({ key: req.key, text: req.text });
  }

  return {
    capability: { id: capability.id, name: capability.name },
    feature: { id: feature.id, name: feature.name },
    requirements: createdReqs,
  };
}
