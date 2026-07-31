import { OnboardingProfile } from '../models';
import type { ProjectDnaInput } from './projectDnaService';
import { award } from './pointsService';

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
  // Profile fields (for the Settings form) + richer personalization.
  full_name?: string;
  title?: string;           // current job title
  phone?: string;
  company_size?: string;    // e.g. "51-200"
  years_experience?: string;
  location?: string;
  goals?: string;           // one-line career/learning goal
  linkedin_url?: string;
}

/** Flat profile fields the Settings form prefills from. */
export interface ProfilePrefill {
  full_name?: string;
  title?: string;
  company?: string;
  company_size?: string;
  phone?: string;
  linkedin_url?: string;
}

/** Optional personalization captured from the resume/LinkedIn (stored, shown behind an expander). */
export interface PersonalizationPrefill {
  industry?: string;
  role?: string;
  seniority?: string;
  years_experience?: string;
  skills?: string;
  goals?: string;
  location?: string;
  ai_maturity_level?: string;
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
    'Return ONLY minified JSON (no prose, no code fences) with these keys:',
    '{"full_name","title"(their most recent/current job title),"company_name","company_size"(employees, e.g. "51-200"),',
    '"phone","location","linkedin_url","industry","role","seniority","years_experience",',
    '"goals"(one short sentence on their career/learning goal),"target_user","business_problem",',
    '"industry_track","ai_maturity_level"(0-5 integer),"skills"(string array of the top 6)}.',
    'ALWAYS provide "title" (their last job title) and "industry" — if the industry is not stated,',
    'infer it from the company and role (e.g. a lending company → "Financial Services", a hospital → "Healthcare").',
    'Only omit a key when there is genuinely no basis to infer it. Do not invent specific facts (names, numbers).',
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

/** Map an extraction to flat profile fields + personalization (pure). Only present fields included. */
export function mapExtractionToProfile(e: ResumeExtraction | null): { profile: ProfilePrefill; personalization: PersonalizationPrefill } {
  const profile: ProfilePrefill = {};
  const personalization: PersonalizationPrefill = {};
  if (!e) return { profile, personalization };

  if (e.full_name) profile.full_name = e.full_name;
  if (e.title || e.role) profile.title = e.title || e.role;
  if (e.company_name) profile.company = e.company_name;
  if (e.company_size) profile.company_size = e.company_size;
  if (e.phone) profile.phone = e.phone;
  if (e.linkedin_url) profile.linkedin_url = e.linkedin_url;

  if (e.industry) personalization.industry = e.industry;
  if (e.role) personalization.role = e.role;
  if (e.seniority) personalization.seniority = e.seniority;
  if (e.years_experience) personalization.years_experience = e.years_experience;
  if (Array.isArray(e.skills) && e.skills.length) personalization.skills = e.skills.join(', ');
  if (e.goals) personalization.goals = e.goals;
  if (e.location) personalization.location = e.location;
  if (typeof e.ai_maturity_level === 'number') personalization.ai_maturity_level = String(e.ai_maturity_level);

  return { profile, personalization };
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
  prefill: Partial<ProjectDnaInput>;               // ProjectDNA seed (onboarding wizard)
  profile: ProfilePrefill;                         // Settings profile fields (name/title/company/…)
  personalization: PersonalizationPrefill;         // optional personalization (industry/goals/…)
  variables: Record<string, string>;
  linkedin_url: string | null;
}

/** Run the LLM extraction on source text → all derived shapes (best-effort). */
async function runExtraction(sourceText: string, deps: IngestDeps): Promise<{
  extraction: ResumeExtraction | null;
  projectDna: Partial<ProjectDnaInput>;
  variables: Record<string, string>;
  profile: ProfilePrefill;
  personalization: PersonalizationPrefill;
}> {
  let extraction: ResumeExtraction | null = null;
  if (sourceText) {
    try {
      extraction = parseExtractionJson(await deps.extract(sourceText));
    } catch (err: any) {
      console.warn('[ResumeIngest] extraction failed (non-fatal):', err?.message);
    }
  }
  const { projectDna, variables } = mapExtractionToPrefill(extraction);
  const { profile, personalization } = mapExtractionToProfile(extraction);
  return { extraction, projectDna, variables, profile, personalization };
}

/**
 * Ingest a resume/LinkedIn during onboarding and persist a background prefill
 * that seeds the ProjectDnaWizard AND the Settings profile. Best-effort: an
 * LLM/parse failure never fails onboarding (returns parsed:false, empty prefill).
 */
export async function ingestBackground(
  enrollmentId: string,
  input: IngestInput,
  deps: IngestDeps = { extract: realExtract },
): Promise<IngestResult> {
  const resumeText = (input.resumeText || '').trim();
  const linkedinUrl = (input.linkedinUrl || '').trim() || null;
  if (!resumeText && !linkedinUrl) {
    return { ok: false, reason: 'no_input', parsed: false, prefill: {}, profile: {}, personalization: {}, variables: {}, linkedin_url: null };
  }

  const { extraction, projectDna, variables, profile, personalization } = await runExtraction(resumeText, deps);
  // linkedin_url from the resume falls back onto the profile prefill.
  if (linkedinUrl && !profile.linkedin_url) profile.linkedin_url = linkedinUrl;

  await saveOnboardingProfile(enrollmentId, {
    resume_text: resumeText || undefined,
    linkedin_url: linkedinUrl || profile.linkedin_url || undefined,
    prefill: { ...projectDna, profile, personalization },
    extracted: extraction ?? undefined,
  });

  // "Upload resume / LinkedIn" onboarding step — idempotent per enrollment
  // (award() dedupes on eventKey), so re-ingesting never double-awards.
  if (resumeText || linkedinUrl || profile.linkedin_url) {
    await award(enrollmentId, { eventType: 'profile_completed' });
  }

  return { ok: true, parsed: !!extraction, prefill: projectDna, profile, personalization, variables, linkedin_url: linkedinUrl || profile.linkedin_url || null };
}

/**
 * Ingest already-extracted resume FILE text (Settings .pdf/.docx upload). Runs
 * the same extraction and merges the profile/personalization prefill WITHOUT
 * overwriting the stored resume file metadata.
 */
export async function ingestResumeFileText(
  enrollmentId: string,
  extractedText: string,
  deps: IngestDeps = { extract: realExtract },
): Promise<IngestResult> {
  const text = (extractedText || '').trim();
  if (!text) return { ok: false, reason: 'no_text', parsed: false, prefill: {}, profile: {}, personalization: {}, variables: {}, linkedin_url: null };

  const { extraction, projectDna, variables, profile, personalization } = await runExtraction(text, deps);

  // Merge into the existing prefill; don't clobber resume file fields or a prior linkedin.
  const existing: any = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  const priorPrefill = (existing?.prefill && typeof existing.prefill === 'object') ? existing.prefill : {};
  await saveOnboardingProfile(enrollmentId, {
    prefill: { ...priorPrefill, ...projectDna, profile, personalization },
    extracted: extraction ?? undefined,
  });

  return { ok: true, parsed: !!extraction, prefill: projectDna, profile, personalization, variables, linkedin_url: profile.linkedin_url || null };
}

/** The stored prefill for seeding the wizard + Settings profile (frontend GET). */
export async function getOnboardingProfile(enrollmentId: string): Promise<{
  prefill: Partial<ProjectDnaInput>;
  profile: ProfilePrefill;
  personalization: PersonalizationPrefill;
  linkedin_url: string | null;
  has_resume: boolean;
}> {
  const row: any = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  if (!row) return { prefill: {}, profile: {}, personalization: {}, linkedin_url: null, has_resume: false };
  const p = (row.prefill && typeof row.prefill === 'object') ? row.prefill : {};
  return {
    prefill: p,
    profile: p.profile || {},
    personalization: p.personalization || {},
    linkedin_url: row.linkedin_url || null,
    // True when the student has EITHER extracted resume text (onboarding paste)
    // or an uploaded resume file (Settings), so the Today onboarding step and
    // the Settings badge agree.
    has_resume: !!(row.resume_text || row.resume_file_name),
  };
}
