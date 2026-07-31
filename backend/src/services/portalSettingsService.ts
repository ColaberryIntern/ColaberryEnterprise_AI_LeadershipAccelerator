// Student "Settings" page backend. Owns the read + mutations behind
// /api/portal/settings: editable profile fields, the profile photo (avatar),
// and the uploaded resume FILE. Photo + resume are stored as base64 in the DB
// (not on disk) so they survive container redeploys and need no static serving.
//
// Idempotency: every write is a straight overwrite of the target row keyed on
// the authenticated enrollment id, so re-running any call lands the same state.
// Failure-first: validation is pure + total (no throw) and returns a typed
// error the caller maps to a 400; only genuine DB faults bubble to a 500.

import { Enrollment, OnboardingProfile, Cohort } from '../models';
import { award } from './pointsService';

// ── Caps + allow-lists ───────────────────────────────────────────────────────

/** Avatars are client-downscaled; this is a safety ceiling (~675KB decoded). */
export const AVATAR_MAX_CHARS = 900_000;
export const AVATAR_MIME_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

/** Resume file cap. 3MB → ~4MB base64, safely under the 5mb express json limit. */
export const RESUME_MAX_BYTES = 3 * 1024 * 1024;
export const RESUME_ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/rtf': '.rtf',
  'text/rtf': '.rtf',
  'text/plain': '.txt',
  'text/markdown': '.md',
};

const NAME_MAX = 255;
const SHORT_MAX = 120;
const LINKEDIN_MAX = 500;
const LONG_MAX = 600;

// Optional personalization fields (mostly captured from the resume/LinkedIn) and
// experience preferences. Stored in enrollments.intake_data_json (JSONB) — no
// dedicated columns needed.
const PERSONALIZATION_KEYS = ['industry', 'role', 'seniority', 'years_experience', 'location', 'goals', 'skills'] as const;
const PREF_STRING_KEYS = ['timezone', 'weekly_hours', 'primary_goal', 'preferred_contact', 'experience_level'] as const;
const PREF_BOOL_KEYS = ['email_updates', 'event_reminders', 'weekly_digest', 'community_visible'] as const;
type PersonalizationKey = typeof PERSONALIZATION_KEYS[number];
type PrefStringKey = typeof PREF_STRING_KEYS[number];
type PrefBoolKey = typeof PREF_BOOL_KEYS[number];

// ── Types ────────────────────────────────────────────────────────────────────

export interface SettingsView {
  account: {
    id: string;
    full_name: string;
    email: string;
    tier: string;
    enrollment_type: string;
    status: string;
    cohort_name: string | null;
    member_since: Date | null;
  };
  profile: {
    title: string | null;
    company: string | null;
    company_size: string | null;
    phone: string | null;
    linkedin_url: string | null;
  };
  avatar_data_url: string | null;
  resume: { file_name: string; mime: string | null; size_bytes: number; uploaded_at: Date | null } | null;
  personalization: Record<PersonalizationKey, string | null>;
  preferences: Record<PrefStringKey, string | null> & Record<PrefBoolKey, boolean>;
}

export interface ProfilePatchInput {
  full_name?: unknown;
  title?: unknown;
  company?: unknown;
  company_size?: unknown;
  phone?: unknown;
  linkedin_url?: unknown;
  personalization?: unknown;
  preferences?: unknown;
}

export interface SanitizedProfilePatch {
  enrollment: { full_name?: string; title?: string; company?: string; company_size?: string; phone?: string };
  linkedin_url?: string | null;
  intake?: { personalization?: Record<string, string>; preferences?: Record<string, string | boolean> };
}

export type Validation = { ok: true } | { ok: false; error: string };

// ── Pure validators / sanitizers (exported for unit tests) ───────────────────

