/**
 * portfolioService — auto-builds the student's employable portfolio. When a
 * student completes an evidence activity, the Runtime generates a real artifact
 * (architecture doc, prompt library, case study, reflection, implementation
 * notes) from their work — no manual portfolio building. LLM-backed with a
 * deterministic fallback so completion never fails on the AI path.
 */
import { chatJson } from './runtimeAi';
import PortfolioArtifact from '../../models/PortfolioArtifact';

interface CardCtx { id: string; type: string; title: string; description?: string | null; competencies?: any }

const KIND_BY_TYPE: Record<string, string> = {
  prompt_lab: 'prompt_library', prompt_challenge: 'prompt_library',
  implementation_task: 'architecture_doc', project_task: 'architecture_doc', internship_activity: 'architecture_doc',
  artifact_submission: 'case_study',
  presentation: 'presentation', demo: 'presentation', build_story: 'case_study',
  reflection: 'reflection', ai_video_feedback: 'reflection', mock_interview: 'case_study',
};

export async function generateArtifact(enrollmentId: string, card: CardCtx, work: string) {
  const kind = KIND_BY_TYPE[card.type] || 'case_study';
  const comps = Array.isArray(card.competencies) ? card.competencies.map((c: any) => c.domain_id || c) : [];
  let title = `${card.title} — ${kind.replace('_', ' ')}`;
  let summary = `Portfolio artifact generated from "${card.title}".`;
  let content: any = { work: (work || '').slice(0, 4000), kind };

  try {
    const system = 'You convert a student\'s completed activity into a polished, employer-facing portfolio artifact for an AI Systems Architect. Return STRICT json.';
    const user = `Activity: "${card.title}" (${card.type}). Artifact kind: ${kind}.\nStudent work / notes:\n"""${(work || '').slice(0, 3000)}"""\n` +
      `Return json { "title": string, "summary": string (2 sentences, employer-facing), "sections": [{"heading": string, "body": string}], "skills_demonstrated": string[] }.`;
    const r = await chatJson('runtime_portfolio', system, user, undefined, 1400);
    if (r.parsed?.title) { title = String(r.parsed.title); summary = String(r.parsed.summary || summary); content = { sections: r.parsed.sections || [], skills_demonstrated: r.parsed.skills_demonstrated || [], kind }; }
  } catch { /* keep deterministic fallback */ }

  const artifact = await PortfolioArtifact.create({ enrollment_id: enrollmentId, card_id: card.id, kind, title, summary, content, competencies: comps });
  return artifact.toJSON();
}

export async function listArtifacts(enrollmentId: string) {
  const rows = await PortfolioArtifact.findAll({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']], limit: 100 });
  return rows.map((r) => r.toJSON());
}
