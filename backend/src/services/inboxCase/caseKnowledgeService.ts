import { Op } from 'sequelize';
import CoraKbEntry from '../../models/CoraKbEntry';
import CoraKbCourse from '../../models/CoraKbCourse';
import { getActiveCohort, resolveMergeTags } from '../kbService';
import { findRelevantKnowledge } from '../admissionsKnowledgeService';
import { STOPWORDS } from './textNormalization';

// Read/write bridge between the Inbox Intel Case Resolution Engine and the
// two existing knowledge bases in this repo, so the Assess step never asks
// Ali a question that's already documented, and so answered questions teach
// the system for next time (Ali's explicit ask: "an iterative looping
// process that collects information, updates the knowledgebase").
//
// READ: consults `CoraKbEntry` (Cora's operational Q&A store — question_pattern/
// answer_template, cohort-merge-tag-resolved, already carries automation_potential
// and escalation_logic, which map directly onto "can this be answered without
// asking Ali") and `AdmissionsKnowledgeEntry` (the marketing/admissions FAQ).
// Both reads are read-only and touch nothing.
//
// WRITE: proposes a NEW `CoraKbEntry` from an answered question, but ALWAYS
// with `is_active: false`. That table also feeds Cora's live customer-facing
// auto-replies (`queryKbForCora`, `buildCoraSystemPromptFromDB` — both filter
// `activeOnly: true`), so an unreviewed AI-synthesized entry must never go
// live there automatically. It lands in the SAME review queue the existing
// `/admin/knowledge-ops` UI already shows via `GET /api/admin/kb/entries?active=false`
// — no new admin surface needed. Inbox Intel's own read path (below) is the
// one exception: it also considers entries tagged `INBOX_LEARNED_CATEGORY`
// even while inactive, so a case-resolution answer helps THIS system
// immediately, without waiting on a human to activate it for Cora too.

export const INBOX_LEARNED_CATEGORY = 'Inbox Intel — Learned';

