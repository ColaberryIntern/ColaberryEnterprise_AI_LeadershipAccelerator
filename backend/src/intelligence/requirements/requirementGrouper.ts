/**
 * Requirement Grouping + Reclassification Engine
 * Redistributes uncategorized requirements using:
 * Pass 1: Keyword match to existing processes (aggressive)
 * Pass 2: LLM clustering for remainder (no "Miscellaneous" allowed)
 * Pass 3: Final sweep — assign stragglers to closest match
 */
import OpenAI from 'openai';
import Capability from '../../models/Capability';
import Feature from '../../models/Feature';
import { RequirementsMap } from '../../models';
import { Op } from 'sequelize';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

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
  return overlap.length / Math.max(2, reqKeywords.length);
}

export interface GroupingResult {
  matched: number;
  clustered: number;
  remaining: number;
  new_processes: string[];
  details: Array<{ req_key: string; action: string; target: string; confidence: number }>;
  _debug?: { uncatCount: number; otherProcessCount: number; pass1Unmatched: number; llmCategories?: number; llmError?: string };
}

export async function groupRequirements(projectId: string): Promise<GroupingResult> {
  const result: GroupingResult = { matched: 0, clustered: 0, remaining: 0, new_processes: [], details: [] };

  // Find uncategorized + auto:miscellaneous capabilities
  const uncatCaps = await Capability.findAll({
    where: {
      project_id: projectId,
      [Op.or]: [
        { name: { [Op.like]: '%ncategorized%' } },
        { name: { [Op.like]: '%iscellaneous%' } },
      ],
    },
  });
  if (uncatCaps.length === 0) return result;

  // Load all uncategorized requirements
  const uncatIds = uncatCaps.map(c => c.id);
  const uncatReqs = await RequirementsMap.findAll({
    where: { project_id: projectId, capability_id: { [Op.in]: uncatIds } },
  });
  if (uncatReqs.length === 0) return result;

  // ── PRE-PASS: Delete fragment requirements (not real requirements) ──
  const isFragment = (text: string): boolean => {
    if (!text || text.length < 15) return true;
    const t = text.trim();
    if (/^\*\*[^*]+\*\*:?\s*$/.test(t)) return true; // bold label only: "**User Actions**"
    if (/^\*\*[^*]+\*\*:\s*.{1,60}$/.test(t) && t.split(/\s+/).length < 12) return true; // bold label + short definition: "**Ticket**: Manages tickets..."
    if (/^[A-Za-z\s-]+:\s*$/.test(t)) return true; // label with colon only
    if (t.split(/\s+/).length < 4) return true; // less than 4 words
    if (/^\*\*(Components|Criteria|Edge Cases|Input|Output|Notes|Status|Priority|Dependencies|User Actions?|Ticket|Session|Record|Entity|Field|Table|Column)\*\*/i.test(t)) return true;
    return false;
  };

  let fragmentsDeleted = 0;
  const realReqs: typeof uncatReqs[number][] = [];
  for (const req of uncatReqs) {
    if (isFragment(req.requirement_text || '')) {
      await req.destroy();
      fragmentsDeleted++;
    } else {
      realReqs.push(req);
    }
  }
  if (fragmentsDeleted > 0) console.log(`[RequirementGrouper] Deleted ${fragmentsDeleted} fragment requirements`);

  if (realReqs.length === 0) {
    // All were fragments — cleanup empty capabilities
    for (const cap of uncatCaps) {
      await Feature.destroy({ where: { capability_id: cap.id } });
      await cap.destroy();
    }
    return result;
  }

  // Load real processes
  const otherCaps = await Capability.findAll({
    where: { project_id: projectId, id: { [Op.notIn]: uncatIds } },
  });

  const processProfiles = otherCaps.map(cap => ({
    id: cap.id,
    name: cap.name,
    keywords: extractKeywords(`${cap.name} ${cap.description || ''}`),
  }));

  // Feature map for assignment
  const featureMap = new Map<string, string>();
  for (const cap of otherCaps) {
    const feat = await Feature.findOne({ where: { capability_id: cap.id }, order: [['sort_order', 'ASC']] });
    if (feat) featureMap.set(cap.id, feat.id);
  }

  result._debug = { uncatCount: realReqs.length, otherProcessCount: otherCaps.length, pass1Unmatched: 0 };
  console.log(`[RequirementGrouper] ${realReqs.length} uncategorized reqs, ${otherCaps.length} target processes`);

  // ── PASS 1: Aggressive keyword match to existing processes (threshold 0.15) ──
  const unmatched: typeof realReqs[number][] = [];

  for (const req of realReqs) {
    const reqKeywords = extractKeywords(req.requirement_text || '');
    if (reqKeywords.length === 0) { unmatched.push(req); continue; }

    let bestScore = 0;
    let bestCapId = '';
    let bestCapName = '';

    for (const profile of processProfiles) {
      const score = scoreSimilarity(reqKeywords, profile.keywords);
      if (score > bestScore) { bestScore = score; bestCapId = profile.id; bestCapName = profile.name; }
    }

    if (bestScore >= 0.15 && bestCapId) {
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
    } else {
      unmatched.push(req);
    }
  }

  result._debug!.pass1Unmatched = unmatched.length;
  console.log(`[RequirementGrouper] Pass 1: ${result.matched} matched, ${unmatched.length} unmatched`);

  // ── PASS 2: LLM clustering for remaining (business-taxonomy-aware) ──
  if (unmatched.length > 0) {
    const existingNames = otherCaps.map(c => c.name).join(', ');
    const BATCH_SIZE = 200;

    // Load or generate business-specific taxonomy
    let taxonomyPrompt = '';
    let businessContextPrompt = '';
    try {
      const { generateTaxonomy } = await import('./taxonomyGenerator');
      const taxonomy = await generateTaxonomy(projectId);
      const categoryList = taxonomy.categories.map(c => `- ${c.name}: ${c.description}`).join('\n');
      taxonomyPrompt = `BUSINESS TAXONOMY for ${taxonomy.business_context.organization} (${taxonomy.business_context.industry}):\n${categoryList}`;
      businessContextPrompt = `\nBUSINESS CONTEXT:\n${taxonomy.business_context.business_summary?.substring(0, 500) || ''}`;
    } catch {
      // Fallback to generic taxonomy
      taxonomyPrompt = `REFERENCE TAXONOMY:\n- User Management and Access\n- Data Management and Storage\n- Analytics and Reporting\n- Content and Communication\n- Search and Discovery\n- Workflow and Automation\n- Security and Compliance\n- Integration and APIs\n- Performance and Reliability\n- Testing and Quality\n- Deployment and Operations`;
    }

    for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
      const batch = unmatched.slice(i, i + BATCH_SIZE);
      // Use simple numeric IDs to avoid LLM mangling requirement keys
      const idMap = new Map<string, typeof batch[number]>();
      const reqList = batch.map((r, idx) => {
        const simpleId = `R${idx + 1}`;
        idMap.set(simpleId, r);
        idMap.set(r.requirement_key, r); // also support original key
        return `${simpleId}: ${(r.requirement_text || '').substring(0, 120)}`;
      }).join('\n');

      try {
        const response = await getOpenAI().chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You organize software requirements into business capability categories. Respond with valid JSON only.

${taxonomyPrompt}
${businessContextPrompt}

Assign requirements to these categories. Only create new categories if a requirement truly does not fit any existing one.`,
            },
            {
              role: 'user',
              content: `Organize ${batch.length} requirements into business capability categories.

EXISTING CATEGORIES (reuse these when possible):
${existingNames}

REQUIREMENTS:
${reqList}

RULES:
1. Use the business taxonomy categories — pick the CLOSEST match
2. Merge related requirements into ONE category. Do NOT create separate categories for the same concern
3. NEVER create categories named after technical layers: "Frontend Layer", "Backend Layer", "Database", "API Layer"
4. NEVER create categories named "Miscellaneous", "Other", "General", "Uncategorized", or "Various"
5. Each category must describe a USER-FACING or BUSINESS capability
6. Each requirement must appear in exactly ONE category
7. Use "and" (not "&") in all category names for consistency
8. Category names must be 2-5 words, title case
9. Use the EXACT requirement IDs as shown (R1, R2, etc.) in requirement_keys

Respond:
{"categories":[{"name":"Category Name","requirement_keys":["R1","R2"]}]}`,
            },
          ],
        });

        const rawContent = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(rawContent);
        const categories = parsed.categories || [];
        console.log(`[RequirementGrouper] LLM returned ${categories.length} categories for batch of ${batch.length}`);
        result._debug!.llmCategories = (result._debug!.llmCategories || 0) + categories.length;

        for (const cat of categories) {
          if (!cat.name || !cat.requirement_keys?.length) continue;

          // Check if this maps to an existing process (fuzzy match)
          const existingMatch = otherCaps.find(c =>
            c.name.toLowerCase() === cat.name.toLowerCase() ||
            c.name.toLowerCase().replace(/\s+and\s+/g, ' ').includes(cat.name.toLowerCase().replace(/\s+and\s+/g, ' ').split(' ').slice(0, 2).join(' '))
          );
          let targetCapId: string;
          let targetFeatId: string;

          if (existingMatch) {
            targetCapId = existingMatch.id;
            let fid = featureMap.get(targetCapId);
            if (!fid) {
              const nf = await Feature.create({ capability_id: targetCapId, name: 'Core Functionality', status: 'active', priority: 'medium', sort_order: 0, source: 'auto' } as any);
              fid = nf.id;
              featureMap.set(targetCapId, fid);
            }
            targetFeatId = fid;
          } else {
            // Create new process
            const [newCap] = await Capability.findOrCreate({
              where: { project_id: projectId, name: cat.name },
              defaults: {
                project_id: projectId, name: cat.name,
                description: `Business process for ${cat.name.toLowerCase()} requirements.`,
                status: 'active', priority: 'medium', sort_order: 100, source: 'auto',
              } as any,
            });
            targetCapId = newCap.id;
            const [newFeat] = await Feature.findOrCreate({
              where: { capability_id: newCap.id, name: 'Core Functionality' },
              defaults: { capability_id: newCap.id, name: 'Core Functionality', status: 'active', priority: 'medium', sort_order: 0, source: 'auto' } as any,
            });
            targetFeatId = newFeat.id;
            result.new_processes.push(`${cat.name} (${cat.requirement_keys.length} reqs)`);
          }

          // Assign requirements (lookup by simple ID or original key)
          let catMatched = 0;
          for (const key of cat.requirement_keys) {
            const req = idMap.get(key) || idMap.get(key.toUpperCase()) || batch.find(r => r.requirement_key === key);
            if (req) {
              req.capability_id = targetCapId;
              req.feature_id = targetFeatId;
              await req.save();
              result.clustered++;
              catMatched++;
            }
          }
          console.log(`[RequirementGrouper]   Category "${cat.name}": ${catMatched}/${cat.requirement_keys.length} keys matched`);
        }
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error('[RequirementGrouper] LLM batch failed:', errMsg);
        result._debug!.llmError = errMsg;
        // Pass 3 fallback: assign remaining to closest match
        for (const req of batch) {
          if (req.capability_id && !uncatIds.includes(req.capability_id)) continue; // already assigned
          const reqKeywords = extractKeywords(req.requirement_text || '');
          let bestScore = 0, bestCapId = '';
          for (const profile of processProfiles) {
            const score = scoreSimilarity(reqKeywords, profile.keywords);
            if (score > bestScore) { bestScore = score; bestCapId = profile.id; }
          }
          if (bestCapId) {
            let fid = featureMap.get(bestCapId);
            if (!fid) {
              const nf = await Feature.create({ capability_id: bestCapId, name: 'Core Functionality', status: 'active', priority: 'medium', sort_order: 0, source: 'auto' } as any);
              fid = nf.id;
              featureMap.set(bestCapId, fid);
            }
            req.capability_id = bestCapId;
            req.feature_id = fid;
            await req.save();
            result.matched++;
          } else {
            result.remaining++;
          }
        }
      }
    }
  }

  // ── CLEANUP: Delete empty uncategorized capabilities ──
  for (const cap of uncatCaps) {
    const remaining = await RequirementsMap.count({ where: { project_id: projectId, capability_id: cap.id } });
    if (remaining === 0) {
      await Feature.destroy({ where: { capability_id: cap.id } });
      await cap.destroy();
    } else {
      result.remaining += remaining;
    }
  }

  // Also delete any Auto: Miscellaneous
  const miscCaps = await Capability.findAll({
    where: { project_id: projectId, name: { [Op.like]: '%iscellaneous%' } },
  });
  for (const mc of miscCaps) {
    const mcCount = await RequirementsMap.count({ where: { project_id: projectId, capability_id: mc.id } });
    if (mcCount === 0) {
      await Feature.destroy({ where: { capability_id: mc.id } });
      await mc.destroy();
    }
  }

  return result;
}
