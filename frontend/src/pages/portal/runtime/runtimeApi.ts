import portalApi from '../../../utils/portalApi';

/**
 * runtimeApi — the Learning Runtime client + types. The Runtime consumes the
 * published Timeline; it never edits curriculum. All calls are participant-auth.
 */

export interface RtCard {
  id: string; type: string; title: string; subtitle?: string | null; description?: string | null;
  student_label: string; render_band: string; estimated_time?: number | null; competencies?: any;
  evidence_required?: boolean; video?: { url: string; presenter: string | null; poster: string | null; title?: string | null } | null;
  blog?: { url: string; title?: string | null; excerpt?: string | null; thumbnail?: string | null } | null;
  content?: { title?: string; summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;   // the saved lesson — the workspace opens with it
  course?: { name: string | null; url: string | null; completion?: 'certificate' | 'progress'; sections?: string } | null;   // Skills Course link (skills_jar)
  points?: { learning?: number; builder?: number; community?: number } | null;
  type_thumbnail?: string | null;   // the type's picture — hero banner with the title overlaid
  week_title?: string | null;   // the week's SECTION title from the Blueprint — the Overview card's display title
}
export interface RtOpen { card: RtCard; progress: { status: string; completed_at: string | null } }

export interface SkillScore { key: string; label: string; score: number }
export interface Readiness {
  progression: { xp: { learning: number; builder: number; community: number }; competencies: Array<{ domain_id: string; confidence: number; evidence_count: number }>; level: { slug: string; rank: number; readiness: number } };
  employment: { skills: SkillScore[]; overall: number; band: string; employer_gaps: Array<{ skill: string; need: string }> };
  certification: { domains: Array<{ domain: string; confidence: number; band: string }>; strong: string[]; weak: string[]; confidence: number; pass_probability: number; next_activities: string[] };
  journey: { stages: Array<{ name: string; index: number; contributes: boolean }>; focus_stage: string; why: string };
  evidence: { github: { repos: number; commits: number; prs: number }; portfolio: { entries: number; artifacts: number } };
  portfolio: Array<{ id: string; kind: string; title: string; summary: string | null }>;
}
export interface FieldGuideStatus { uploaded: boolean; uploaded_at: string | null; filename: string | null; size_bytes: number | null }
export interface FieldGuideUploadResult {
  uploaded: boolean; filename: string; size_bytes: number; uploaded_at: string;
  points_awarded: number; already_awarded: boolean;
  artifact: { id: string; kind: string; title: string; summary: string };
}
export interface PromptEval { score: number; architect_score: number; strengths: string[]; gaps: string[]; suggestions: string[]; better_prompt: string }
export interface MentorReply { reply: string; kind: string }
export interface Nudge { struggling: boolean; reasons: string[]; message: string | null }
export interface CardComment { id: string; body: string; author: string; mine: boolean; created_at: string }
export interface SurveyAnswerItem { question: string; rating: number | null; comment: string | null }
export interface SurveyAnswers { items: SurveyAnswerItem[]; open: string | null }
export interface SurveyView { questions: string[]; open_prompt: string | null; answers: SurveyAnswers | null }

// ── Assessments: Knowledge Check (quiz) + Evaluation ─────────────────────────
export type AssessmentKind = 'quiz' | 'evaluation';
export interface AssessmentQ { index: number; question: string; options: string[]; competency: string | null; correct_index?: number; explanation?: string | null }
export interface AssessmentItem {
  question: string; competency: string | null; options: string[];
  selected_index: number | null; correct_index: number; is_correct: boolean;
  explanation: string | null; time_ms: number | null;
}
export interface CompetencyScore { correct: number; total: number; pct: number }
export interface SectionProgress {
  week: number; beginning: number | null; current: number | null; growth: number | null;
  quiz_taken: boolean; evaluation_taken: boolean; evaluation_passed: boolean | null;
  per_competency: Array<{ domain: string; beginning: number | null; current: number | null; delta: number | null }>;
}
export interface AttemptReview {
  kind: AssessmentKind; score: number; correct_count: number; total_count: number;
  passed: boolean | null; pass_threshold: number | null; attempt_number: number;
  items: AssessmentItem[]; competency_scores: Record<string, CompetencyScore>; submitted_at: string | null;
}
export interface AssessmentView {
  kind: AssessmentKind; pass_threshold: number | null; question_count: number;
  questions: AssessmentQ[]; last_attempt: AttemptReview | null; section: SectionProgress | null;
}
export interface AssessmentResult {
  kind: AssessmentKind; score: number; correct_count: number; total_count: number;
  passed: boolean | null; pass_threshold: number | null; attempt_number: number;
  items: AssessmentItem[]; competency_scores: Record<string, CompetencyScore>;
  section: SectionProgress | null; completion: { outcome: any; artifact: any; readiness: Readiness } | null;
}
export interface AssessmentSubmit {
  responses: Array<{ index: number; selected_index: number | null; time_ms?: number | null }>;
  duration_ms?: number | null; started_at?: string | null;
}

// ── The Architect Time Machine (architect_mindset) ───────────────────────────
export interface AmOption { id: string; label: string; custom?: boolean }
export interface AmInterviewQuestion { id: string; text: string; mode: 'single' | 'multiple'; options: AmOption[]; dimension?: string }
export interface AmScenario {
  version: string; week: number; baseline: boolean; title: string; series: string; experience: string;
  principle: string; tagline: string;
  request: { from: string; text: string };
  initial_system: string[];
  first_decision: { prompt: string; options: AmOption[] };
  zoom_out: { people: string[]; information: string[]; decisions: string[]; operations: string[]; titles?: { people?: string; information?: string; decisions?: string; operations?: string } };
  signature_reveals: string[];
  interview_part_1: AmInterviewQuestion[];
  interview_part_2: AmInterviewQuestion[];
  consequence: { horizon: Array<{ point: string; risk: number; note?: string }>; dashboard?: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'flat' }>; reveal: string; lesson: string };
  rearchitecture: { prompt: string };
  receipt: { counts: Array<{ label: string; value: string }>; represented_hours: number; minutes: number; qualification: string };
  adr: { fields: string[]; title?: string };
  project_transfer: { prompt: string; questions: string[] };
  commitment_prompt: string;
}
export interface AmInterviewAnswer { choice?: string | null; choices?: string[]; custom?: string | null; explanation?: string | null }
export interface AmProgress {
  state: string;
  first_decision?: { choice?: string; custom?: string | null; reasoning?: string };
  revised_decision?: { choice?: string; custom?: string | null };
  interview?: Record<string, AmInterviewAnswer>;
  assumptions?: string[]; tradeoffs?: string[]; failure_modes?: string[];
  reflection?: string | null; commitment?: string | null;
  project_transfer?: { assumed_solution?: string; outcome?: string };
  flags?: { zoom_out_viewed?: boolean; consequence_viewed?: boolean };
  evaluation?: { baseline?: boolean; signal?: number; total?: number; stage?: { slug: string; label: string }; dimensions?: Array<{ key: string; label: string; weight: number; score: number; evidence: string; strength: string; gap: string }>; observation?: string; source?: string } | null;
}
export interface AmReceipt { counts: Array<{ label: string; value: string }>; represented_hours: number; minutes: number; ratio: number; qualification: string }
export interface AmLedger { lessons_completed: number; decisions_recorded: number; assumptions_discovered: number; failure_modes_examined: number; perspectives_encountered: number; represented_hours: number }
export interface AmGap { code: string; label: string }
export interface AmStateView { scenario: AmScenario; progress: AmProgress; status: string; receipt: AmReceipt; gaps: AmGap[]; ledger: AmLedger }

