import { OnboardingProfile } from '../models';
import type { ProjectDnaInput } from './projectDnaService';

const EXTRACTION_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const MAX_SOURCE_CHARS = 8000;

/**
 * The structured shape we ask the model to extract from a resume / LinkedIn
 * profile. Every field is best-effort — the model omits what it can't infer.
 */
export interface ResumeExtraction {
  industry?: string;
  role?: string;
  seniority?: string;
  company_name?: string;
  target_user?: string;
  business_problem?: string;
  industry_track?: string;
  ai_maturity_level?: number;
  skills?: string[];
}

export interface BackgroundPrefill {
  projectDna: Partial<ProjectDnaInput>;
  variables: Record<string, string>;
}

/** Build the extraction prompt (pure). Asks for strict JSON only. */
export function buildResumeExtractionPrompt(sourceText: string): string {
  const text = (sourceText || '').slice(0, MAX_SOURCE_CHARS);
  return [
    'Extract a structured professional background from the resume / LinkedIn text below.',
    'Return ONLY minified JSON (no prose, no code fences) with these optional keys:',
    '{"industry","role","seniority","company_name","target_user","business_problem",',
    '"industry_track","ai_maturity_level"(0-5 integer),"skills"(string array)}.',
    'Omit any key you cannot infer. Do not invent facts.',
    '',
    '--- BACKGROUND TEXT ---',
    text,
  ].join('\n');
}

/** Safely parse the model's JSON reply (pure): tolerates code fences / stray prose. */
export function parseExtractionJson(raw: string): ResumeExtraction | null {
  if (!raw) return null;
  let s = raw.trim();
  // strip ```json ... ``` fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // fall back to the first {...} block
  if (s[0] !== '{') {
    const brace = s.match(/\{[\s\S]*\}/);
    if (brace) s = brace[0];
  }
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' ? (parsed as ResumeExtraction) : null;
  } catch {
    return null;
  }
}

/** Map an extraction to a ProjectDna prefill + AI-context variables (pure). Only present fields are included. */
export function mapExtractionToPrefill(extraction: ResumeExtraction | null): BackgroundPrefill {
  const projectDna: Partial<ProjectDnaInput> = {};
  const variables: Record<string, string> = {};
  if (!extraction) return { projectDna, variables };

  if (extraction.industry) { projectDna.industry = extraction.industry; variables.industry = extraction.industry; }
  if (extraction.industry_track) projectDna.industryTrack = extraction.industry_track;
  if (extraction.target_user) projectDna.targetUser = extraction.target_user;
  if (extraction.business_problem) projectDna.businessProblem = extraction.business_problem;
  if (extraction.role) variables.role = extraction.role;
  if (extraction.seniority) variables.seniority = extraction.seniority;
  if (extraction.company_name) variables.company_name = extraction.company_name;
  if (typeof extraction.ai_maturity_level === 'number') variables.ai_maturity_level = String(extraction.ai_maturity_level);
  if (Array.isArray(extraction.skills) && extraction.skills.length) variables.skills = extraction.skills.join(', ');

  return { projectDna, variables };
}

/** Default LLM extractor (real OpenAI call). Injectable so tests stay deterministic. */
async function realExtract(sourceText: string): Promise<string> {
  const { getInstrumentedOpenAI } = await import('./openaiInstrumented');
  const openai = getInstrumentedOpenAI({ workflow_id: 'resume_ingest' }, { timeout: 60000, maxRetries: 1 });
  const response = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: 'system', content: 'You extract structured professional background as strict JSON. Never invent facts.' },
      { role: 'user', content: buildResumeExtractionPrompt(sourceText) },
    ],
    temperature: 0.1,
    max_tokens: 800,
  });
  return response.choices[0]?.message?.content || '';
}

/** Merge-upsert the onboarding profile — only provided fields are written. */
async function saveOnboardingProfile(
  enrollmentId: string,
  fields: { resume_text?: string | null; linkedin_url?: string | null; prefill?: any; extracted?: any },
): Promise<void> {
  const patch: Record<string, any> = {};
  if (fields.resume_text !== undefined) patch.resume_text = fields.resume_text;
  if (fields.linkedin_url !== undefined) patch.linkedin_url = fields.linkedin_url;
  if (fields.prefill !== undefined) patch.prefill = fields.prefill;
  if (fields.extracted !== undefined) patch.extracted = fields.extracted;

  const existing = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  if (existing) {
    await (existing as any).update(patch);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
    await OnboardingProfile.create({ enrollment_id: enrollmentId, ...patch } as any);
  }
}

export interface IngestInput { resumeText?: string; linkedinUrl?: string; }
export interface IngestDeps { extract: (sourceText: string) => Promise<string>; }
export interface IngestResult {
  ok: boolean;
  reason?: string;
  parsed: boolean;
  prefill: Partial<ProjectDnaInput>;
  variables: Record<string, string>;
  linkedin_url: string | null;
}

/**
 * Ingest a resume/LinkedIn during onboarding and persist a background prefill
 * that seeds the ProjectDnaWizard. Best-effort: an LLM/parse failure never fails
 * onboarding (returns parsed:false with an empty prefill). Does NOT fire
 * requirements generation — the student confirms the wizard first.
 */
export async function ingestBackground(
  enrollmentId: string,
  input: IngestInput,
  deps: IngestDeps = { extract: realExtract },
): Promise<IngestResult> {
  const resumeText = (input.resumeText || '').trim();
  const linkedinUrl = (input.linkedinUrl || '').trim() || null;
  if (!resumeText && !linkedinUrl) {
    return { ok: false, reason: 'no_input', parsed: false, prefill: {}, variables: {}, linkedin_url: null };
  }

  let extraction: ResumeExtraction | null = null;
  if (resumeText) {
    try {
      extraction = parseExtractionJson(await deps.extract(resumeText));
    } catch (err: any) {
      console.warn('[ResumeIngest] extraction failed (non-fatal):', err?.message);
    }
  }

  const { projectDna, variables } = mapExtractionToPrefill(extraction);

  await saveOnboardingProfile(enrollmentId, {
    resume_text: resumeText || undefined,
    linkedin_url: linkedinUrl || undefined,
    prefill: projectDna,
    extracted: extraction ?? undefined,
  });

  return { ok: true, parsed: !!extraction, prefill: projectDna, variables, linkedin_url: linkedinUrl };
}

/** The stored prefill for seeding the wizard (frontend GET). */
export async function getOnboardingProfile(enrollmentId: string): Promise<{
  prefill: Partial<ProjectDnaInput>;
  linkedin_url: string | null;
  has_resume: boolean;
}> {
  const row: any = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  if (!row) return { prefill: {}, linkedin_url: null, has_resume: false };
  return {
    prefill: row.prefill || {},
    linkedin_url: row.linkedin_url || null,
    has_resume: !!row.resume_text,
  };
}
