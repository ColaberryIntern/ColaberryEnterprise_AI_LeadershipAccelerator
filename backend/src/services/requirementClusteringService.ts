import OpenAI from 'openai';
import Capability from '../models/Capability';
import Feature from '../models/Feature';
import { RequirementsMap } from '../models';
import { ParsedRequirements } from './requirementsParserService';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export interface ClusteredHierarchy {
  capabilities: Array<{
    name: string;
    description: string;
    features: Array<{
      name: string;
      description: string;
      success_criteria: string;
      requirement_keys: string[];
    }>;
  }>;
}

export async function clusterRequirements(projectId: string, parsedReqs: ParsedRequirements): Promise<ClusteredHierarchy> {
  if (parsedReqs.total_requirements === 0) return { capabilities: [] };

  try {
    const reqList = parsedReqs.flat.map(r => `${r.key}: ${r.text}`).join('\n');
    const sectionList = parsedReqs.sections.map(s => `"${s.name}": ${s.requirements.map(r => r.key).join(', ')}`).join('\n');

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You organize software requirements into business capabilities and features. Respond with valid JSON only.' },
        { role: 'user', content: `Group these ${parsedReqs.total_requirements} requirements into 3-8 business CAPABILITIES, each with 1-5 FEATURES. Every REQ-xxx must appear in exactly one feature.\n\nSECTIONS:\n${sectionList}\n\nREQUIREMENTS:\n${reqList}\n\nRespond:\n{"capabilities":[{"name":"...","description":"...","features":[{"name":"...","description":"...","success_criteria":"...","requirement_keys":["REQ-001"]}]}]}` },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response');
    const parsed = JSON.parse(content) as ClusteredHierarchy;
    if (!parsed.capabilities?.length) throw new Error('No capabilities');
    return parsed;
  } catch (err) {
    console.warn('[Clustering] LLM failed, using section fallback:', (err as Error).message);
    return {
      capabilities: parsedReqs.sections.map(s => ({
        name: s.name,
        description: `Requirements from "${s.name}"`,
        features: [{ name: s.name, description: `All ${s.name} requirements`, success_criteria: `All ${s.requirements.length} requirements implemented`, requirement_keys: s.requirements.map(r => r.key) }],
      })),
    };
  }
}

export async function persistHierarchy(projectId: string, hierarchy: ClusteredHierarchy): Promise<{ capabilities: number; features: number; mapped: number }> {
  let capCount = 0, featCount = 0, mappedCount = 0;

  for (let ci = 0; ci < hierarchy.capabilities.length; ci++) {
    const cap = hierarchy.capabilities[ci];
    const [capability] = await Capability.findOrCreate({
      where: { project_id: projectId, name: cap.name },
      defaults: { project_id: projectId, name: cap.name, description: cap.description || '', sort_order: ci, source: 'parsed' },
    });
    capCount++;

    for (let fi = 0; fi < cap.features.length; fi++) {
      const feat = cap.features[fi];
      const [feature] = await Feature.findOrCreate({
        where: { capability_id: capability.id, name: feat.name },
        defaults: { capability_id: capability.id, name: feat.name, description: feat.description || '', success_criteria: feat.success_criteria || '', sort_order: fi, source: 'parsed' },
      });
      featCount++;

      if (feat.requirement_keys?.length) {
        const [updated] = await RequirementsMap.update(
          { capability_id: capability.id, feature_id: feature.id, is_active: true } as any,
          { where: { project_id: projectId, requirement_key: feat.requirement_keys } }
        );
        mappedCount += updated;
      }
    }
  }

  console.log(`[Clustering] ${capCount} capabilities, ${featCount} features, ${mappedCount} mapped`);
  return { capabilities: capCount, features: featCount, mapped: mappedCount };
}