export const runtimeApi = {
  open: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}`).then((r) => r.data as RtOpen),
  architectState: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/architect/state`).then((r) => r.data as AmStateView),
  architectAdvance: (cardId: string, to: string, patch?: Partial<AmProgress>) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/architect/advance`, { to, patch }).then((r) => r.data as { state: string; saved: boolean }),
  architectInterview: (cardId: string, part: 1 | 2, answers: Record<string, AmInterviewAnswer>) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/architect/interview`, { part, answers }).then((r) => r.data as { saved: boolean; answered: number }),
  architectEvaluate: (cardId: string) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/architect/evaluate`, {}).then((r) => r.data as { evaluation: AmProgress['evaluation']; gaps: AmGap[] }),
  architectComplete: (cardId: string) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/architect/complete`, {}).then((r) => r.data as { already: boolean; outcome?: any; artifact?: any; readiness?: Readiness; receipt: AmReceipt; evaluation: AmProgress['evaluation']; baseline: boolean; ledger: AmLedger }),
  architectLedger: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/architect/ledger`).then((r) => r.data as { ledger: AmLedger }),
  nudge: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/nudge`).then((r) => r.data as Nudge),
  mentor: (cardId: string, mode: string, message: string, history: Array<{ role: string; content: string }>) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/mentor`, { mode, message, history }).then((r) => r.data as MentorReply),
  reflection: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/reflection`).then((r) => r.data as { questions: string[] }),
  promptLab: (cardId: string, prompt: string, output?: string) => portalApi.post(`/api/portal/runtime/cards/${cardId}/prompt-lab`, { prompt, output }).then((r) => r.data as PromptEval),
  complete: (cardId: string, work?: string, reflection?: string) => portalApi.post(`/api/portal/runtime/cards/${cardId}/complete`, { work, reflection }).then((r) => r.data as { outcome: any; artifact: any; readiness: Readiness }),
  watch: (cardId: string, beat: { delta_s: number; position_s?: number | null; duration_s?: number | null; provider?: string | null }) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/watch`, beat).then((r) => r.data as { watched_pct: number; required_pct: number | null; met: boolean }),
  readiness: () => portalApi.get('/api/portal/runtime/readiness').then((r) => r.data as Readiness),
  saveNote: (cardId: string, body: string, kind = 'note') => portalApi.post('/api/portal/runtime/notebook', { card_id: cardId, kind, body }).then((r) => r.data),
  comments: (cardId: string) => portalApi.get(`/api/portal/classroom/cards/${cardId}/comments`).then((r) => r.data as { comments: CardComment[] }),
  comment: (cardId: string, body: string) => portalApi.post(`/api/portal/classroom/cards/${cardId}/comments`, { body }).then((r) => r.data as { comment: CardComment }),
  survey: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/survey`).then((r) => r.data as SurveyView),
  saveSurvey: (cardId: string, payload: { items: Array<{ index: number; rating: number | null; comment?: string | null }>; open?: string | null }) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/survey`, payload).then((r) => r.data as { saved: true; answers: SurveyAnswers; points_awarded: number }),
  assessment: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/assessment`).then((r) => r.data as AssessmentView),
  submitAssessment: (cardId: string, payload: AssessmentSubmit) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/assessment`, payload).then((r) => r.data as AssessmentResult),
  // Deep Dive Field Guide: read upload status / upload the .html built in Claude Code (+100 pts, once).
  fieldGuideStatus: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/field-guide`).then((r) => r.data as FieldGuideStatus),
  uploadFieldGuide: (cardId: string, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return portalApi.post(`/api/portal/runtime/cards/${cardId}/field-guide`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as FieldGuideUploadResult);
  },
};
