import type { AlumniRecord } from './alumniDataService';

// ── Types ────────────────────────────────────────────────────────────────

export type CareerStage = 'early_alumni' | 'mid_alumni' | 'senior_alumni';
export type ProgramType = 'data_analytics_bootcamp' | 'data_analytics_short_course' | 'legacy_program' | 'other';
export type EngagementStatus = 'interview_active' | 'practice_active' | 'inactive';

export interface AlumniContext {
  hired_date: string | null;
  register_date: string | null;
  years_since_hire: number | null;
  years_since_registration: number | null;
  alumni_cohort: string | null;
  career_stage: CareerStage | null;
  class_name: string | null;
  program_type: ProgramType | null;
  last_activity_section: string | null;
  engagement_status: EngagementStatus | null;
  mentor: string | null;
}

// ── Derivation Functions ─────────────────────────────────────────────────

function yearsSince(date: Date | null): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export function deriveCareerStage(yearsSinceHire: number | null): CareerStage | null {
  if (yearsSinceHire === null) return null;
  if (yearsSinceHire <= 1) return 'early_alumni';
  if (yearsSinceHire <= 4) return 'mid_alumni';
  return 'senior_alumni';
}

export function deriveProgramType(className: string | null): ProgramType | null {
  if (!className || !className.trim()) return 'other';
  const upper = className.toUpperCase();
  if (upper.includes('BOOTCAMP')) return 'data_analytics_bootcamp';
  if (upper.includes('DATA ANALYTICS')) return 'data_analytics_short_course';
  return 'legacy_program';
}

export function deriveEngagementStatus(lastActivitySection: string | null): EngagementStatus | null {
  if (!lastActivitySection || !lastActivitySection.trim()) return 'inactive';
  const upper = lastActivitySection.toUpperCase();
  if (upper.includes('INTERVIEW')) return 'interview_active';
  if (upper.includes('MOCK')) return 'practice_active';
  return 'inactive';
}

// ── Main Builder ─────────────────────────────────────────────────────────

/**
 * Build a complete alumni context object from a raw MSSQL alumni record.
 * All derived fields are deterministic — no AI involved.
 */
export function buildAlumniContext(record: AlumniRecord): AlumniContext {
  const ySinceHire = yearsSince(record.HiredDate);
  const ySinceReg = yearsSince(record.RegisterDate_DAY);

  const hiredDate = record.HiredDate ? new Date(record.HiredDate) : null;
  const registerDate = record.RegisterDate_DAY ? new Date(record.RegisterDate_DAY) : null;

  // Alumni cohort = year of registration (or hire if no registration date)
  const cohortDate = registerDate || hiredDate;
  const cohort = cohortDate && !isNaN(cohortDate.getTime())
    ? String(cohortDate.getFullYear())
    : null;

  return {
    hired_date: hiredDate && !isNaN(hiredDate.getTime()) ? hiredDate.toISOString().split('T')[0] : null,
    register_date: registerDate && !isNaN(registerDate.getTime()) ? registerDate.toISOString().split('T')[0] : null,
    years_since_hire: ySinceHire,
    years_since_registration: ySinceReg,
    alumni_cohort: cohort,
    career_stage: deriveCareerStage(ySinceHire),
    class_name: record.ClassName || null,
    program_type: deriveProgramType(record.ClassName),
    last_activity_section: record.LastActivitySection || null,
    engagement_status: deriveEngagementStatus(record.LastActivitySection),
    mentor: record.Mentor || null,
  };
}
