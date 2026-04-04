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

// Scale capability/feature counts based on requirement volume
function getClusteringParams(reqCount: number): { minCaps: number; maxCaps: number; maxFeatures: number } {
  if (reqCount <= 20) return { minCaps: 3, maxCaps: 6, maxFeatures: 5 };
  if (reqCount <= 50) return { minCaps: 5, maxCaps: 10, maxFeatures: 8 };
  if (reqCount <= 150) return { minCaps: 8, maxCaps: 15, maxFeatures: 10 };
  if (reqCount <= 500) return { minCaps: 12, maxCaps: 25, maxFeatures: 15 };
  return { minCaps: 15, maxCaps: 35, maxFeatures: 20 }; // 1000+ reqs
}

const BATCH_SIZE = 200; // max requirements per LLM call

async function clusterBatch(
  reqs: Array<{ key: string; text: string; section: string }>,
  sections: string[],
  params: { minCaps: number; maxCaps: number; maxFeatures: number },
  batchIndex: number,
  totalBatches: number,
): Promise<ClusteredHierarchy> {
  const reqList = reqs.map(r => `${r.key}: ${r.text}`).join('\n');
  const batchNote = totalBatches > 1 ? ` (batch ${batchIndex + 1}/${totalBatches})` : '';

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 16000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You organize software requirements into business capabilities and features. Respond with valid JSON only. EVERY requirement key MUST appear in exactly one feature — do not skip any.' },
      { role: 'user', content: `Group these ${reqs.length} requirements${batchNote} into ${params.minCaps}-${params.maxCaps} business CAPABILITIES, each with up to ${params.maxFeatures} FEATURES.\n\nCRITICAL: Every single REQ-xxx key listed below MUST appear in exactly one feature's requirement_keys array. Do NOT omit any.\n\nSECTIONS: ${sections.join(', ')}\n\nREQUIREMENTS:\n${reqList}\n\nRespond:\n{"capabilities":[{"name":"...","description":"...","features":[{"name":"...","description":"...","success_criteria":"...","requirement_keys":["REQ-001","REQ-002"]}]}]}` },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response');
  const parsed = JSON.parse(content) as ClusteredHierarchy;
  if (!parsed.capabilities?.length) throw new Error('No capabilities');
  return parsed;
}

export async function clusterRequirements(projectId: string, parsedReqs: ParsedRequirements): Promise<ClusteredHierarchy> {
  if (parsedReqs.total_requirements === 0) return { capabilities: [] };

  const params = getClusteringParams(parsedReqs.total_requirements);
  const allReqs = parsedReqs.flat;
  const sectionNames = parsedReqs.sections.map(s => s.name);

  try {
    if (allReqs.length <= BATCH_SIZE) {
      // Single batch — simple case
      return await clusterBatch(allReqs, sectionNames, params, 0, 1);
    }

    // Multi-batch: split requirements, cluster each batch, merge results
    console.log(`[Clustering] ${allReqs.length} requirements → ${Math.ceil(allReqs.length / BATCH_SIZE)} batches`);
    const merged: ClusteredHierarchy = { capabilities: [] };
    const batches = [];
    for (let i = 0; i < allReqs.length; i += BATCH_SIZE) {
      batches.push(allReqs.slice(i, i + BATCH_SIZE));
    }

    // Scale params per batch
    const batchParams = {
      minCaps: Math.max(3, Math.ceil(params.minCaps / batches.length)),
      maxCaps: Math.max(5, Math.ceil(params.maxCaps / batches.length)),
      maxFeatures: params.maxFeatures,
    };

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const batchSections = [...new Set(batch.map(r => r.section))];
      try {
        const result = await clusterBatch(batch, batchSections, batchParams, bi, batches.length);
        merged.capabilities.push(...result.capabilities);
        console.log(`[Clustering] Batch ${bi + 1}/${batches.length}: ${result.capabilities.length} capabilities`);
      } catch (err) {
        console.warn(`[Clustering] Batch ${bi + 1} failed, using section fallback:`, (err as Error).message);
        // Fallback: group by section
        const batchSectionGroups = new Map<string, typeof batch>();
        for (const r of batch) {
          if (!batchSectionGroups.has(r.section)) batchSectionGroups.set(r.section, []);
          batchSectionGroups.get(r.section)!.push(r);
        }
        for (const [section, reqs] of batchSectionGroups) {
          merged.capabilities.push({
            name: section,
            description: `Requirements from "${section}"`,
            features: [{ name: section, description: `All ${section} requirements`, success_criteria: `All ${reqs.length} requirements implemented`, requirement_keys: reqs.map(r => r.key) }],
          });
        }
      }
    }

    // Verify coverage — find any orphaned requirements
    const mappedKeys = new Set<string>();
    for (const cap of merged.capabilities) {
      for (const feat of cap.features) {
        for (const key of feat.requirement_keys) mappedKeys.add(key);
      }
    }
    const orphaned = allReqs.filter(r => !mappedKeys.has(r.key));
    if (orphaned.length > 0) {
      console.log(`[Clustering] ${orphaned.length} orphaned requirements — adding to "Uncategorized"`);
      merged.capabilities.push({
        name: 'Uncategorized Requirements',
        description: `${orphaned.length} requirements that were not assigned to a specific capability during clustering.`,
        features: [{ name: 'Unassigned', description: 'Requirements pending categorization', success_criteria: 'All requirements categorized and implemented', requirement_keys: orphaned.map(r => r.key) }],
      });
    }

    console.log(`[Clustering] Total: ${merged.capabilities.length} capabilities, ${mappedKeys.size + orphaned.length}/${allReqs.length} requirements mapped`);
    return merged;
  } catch (err) {
    console.warn('[Clustering] LLM failed entirely, using section fallback:', (err as Error).message);
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
