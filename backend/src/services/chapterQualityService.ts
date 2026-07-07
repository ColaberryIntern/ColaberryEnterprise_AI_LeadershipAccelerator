/**
 * chapterQualityService — deterministic per-section quality + confidence scoring
 * for generated lesson/chapter output (the participant "v2" content shape emitted
 * by contentGenerationService.generateLessonContent).
 *
 * WHY: generated chapter content was returned to students with no post-generation
 * validation. This module scores each section on two axes — structural
 * completeness and on-topic relevance to the lesson's stated goal — and produces a
 * 0-100 confidence per section plus an overall grade, so weak or off-topic output
 * can be flagged for review instead of shipping silently.
 *
 * CONTRACT: pure + deterministic. No I/O, no LLM, no clock, no randomness, never
 * throws. Same input => same output (idempotent). All field access is defensive
 * because the input is untrusted LLM JSON. This mirrors the deterministic scoring
 * style already used by qualityScoringService for authored mini-sections, but
 * operates on the *generated runtime output* rather than DB rows.
 */

export interface SectionQuality {
  section: string;
  confidence: number; // 0-100, blend of completeness + relevance (topical sections)
  completeness: number; // 0-100 structural
  relevance: number; // 0-100 on-topic keyword overlap (100 = not assessed)
  issues: string[];
}

export interface ChapterQualityResult {
  overall_confidence: number; // 0-100 weighted mean of section confidence
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  on_topic: boolean; // mean relevance of topical sections >= ON_TOPIC_THRESHOLD
  low_confidence: boolean; // overall_confidence < REVIEW_THRESHOLD
  sections: SectionQuality[];
  issues: string[]; // flattened, de-duplicated
  regenerated?: boolean; // set by the on-topic guard when this is a corrective re-generation
}

export interface LessonContext {
  title?: string;
  learningGoal?: string;
  description?: string;
}

/** Below this overall confidence, output should be flagged for human review. */
export const REVIEW_THRESHOLD = 70;
/** Below this mean section relevance, output is treated as off-topic. */
export const ON_TOPIC_THRESHOLD = 50;

