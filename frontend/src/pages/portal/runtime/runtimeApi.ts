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
export interface PromptEval { score: number; architect_score: number; strengths: string[]; gaps: string[]; suggestions: string[]; better_prompt: string }
export interface MentorReply { reply: string; kind: string }
export interface CardComment { id: string; body: string; author: string; mine: boolean; created_at: string }

export const runtimeApi = {
  open: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}`).then((r) => r.data as RtOpen),
  mentor: (cardId: string, mode: string, message: string, history: Array<{ role: string; content: string }>) =>
    portalApi.post(`/api/portal/runtime/cards/${cardId}/mentor`, { mode, message, history }).then((r) => r.data as MentorReply),
  reflection: (cardId: string) => portalApi.get(`/api/portal/runtime/cards/${cardId}/reflection`).then((r) => r.data as { questions: string[] }),
  promptLab: (cardId: string, prompt: string, output?: string) => portalApi.post(`/api/portal/runtime/cards/${cardId}/prompt-lab`, { prompt, output }).then((r) => r.data as PromptEval),
  complete: (cardId: string, work?: string, reflection?: string) => portalApi.post(`/api/portal/runtime/cards/${cardId}/complete`, { work, reflection }).then((r) => r.data as { outcome: any; artifact: any; readiness: Readiness }),
  readiness: () => portalApi.get('/api/portal/runtime/readiness').then((r) => r.data as Readiness),
  saveNote: (cardId: string, body: string, kind = 'note') => portalApi.post('/api/portal/runtime/notebook', { card_id: cardId, kind, body }).then((r) => r.data),
  comments: (cardId: string) => portalApi.get(`/api/portal/classroom/cards/${cardId}/comments`).then((r) => r.data as { comments: CardComment[] }),
  comment: (cardId: string, body: string) => portalApi.post(`/api/portal/classroom/cards/${cardId}/comments`, { body }).then((r) => r.data as { comment: CardComment }),
};
