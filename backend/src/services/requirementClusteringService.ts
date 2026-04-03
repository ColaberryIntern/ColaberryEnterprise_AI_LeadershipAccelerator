/**
 * Requirement Clustering Service
 *
 * Groups flat requirements into a Capability → Feature → Requirement
 * hierarchy using LLM-powered semantic clustering.
 */
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

export interface ClusteredCapability {
  name: string;
  description: string;
  features: Array<{
    name: string;
    description: string;
    success_criteria: string;
    requirement_keys: string[];
  }>;
}

export interface ClusteredHierarchy {
  capabilities: ClusteredCapability[];
}

// ---------------------------------------------------------------------------
// 1. Cluster requirements via LLM
// ---------------------------------------------------------------------------

export async function clusterRequirements(
  projectId: string,
  parsedReqs: ParsedRequirements
): Promise<ClusteredHierarchy> {
  if (parsedReqs.total_requirements === 0) {
    return { capabilities: [] };
  }

  try {
    const prompt = buildClusteringPrompt(parsedReqs);
    const openai = getOpenAI();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a business analyst who organizes software requirements into a clear hierarchy. You MUST respond with valid JSON only.`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response');

    const parsed = JSON.parse(content) as ClusteredHierarchy;
    if (!parsed.capabilities || !Array.isArray(parsed.capabilities)) {
      throw new Error('Invalid clustering response: missing capabilities array');
    }

    return parsed;
  } catch (err) {
    console.warn('[Clustering] LLM clustering failed, using section-based fallback:', (err as Error).message);
    return fallbackClustering(parsedReqs);
  }
}

// ---------------------------------------------------------------------------
// 2. Persist hierarchy to database
// ---------------------------------------------------------------------------

export async function persistHierarchy(
  projectId: string,
  hierarchy: ClusteredHierarchy
): Promise<{ capabilities: number; features: number; mapped: number }> {
  let capCount = 0, featCount = 0, mappedCount = 0;

  for (let ci = 0; ci < hierarchy.capabilities.length; ci++) {
    const cap = hierarchy.capabilities[ci];

    const [capability] = await Capability.findOrCreate({
      where: { project_id: projectId, name: cap.name },
      defaults: {
        project_id: projectId,
        name: cap.name,
        description: cap.description || '',
        sort_order: ci,
        source: 'parsed',
      },
    });
    capCount++;

    for (let fi = 0; fi < cap.features.length; fi++) {
      const feat = cap.features[fi];

      const [feature] = await Feature.findOrCreate({
        where: { capability_id: capability.id, name: feat.name },
        defaults: {
          capability_id: capability.id,
          name: feat.name,
          description: feat.description || '',
          success_criteria: feat.success_criteria || '',
          sort_order: fi,
          source: 'parsed',
        },
      });
      featCount++;

      // Map requirements to this feature
      if (feat.requirement_keys?.length) {
        const [updated] = await RequirementsMap.update(
          { capability_id: capability.id, feature_id: feature.id, is_active: true },
          { where: { project_id: projectId, requirement_key: feat.requirement_keys } }
        );
        mappedCount += updated;
      }
    }
  }

  console.log(`[Clustering] Persisted: ${capCount} capabilities, ${featCount} features, ${mappedCount} requirements mapped`);
  return { capabilities: capCount, features: featCount, mapped: mappedCount };
}

// ---------------------------------------------------------------------------
// 3. Build clustering prompt
// ---------------------------------------------------------------------------

function buildClusteringPrompt(parsedReqs: ParsedRequirements): string {
  const reqList = parsedReqs.flat.map(r => `${r.key}: ${r.text}`).join('\n');
  const sectionList = parsedReqs.sections.map(s =>
    `Section "${s.name}": ${s.requirements.map(r => r.key).join(', ')}`
  ).join('\n');

  return `I have ${parsedReqs.total_requirements} software requirements organized into ${parsedReqs.sections.length} sections.

SECTIONS:
${sectionList}

REQUIREMENTS:
${reqList}

Group these requirements into 3-8 business CAPABILITIES (high-level system areas).
Each capability should contain 1-5 FEATURES (functional groupings).
Each feature should reference the specific requirement keys (REQ-xxx) that belong to it.

Every requirement key MUST appear in exactly one feature.

Respond with this exact JSON structure:
{
  "capabilities": [
    {
      "name": "Short business-level name",
      "description": "One sentence describing this capability",
      "features": [
        {
          "name": "Feature name",
          "description": "What this feature does",
          "success_criteria": "How to verify this feature is complete",
          "requirement_keys": ["REQ-001", "REQ-003"]
        }
      ]
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// 4. Fallback: section-based clustering (no LLM)
// ---------------------------------------------------------------------------

function fallbackClustering(parsedReqs: ParsedRequirements): ClusteredHierarchy {
  return {
    capabilities: parsedReqs.sections.map(section => ({
      name: section.name,
      description: `Requirements from the "${section.name}" section`,
      features: [{
        name: section.name,
        description: `All requirements in ${section.name}`,
        success_criteria: `All ${section.requirements.length} requirements implemented`,
        requirement_keys: section.requirements.map(r => r.key),
      }],
    })),
  };
}