const COMPLETENESS_WEIGHT = 0.65;
const RELEVANCE_WEIGHT = 0.35;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const str = (v: any): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'will',
  'how', 'what', 'why', 'when', 'into', 'over', 'per', 'has', 'have', 'use', 'its',
  'their', 'them', 'they', 'not', 'but', 'can', 'all', 'any', 'out', 'get', 'about',
  'which', 'each', 'more', 'been', 'than', 'then', 'some', 'such', 'able', 'via',
]);

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    if (w.length >= 3 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

/** Recursively collect string leaves from a section value, for relevance scoring. */
function collectText(v: any, depth = 0): string {
  if (v == null || depth > 4) return '';
  if (typeof v === 'string') return ' ' + v;
  if (Array.isArray(v)) return v.map((x) => collectText(x, depth + 1)).join(' ');
  if (typeof v === 'object') return Object.values(v).map((x) => collectText(x, depth + 1)).join(' ');
  return '';
}

interface Topic { terms: Set<string>; hasTopic: boolean; }

function buildTopic(ctx: LessonContext): Topic {
  const src = [ctx.title, ctx.learningGoal, ctx.description].filter(Boolean).join(' ');
  const terms = tokenize(src);
  return { terms, hasTopic: terms.size > 0 };
}

function scoreRelevance(text: string, topic: Topic): number {
  if (!topic.hasTopic) return 100; // cannot assess without a topic — do not penalize
  const words = tokenize(text);
  let matched = 0;
  topic.terms.forEach((t) => { if (words.has(t)) matched++; });
  // Reward partial overlap: hitting ~40% of topic terms earns full marks.
  const target = Math.max(1, Math.ceil(topic.terms.size * 0.4));
  return clamp(Math.round((matched / target) * 100), 0, 100);
}

type SectionScore = { completeness: number; issues: string[] };
const missing = (name: string): SectionScore => ({ completeness: 0, issues: [`${name}: section missing entirely`] });

function scoreConceptSnapshot(raw: any): SectionScore {
  if (!raw || typeof raw !== 'object') return missing('concept_snapshot');
  const issues: string[] = [];
  let s = 0;
  if (str(raw.title).length >= 3) s += 25; else issues.push('concept_snapshot: title missing or too short');
  const def = str(raw.definition);
  if (def.length >= 40) s += 35; else if (def.length > 0) { s += 17; issues.push('concept_snapshot: definition is thin (<40 chars)'); } else issues.push('concept_snapshot: definition missing');
  if (str(raw.why_it_matters).length >= 20) s += 25; else issues.push('concept_snapshot: why_it_matters missing or too short');
  if (str(raw.visual_metaphor).length >= 5) s += 15; else issues.push('concept_snapshot: visual_metaphor missing');
  return { completeness: s, issues };
}

function scoreAiStrategy(raw: any): SectionScore {
  if (!raw || typeof raw !== 'object') return missing('ai_strategy');
  const issues: string[] = [];
  let s = 0;
  const desc = str(raw.description);
  if (desc.length >= 40) s += 30; else if (desc.length > 0) { s += 15; issues.push('ai_strategy: description is thin (<40 chars)'); } else issues.push('ai_strategy: description missing');
  if (arr(raw.when_to_use_ai).length > 0) s += 25; else issues.push('ai_strategy: when_to_use_ai is empty');
  if (arr(raw.human_responsibilities).length > 0) s += 25; else issues.push('ai_strategy: human_responsibilities is empty');
  if (str(raw.suggested_prompt).length >= 20) s += 20; else issues.push('ai_strategy: suggested_prompt missing or too short');
  return { completeness: s, issues };
}

function scorePlaceholderIntegrity(template: string, declaredRaw: any): { pts: number; issues: string[] } {
  const max = 35;
  const tokens = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) tokens.add(m[1].toLowerCase());
  const declared = new Set<string>();
  for (const d of arr(declaredRaw)) {
    const name = typeof d === 'string' ? d : (d && (d.name || d.key || d.placeholder));
    if (name) declared.add(String(name).toLowerCase().replace(/[{}]/g, '').trim());
  }
  if (tokens.size === 0 && declared.size === 0) return { pts: max, issues: [] }; // static template is valid
  const issues: string[] = [];
  let pts = max;
  const undeclared = [...tokens].filter((t) => !declared.has(t));
  const unused = [...declared].filter((d) => !tokens.has(d));
  if (undeclared.length) { pts -= Math.min(20, undeclared.length * 10); issues.push(`prompt_template: uses ${undeclared.map((u) => `{{${u}}}`).join(', ')} not declared in placeholders`); }
  if (unused.length) { pts -= Math.min(10, unused.length * 5); issues.push(`prompt_template: declared placeholder(s) ${unused.join(', ')} never used in template`); }
  return { pts: Math.max(0, pts), issues };
}

function scorePromptTemplate(raw: any): SectionScore {
  if (!raw || typeof raw !== 'object') return missing('prompt_template');
  const issues: string[] = [];
  let s = 0;
  const template = str(raw.template);
  if (template.length >= 20) s += 35; else if (template.length > 0) { s += 17; issues.push('prompt_template: template is thin (<20 chars)'); } else issues.push('prompt_template: template missing');
  const eos = raw.expected_output_shape;
  const hasEos = (typeof eos === 'string' && eos.trim().length >= 5) || (eos && typeof eos === 'object' && Object.keys(eos).length > 0);
  if (hasEos) s += 30; else issues.push('prompt_template: expected_output_shape missing');
  const ph = scorePlaceholderIntegrity(template, raw.placeholders);
  s += ph.pts;
  issues.push(...ph.issues);
  return { completeness: s, issues };
}