export interface KnowledgeMatch {
  source: 'cora_kb' | 'admissions_kb';
  entry_id: string;
  question: string;
  answer: string;
  automation_potential: 'High' | 'Medium' | 'Low' | null;
  escalation_logic: string | null;
  can_auto_answer: boolean;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

async function resolveDefaultCourse(): Promise<CoraKbCourse | null> {
  const active = await CoraKbCourse.findOne({ where: { is_active: true }, order: [['name', 'ASC']] });
  if (active) return active;
  return CoraKbCourse.findOne({ order: [['name', 'ASC']] });
}

export async function findRelevantCoraKbAnswers(query: string, limit = 5): Promise<KnowledgeMatch[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const entries = await CoraKbEntry.findAll({
    where: { [Op.or]: [{ is_active: true }, { main_category: INBOX_LEARNED_CATEGORY }] },
  });

  const matched = entries.filter((e) => {
    const haystack = `${e.question_pattern} ${e.keywords ?? ''}`.toLowerCase();
    return tokens.some((t) => haystack.includes(t));
  });

  const course = await resolveDefaultCourse();
  const active = course ? await getActiveCohort(course.id) : null;

  return matched.slice(0, limit).map((e) => {
    const answer = active ? resolveMergeTags(e.answer_template, active.cohort, active.course) : e.answer_template;
    return {
      source: 'cora_kb' as const,
      entry_id: e.id,
      question: e.question_pattern,
      answer,
      automation_potential: e.automation_potential ?? null,
      escalation_logic: e.escalation_logic ?? null,
      // Low automation_potential or an explicit escalation_logic means a
      // human should still weigh in — never treat those as "already answered."
      can_auto_answer: e.automation_potential !== 'Low' && !e.escalation_logic,
    };
  });
}

export async function findRelevantAdmissionsAnswers(query: string, limit = 5): Promise<KnowledgeMatch[]> {
  const entries = await findRelevantKnowledge({ query, limit });
  return entries.map((e) => ({
    source: 'admissions_kb' as const,
    entry_id: e.id,
    question: e.title,
    answer: e.content,
    automation_potential: null,
    escalation_logic: null,
    // Marketing/admissions FAQ content is public-facing by definition — no
    // escalation concept applies, safe to treat as directly usable.
    can_auto_answer: true,
  }));
}

export interface KnowledgeReferenceBlock {
  text: string;
  matches: KnowledgeMatch[];
}

const MAX_REFERENCE_ENTRIES = 8;

// Formats matches into a labeled, trusted reference block for the assessment
// prompt — kept visually distinct from the untrusted <<<EVIDENCE>>> blocks in
// caseAssessmentService.ts so the model never confuses "documented company
// fact" with "something a stranger's email said."
export async function buildKnowledgeReferenceBlock(query: string): Promise<KnowledgeReferenceBlock> {
  const [coraMatches, admissionsMatches] = await Promise.all([
    findRelevantCoraKbAnswers(query, 5),
    findRelevantAdmissionsAnswers(query, 5),
  ]);
  const matches = [...coraMatches, ...admissionsMatches].slice(0, MAX_REFERENCE_ENTRIES);

  if (matches.length === 0) {
    return { text: '', matches: [] };
  }

  const lines = matches.map((m, i) => {
    const flag = m.can_auto_answer ? 'auto-answerable' : 'human review recommended';
    return `[KB-${i + 1}] (${m.source}, ${flag}) Q: ${m.question}\nA: ${m.answer}`;
  });

  return {
    text: `<<<KNOWLEDGE_BASE — authoritative, already-documented company facts. If a candidate question is fully answered here AND marked auto-answerable, do not propose it as a blocking question; cite it as a confirmed fact instead.>>>\n${lines.join('\n\n')}\n<<<END_KNOWLEDGE_BASE>>>`,
    matches,
  };
}

export interface LearnFromAnsweredQuestionParams {
  caseId: string;
  question: string;
  answer: string;
  whyRequired: string;
  answeredBy: string;
}

export interface LearnResult {
  created: boolean;
  entryId?: string;
  reason?: string;
}

// The write side of the loop: turns an answered case question into a
// candidate CoraKbEntry so the next case with a similar question can skip
// asking Ali entirely. Always inactive — see module header for why. Dedupes
// against existing entries (active or inbox-learned) so answering the "same"
// question across many cases doesn't spam the review queue with duplicates.
export async function learnFromAnsweredQuestion(params: LearnFromAnsweredQuestionParams): Promise<LearnResult> {
  const { caseId, question, answer, whyRequired, answeredBy } = params;
  if (!question.trim() || !answer.trim()) {
    return { created: false, reason: 'empty question or answer' };
  }

  const tokens = tokenize(question);
  const existing = await CoraKbEntry.findAll({
    where: { [Op.or]: [{ is_active: true }, { main_category: INBOX_LEARNED_CATEGORY }] },
  });

  const isDuplicate = existing.some((e) => {
    const normalizedExisting = e.question_pattern.trim().toLowerCase();
    if (normalizedExisting === question.trim().toLowerCase()) return true;
    if (tokens.length === 0) return false;
    const existingTokens = tokenize(`${e.question_pattern} ${e.keywords ?? ''}`);
    const overlap = tokens.filter((t) => existingTokens.includes(t)).length;
    // A majority of this question's meaningful words already present in an
    // existing entry is treated as "already covered" — conservative enough
    // to avoid near-duplicate spam without requiring an exact string match.
    return overlap / tokens.length >= 0.7;
  });

  if (isDuplicate) {
    return { created: false, reason: 'a similar knowledge base entry already exists' };
  }

  try {
    const created = await CoraKbEntry.create({
      course_id: null,
      main_category: INBOX_LEARNED_CATEGORY,
      sub_category: null,
      question_pattern: question,
      answer_template: answer,
      escalation_logic: whyRequired || null,
      priority: 'Medium',
      automation_potential: 'Medium',
      keywords: tokens.join(' '),
      notes: `Learned from Inbox Intel case ${caseId}, answered by ${answeredBy} on ${new Date().toISOString().slice(0, 10)}. Pending review before activation — see /admin/knowledge-ops.`,
      is_active: false,
    } as any);
    return { created: true, entryId: created.id };
  } catch (err: any) {
    console.error(`[InboxCase] Failed to write learned knowledge entry for case ${caseId}: ${err?.message}`);
    return { created: false, reason: err?.message || 'write failed' };
  }
}