/** Approx decoded byte length of a base64 string (ignoring whitespace/padding). */
export function base64Bytes(b64: string): number {
  const clean = (b64 || '').replace(/\s/g, '');
  if (!clean) return 0;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

export function validateAvatarDataUrl(dataUrl: unknown): Validation {
  if (typeof dataUrl !== 'string' || !dataUrl) return { ok: false, error: 'A base64 image data URL is required' };
  if (dataUrl.length > AVATAR_MAX_CHARS) return { ok: false, error: 'Image is too large — please use a smaller photo' };
  if (!AVATAR_MIME_RE.test(dataUrl)) return { ok: false, error: 'Only PNG, JPEG, WEBP or GIF images are accepted' };
  return { ok: true };
}

export interface ResumeUploadInput { file_name?: unknown; mime?: unknown; data_base64?: unknown }

export function validateResumeUpload(input: ResumeUploadInput): Validation {
  const name = typeof input.file_name === 'string' ? input.file_name.trim() : '';
  const mime = typeof input.mime === 'string' ? input.mime : '';
  const data = typeof input.data_base64 === 'string' ? input.data_base64 : '';
  if (!name) return { ok: false, error: 'A file name is required' };
  if (!data) return { ok: false, error: 'File data is required' };
  if (!RESUME_ALLOWED_MIME[mime]) return { ok: false, error: 'Accepted file types: PDF, Word, RTF, Text, Markdown' };
  if (base64Bytes(data) > RESUME_MAX_BYTES) return { ok: false, error: 'Resume must be 3 MB or smaller' };
  return { ok: true };
}

/** Trim, cap, and normalise the editable profile fields. Only provided keys are
 *  written, so a patch never blanks a field the client didn't send. Empty-string
 *  clears an optional field (except full_name, which must stay non-empty). */
export function sanitizeProfilePatch(input: ProfilePatchInput): { ok: true; patch: SanitizedProfilePatch } | { ok: false; error: string } {
  const patch: SanitizedProfilePatch = { enrollment: {} };
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

  if (input.full_name !== undefined) {
    const name = str(input.full_name, NAME_MAX);
    if (!name) return { ok: false, error: 'Name cannot be empty' };
    patch.enrollment.full_name = name;
  }
  if (input.title !== undefined) patch.enrollment.title = str(input.title, NAME_MAX) ?? '';
  if (input.company !== undefined) patch.enrollment.company = str(input.company, NAME_MAX) ?? '';
  if (input.company_size !== undefined) patch.enrollment.company_size = str(input.company_size, SHORT_MAX) ?? '';
  if (input.phone !== undefined) patch.enrollment.phone = str(input.phone, SHORT_MAX) ?? '';

  if (input.linkedin_url !== undefined) {
    const url = str(input.linkedin_url, LINKEDIN_MAX) ?? '';
    if (url && !/^https?:\/\/([\w-]+\.)*linkedin\.com\//i.test(url)) {
      return { ok: false, error: 'Enter a valid LinkedIn profile URL (https://www.linkedin.com/…)' };
    }
    patch.linkedin_url = url || null;
  }

  // Optional personalization + preferences → intake_data_json (whitelisted keys only).
  const intake: { personalization?: Record<string, string>; preferences?: Record<string, string | boolean> } = {};
  if (input.personalization && typeof input.personalization === 'object') {
    const src = input.personalization as Record<string, unknown>;
    const p: Record<string, string> = {};
    for (const k of PERSONALIZATION_KEYS) if (src[k] !== undefined) p[k] = str(src[k], LONG_MAX) ?? '';
    if (Object.keys(p).length) intake.personalization = p;
  }
  if (input.preferences && typeof input.preferences === 'object') {
    const src = input.preferences as Record<string, unknown>;
    const pref: Record<string, string | boolean> = {};
    for (const k of PREF_STRING_KEYS) if (src[k] !== undefined) pref[k] = str(src[k], SHORT_MAX) ?? '';
    for (const k of PREF_BOOL_KEYS) if (src[k] !== undefined) pref[k] = !!src[k];
    if (Object.keys(pref).length) intake.preferences = pref;
  }
  if (intake.personalization || intake.preferences) patch.intake = intake;

  const touchesEnrollment = Object.keys(patch.enrollment).length > 0;
  if (!touchesEnrollment && patch.linkedin_url === undefined && !patch.intake) {
    return { ok: false, error: 'No changes provided' };
  }
  return { ok: true, patch };
}

/** Defaulted personalization + preferences view from an enrollment's intake JSON. */
function readIntakeViews(intakeRaw: unknown): Pick<SettingsView, 'personalization' | 'preferences'> {
  const intake = (intakeRaw && typeof intakeRaw === 'object') ? (intakeRaw as any) : {};
  const per = (intake.personalization && typeof intake.personalization === 'object') ? intake.personalization : {};
  const pref = (intake.preferences && typeof intake.preferences === 'object') ? intake.preferences : {};
  const personalization = {} as Record<PersonalizationKey, string | null>;
  for (const k of PERSONALIZATION_KEYS) personalization[k] = per[k] || null;
  const preferences = {} as Record<PrefStringKey, string | null> & Record<PrefBoolKey, boolean>;
  for (const k of PREF_STRING_KEYS) preferences[k] = pref[k] || null;
  for (const k of PREF_BOOL_KEYS) preferences[k] = pref[k] === undefined ? true : !!pref[k]; // default opted-in
  return { personalization, preferences };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getSettings(enrollmentId: string): Promise<SettingsView | null> {
  const e: any = await Enrollment.findByPk(enrollmentId, {
    include: [
      { model: OnboardingProfile, as: 'onboardingProfile', required: false },
      { model: Cohort, as: 'cohort', required: false },
    ],
  });
  if (!e) return null;
  const op = e.onboardingProfile || null;
  return {
    account: {
      id: e.id,
      full_name: e.full_name,
      email: e.email,
      tier: e.tier || 'member',
      enrollment_type: e.enrollment_type || 'standard',
      status: e.status || 'active',
      cohort_name: e.cohort?.name ?? null,
      member_since: e.created_at ?? null,
    },
    profile: {
      title: e.title || null,
      company: e.company || null,
      company_size: e.company_size || null,
      phone: e.phone || null,
      linkedin_url: op?.linkedin_url || null,
    },
    avatar_data_url: e.avatar_data_url || null,
    resume: op?.resume_file_name
      ? {
          file_name: op.resume_file_name,
          mime: op.resume_mime || null,
          size_bytes: base64Bytes(op.resume_data || ''),
          uploaded_at: op.resume_uploaded_at || null,
        }
      : null,
    ...readIntakeViews(e.intake_data_json),
  };
}

/** Fetch the decoded resume file for an authenticated download. */
export async function getResumeFile(
  enrollmentId: string,
): Promise<{ file_name: string; mime: string; buffer: Buffer } | null> {
  const op: any = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  if (!op || !op.resume_data || !op.resume_file_name) return null;
  return {
    file_name: op.resume_file_name,
    mime: op.resume_mime || 'application/octet-stream',
    buffer: Buffer.from(op.resume_data, 'base64'),
  };
}

// ── Writes (idempotent overwrites keyed on enrollment id) ────────────────────

/** Upsert the onboarding-profile row so avatar/resume writes never miss. */
async function onboardingRow(enrollmentId: string): Promise<any> {
  const existing = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  if (existing) return existing;
  return OnboardingProfile.create({ enrollment_id: enrollmentId } as any);
}

export async function updateProfile(enrollmentId: string, patch: SanitizedProfilePatch): Promise<SettingsView | null> {
  const e: any = await Enrollment.findByPk(enrollmentId);
  if (!e) return null;
  if (Object.keys(patch.enrollment).length > 0) await e.update(patch.enrollment);
  if (patch.linkedin_url !== undefined) {
    const op = await onboardingRow(enrollmentId);
    await op.update({ linkedin_url: patch.linkedin_url });
  }
  if (patch.intake) {
    // Deep-merge into the existing intake JSON so we never drop other keys.
    const cur = (e.intake_data_json && typeof e.intake_data_json === 'object') ? e.intake_data_json : {};
    const merged = {
      ...cur,
      personalization: { ...(cur.personalization || {}), ...(patch.intake.personalization || {}) },
      preferences: { ...(cur.preferences || {}), ...(patch.intake.preferences || {}) },
    };
    await e.update({ intake_data_json: merged });
  }
  return getSettings(enrollmentId);
}

export async function setAvatar(enrollmentId: string, dataUrl: string): Promise<SettingsView | null> {
  const e = await Enrollment.findByPk(enrollmentId);
  if (!e) return null;
  await (e as any).update({ avatar_data_url: dataUrl });
  return getSettings(enrollmentId);
}

export async function clearAvatar(enrollmentId: string): Promise<SettingsView | null> {
  const e = await Enrollment.findByPk(enrollmentId);
  if (!e) return null;
  await (e as any).update({ avatar_data_url: null });
  return getSettings(enrollmentId);
}

export async function setResume(
  enrollmentId: string,
  input: { file_name: string; mime: string; data_base64: string },
): Promise<SettingsView | null> {
  const e = await Enrollment.findByPk(enrollmentId);
  if (!e) return null;
  const op = await onboardingRow(enrollmentId);
  const cleanB64 = input.data_base64.replace(/\s/g, '');
  await op.update({
    resume_file_name: input.file_name.slice(0, NAME_MAX),
    resume_mime: input.mime,
    resume_data: cleanB64,
    resume_uploaded_at: new Date(),
  });

  // "Upload resume / LinkedIn" onboarding step — idempotent per enrollment
  // (award() dedupes on eventKey), so re-uploading never double-awards.
  await award(enrollmentId, { eventType: 'profile_completed' });

  // Parse the uploaded resume (pdf/docx/rtf/txt) and prefill the profile from it.
  // Runs inline so the profile is ready when the client re-reads the prefill.
  // Fully best-effort — a parse/LLM failure never fails the upload.
  try {
    const { extractTextFromBuffer } = await import('./fileExtractionService');
    const { ingestResumeFileText } = await import('./resumeIngestService');
    const text = await extractTextFromBuffer(Buffer.from(cleanB64, 'base64'), input.file_name);
    if (text && text.trim().length > 40) await ingestResumeFileText(enrollmentId, text);
  } catch (err: any) {
    console.warn('[Settings] resume parse (non-fatal):', err?.message);
  }

  return getSettings(enrollmentId);
}

export async function clearResume(enrollmentId: string): Promise<SettingsView | null> {
  const e = await Enrollment.findByPk(enrollmentId);
  if (!e) return null;
  const op = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  if (op) {
    await (op as any).update({
      resume_file_name: null,
      resume_mime: null,
      resume_data: null,
      resume_uploaded_at: null,
    });
  }
  return getSettings(enrollmentId);
}