function scoreImplementationTask(raw: any): SectionScore {
  if (!raw || typeof raw !== 'object') return missing('implementation_task');
  const issues: string[] = [];
  let s = 0;
  if (str(raw.title).length >= 3) s += 15; else issues.push('implementation_task: title missing');
  const desc = str(raw.description);
  if (desc.length >= 40) s += 30; else if (desc.length > 0) { s += 15; issues.push('implementation_task: description is thin (<40 chars)'); } else issues.push('implementation_task: description missing');
  if (arr(raw.requirements).length > 0) s += 25; else issues.push('implementation_task: requirements is empty');
  if (str(raw.deliverable).length >= 5) s += 15; else issues.push('implementation_task: deliverable missing');
  if (arr(raw.getting_started).length > 0) s += 15; else issues.push('implementation_task: getting_started is empty');
  return { completeness: s, issues };
}

function countChecks(v: any): number {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.values(v).reduce((n: number, x) => n + (Array.isArray(x) ? x.length : 0), 0);
  return 0;
}

function scoreKnowledgeChecks(raw: any): SectionScore {
  const n = countChecks(raw);
  if (n >= 3) return { completeness: 100, issues: [] };
  if (n === 0) return { completeness: 0, issues: ['knowledge_checks: none present'] };
  return { completeness: Math.round((n / 3) * 100), issues: [`knowledge_checks: only ${n} present (want >= 3)`] };
}

function scoreReflection(raw: any): SectionScore {
  const n = arr(raw).length;
  if (n >= 2) return { completeness: 100, issues: [] };
  if (n === 1) return { completeness: 60, issues: ['reflection_questions: only 1 present (want >= 2)'] };
  return { completeness: 0, issues: ['reflection_questions: none present'] };
}

const SECTIONS: Array<{ key: string; weight: number; topical: boolean; score: (raw: any) => SectionScore }> = [
  { key: 'concept_snapshot', weight: 0.20, topical: true, score: scoreConceptSnapshot },
  { key: 'ai_strategy', weight: 0.20, topical: true, score: scoreAiStrategy },
  { key: 'prompt_template', weight: 0.20, topical: true, score: scorePromptTemplate },
  { key: 'implementation_task', weight: 0.20, topical: true, score: scoreImplementationTask },
  { key: 'knowledge_checks', weight: 0.12, topical: false, score: scoreKnowledgeChecks },
  { key: 'reflection_questions', weight: 0.08, topical: false, score: scoreReflection },
];

/**
 * Score a generated v2 lesson-content object. Returns per-section and overall
 * confidence, an A-F grade, and off-topic / low-confidence flags. Never throws.
 */
export function scoreChapterContent(content: any, context: LessonContext = {}): ChapterQualityResult {
  const topic = buildTopic(context);
  if (!content || typeof content !== 'object') {
    return { overall_confidence: 0, grade: 'F', on_topic: false, low_confidence: true, sections: [], issues: ['no content object to score'] };
  }

  const sections: SectionQuality[] = [];
  const allIssues: string[] = [];
  const topicalRelevances: number[] = [];
  let weighted = 0;

  for (const spec of SECTIONS) {
    const raw = content[spec.key];
    const { completeness, issues } = spec.score(raw);
    const relevance = spec.topical ? scoreRelevance(collectText(raw), topic) : 100;
    const confidence = spec.topical
      ? Math.round(completeness * COMPLETENESS_WEIGHT + relevance * RELEVANCE_WEIGHT)
      : completeness;
    sections.push({ section: spec.key, confidence, completeness, relevance, issues });
    allIssues.push(...issues);
    weighted += confidence * spec.weight;
    if (spec.topical) topicalRelevances.push(relevance);
  }

  const overall = Math.round(weighted);
  const meanRel = topicalRelevances.length
    ? topicalRelevances.reduce((a, b) => a + b, 0) / topicalRelevances.length
    : 100;
  const on_topic = topic.hasTopic ? meanRel >= ON_TOPIC_THRESHOLD : true;
  const low_confidence = overall < REVIEW_THRESHOLD;

  const issues = Array.from(new Set(allIssues));
  if (!on_topic) {
    issues.unshift(`content appears off-topic for "${str(context.title) || str(context.learningGoal) || 'this lesson'}" (mean section relevance ${Math.round(meanRel)}%)`);
  }

  return { overall_confidence: overall, grade: getGrade(overall), on_topic, low_confidence, sections, issues };
}
