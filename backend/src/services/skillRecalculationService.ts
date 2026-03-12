import OpenAI from 'openai';
import MiniSection from '../models/MiniSection';
import SkillDefinition from '../models/SkillDefinition';
import CurriculumLesson from '../models/CurriculumLesson';
import CurriculumModule from '../models/CurriculumModule';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

interface ExtractedSkill {
  name: string;
  description: string;
}

interface RecalcResult {
  matched: { id: string; name: string }[];
  created: { id: string; name: string }[];
  associated_skill_ids: string[];
}

/**
 * Analyze a mini-section's build prompt to extract skills,
 * match against existing skills, create missing ones, and link them.
 */
export async function recalculateSkillsForMiniSection(miniSectionId: string): Promise<RecalcResult> {
  const ms = await MiniSection.findByPk(miniSectionId);
  if (!ms) throw new Error('Mini-section not found');
  if (ms.mini_section_type !== 'implementation_task') {
    throw new Error('Skill recalculation is only supported for implementation_task type');
  }

  const buildPrompt = (ms as any).build_prompt_system as string;
  if (!buildPrompt) {
    throw new Error('No Task Requirements Prompt configured. Add a prompt first, then recalculate.');
  }

  // Load existing skills
  const allSkills = await SkillDefinition.findAll({ where: { is_active: true } });

  // Extract skills from prompt via LLM
  const extracted = await extractSkillsFromPrompt(buildPrompt);

  // Get lesson context for layer_id / domain_id defaults
  const lesson = await CurriculumLesson.findByPk(ms.lesson_id, {
    include: [{ model: CurriculumModule, as: 'module' }],
  });
  const module = (lesson as any)?.module as CurriculumModule | null;
  const defaultLayerId = (module as any)?.skill_area || 'ai-leadership';
  const defaultDomainId = 'implementation';

  const matched: { id: string; name: string }[] = [];
  const created: { id: string; name: string }[] = [];

  for (const skill of extracted) {
    const match = findBestMatch(skill.name, allSkills);
    if (match) {
      matched.push({ id: match.id, name: match.name });
    } else {
      // Create new skill
      const skillId = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const newSkill = await SkillDefinition.create({
        id: require('crypto').randomUUID(),
        layer_id: defaultLayerId,
        domain_id: defaultDomainId,
        skill_id: skillId,
        name: skill.name,
        description: skill.description,
        mastery_threshold: 0.7,
        is_active: true,
      });
      created.push({ id: newSkill.id, name: newSkill.name });
      allSkills.push(newSkill); // so subsequent matches can find it
    }
  }

  const associated_skill_ids = [...matched.map(s => s.id), ...created.map(s => s.id)];

  // Update the mini-section
  await ms.update({ associated_skill_ids });

  return { matched, created, associated_skill_ids };
}

/**
 * Use LLM to extract 3-5 skill names from a build prompt.
 */
async function extractSkillsFromPrompt(buildPrompt: string): Promise<ExtractedSkill[]> {
  const response = await getOpenAI().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a curriculum design assistant. Given an implementation task prompt, extract 3-5 concrete, specific skills that the task assesses or develops.

Return a JSON array of objects with "name" (short skill name, 2-4 words) and "description" (1 sentence).

Examples of good skill names: "Data Analysis", "Prompt Engineering", "AI Strategy Design", "Stakeholder Communication", "Process Automation Planning"

Return ONLY the JSON array, no markdown or explanation.`,
      },
      {
        role: 'user',
        content: buildPrompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 512,
  });

  const text = response.choices[0]?.message?.content?.trim() || '[]';
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s: any) => s.name && typeof s.name === 'string').slice(0, 5);
  } catch {
    console.error('[SkillRecalc] Failed to parse LLM response:', text);
    return [];
  }
}

/**
 * Fuzzy-match a skill name against existing skills.
 * Returns the best match if similarity is above threshold.
 */
function findBestMatch(name: string, skills: SkillDefinition[]): SkillDefinition | null {
  const normalized = name.toLowerCase().trim();
  let bestScore = 0;
  let bestSkill: SkillDefinition | null = null;

  for (const skill of skills) {
    const skillName = skill.name.toLowerCase().trim();

    // Exact match
    if (skillName === normalized) return skill;

    // Token overlap scoring
    const nameTokens = new Set(normalized.split(/\s+/));
    const skillTokens = new Set(skillName.split(/\s+/));
    const intersection = [...nameTokens].filter(t => skillTokens.has(t)).length;
    const union = new Set([...nameTokens, ...skillTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    // Substring containment bonus
    const containsBonus = skillName.includes(normalized) || normalized.includes(skillName) ? 0.3 : 0;

    const score = jaccard + containsBonus;
    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  // Threshold: at least 50% token overlap or substring containment
  return bestScore >= 0.5 ? bestSkill : null;
}
