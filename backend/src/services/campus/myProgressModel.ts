import { normalizeEducation } from '../resumeHistory';

/**
 * C120 (Ali 2026-11-06, approved design C120_1_ONE_PAGE): the campus "My Progress" room's front screen is a celebration of the
 * learner. This module is the PURE half: it turns what the service read (enrollment, week breakdown, points, XP, milestones, the
 * resume extraction) into the payload the screen draws. No I/O, so every rule is unit-tested.
 *
 * PRIVACY (the design's hard rule): the resume extraction also holds full_name, phone, location, linkedin_url and more. Nothing
 * here spreads or copies the extraction; `backgroundFrom` reads a fixed allow-list of fields (title/role, company_name, industry,
 * years_experience, skills, education) and nothing else, so a new extracted key can never ride along. The first name comes from
 * the enrollment, never from the resume.
 *
 * Nothing is invented: a field the learner has not given is left out (null), never guessed.
 */

export interface MyProgressWeek { current: number; total: number; cohortName: string | null; cardsDoneThisWeek: number; cardsThisWeek: number }
export interface MyProgressPoints { total: number; level: number | null; levelName: string | null; builder: number; learning: number; community: number }
export interface MyProgressWin { title: string; date: string }
export interface MyProgressMilestone { key: string; label: string; date: string | null }
export interface MyProgressNext { key: string; label: string; detail: string }
export interface MyProgressBackground { title: string | null; company: string | null; industry: string | null; years: string | null; skills: string[]; education: string | null }
export interface MyProgressPayload {
  firstName: string | null;
  week: MyProgressWeek | null;
  points: MyProgressPoints;
  latestWin: MyProgressWin | null;
  milestones: { earned: MyProgressMilestone[]; next: MyProgressNext | null };
  background: MyProgressBackground | null;
  goal: string | null;
  hasResume: boolean;
}

/** What the service read; every field is already scoped to the signed-in enrollment. */
export interface MyProgressInputs {
  enrollment: { full_name: string | null; cohort_name: string | null; intake_data_json: unknown };
  /** null when the learner has no cohort (no scheduled week to show). */
  weeks: { scheduledWeek: number; rows: Array<{ week: number | null; publishedCardCount: number; completed: number }> } | null;
  pointsTotal: number;
  rungName: string | null;
  xp: { builder: number; learning: number; community: number };
  milestones: Array<{ milestone_type: string; source_ref: string; achieved_at: Date | string | null; evidence: unknown }>;
  latestCard: { title: string; completed_at: Date | string } | null;
  profile: { resume_file_name: string | null; extracted: unknown } | null;
}

export const MAX_SKILLS = 6;
const SHORT = 120;
const LONG = 240;
export const CURRICULUM_WEEKS_FALLBACK = 12;

/** The whole ladder, lowest first: the free points rungs, then the build rungs. "Lv N" is a rung's place here (the frontend's
 *  bandLadder.RUNG_ORDER; the two must agree, and the test pins "AI Enabled II" -> 4). */
export const RUNG_ORDER: readonly string[] = [
  'AI Aware I', 'AI Aware II', 'AI Enabled I', 'AI Enabled II',
  'AI Builder I', 'AI Builder II', 'AI Builder III', 'AI Builder IV', 'AI Builder V', 'AI Builder VI', 'AI Architect', 'Senior AI Architect',
];
export function levelOfRung(rung: string | null | undefined): number | null {
  const i = RUNG_ORDER.indexOf((rung ?? '').split(' · ')[0].trim());
  return i < 0 ? null : i + 1;
}

/** A trimmed, single-line string up to `max` characters, or null for anything else (numbers are accepted as text). */
export function cleanText(v: unknown, max = SHORT): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = cleanText(fullName)?.split(' ')[0] ?? null;
  // an email-shaped "name" (accounts created from an email alone) is not a first name
  return first && !first.includes('@') ? first : null;
}

const toIso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export function weekFrom(w: MyProgressInputs['weeks'], cohortName: string | null): MyProgressWeek | null {
  if (!w) return null;
  const numbered = w.rows.filter((r): r is typeof r & { week: number } => typeof r.week === 'number' && r.week > 0);
  const total = numbered.length ? Math.max(...numbered.map((r) => r.week)) : CURRICULUM_WEEKS_FALLBACK;
  // Before the cohort's first session the schedule reads week 0; the learner is in week 1 (the cohort's first week).
  const current = Math.min(total, Math.max(1, Math.trunc(w.scheduledWeek)));
  const row = numbered.find((r) => r.week === current);
  return { current, total, cohortName: cleanText(cohortName), cardsDoneThisWeek: row?.completed ?? 0, cardsThisWeek: row?.publishedCardCount ?? 0 };
}

const MILESTONE_LABEL: Record<string, string> = {
  curriculum_complete: 'Curriculum complete',
  project_complete: 'Build complete',
  certification_approved: 'Certification approved',
};

export function earnedMilestones(rows: MyProgressInputs['milestones']): MyProgressMilestone[] {
  return rows
    .filter((r) => MILESTONE_LABEL[r.milestone_type])
    .map((r) => {
      const ev = r.evidence && typeof r.evidence === 'object' ? (r.evidence as Record<string, unknown>) : {};
      const name = r.milestone_type === 'project_complete' ? cleanText(ev.name, 60) : null;
      return { key: `${r.milestone_type}:${r.source_ref}`, label: name ? `${MILESTONE_LABEL[r.milestone_type]}: ${name}` : MILESTONE_LABEL[r.milestone_type], date: toIso(r.achieved_at) };
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

/**
 * The next program milestone (milestoneLadder.ts: the curriculum, three builds, then the approved certification). No new rule:
 * these are the existing milestones, offered in the order a learner usually meets them (a first build, the curriculum, the
 * remaining builds, the certification). All held: null.
 */
export function nextMilestone(rows: MyProgressInputs['milestones']): MyProgressNext | null {
  const builds = new Set(rows.filter((r) => r.milestone_type === 'project_complete').map((r) => r.source_ref)).size;
  const curriculum = rows.some((r) => r.milestone_type === 'curriculum_complete');
  const cert = rows.some((r) => r.milestone_type === 'certification_approved');
  if (builds < 1) return { key: 'project_complete', label: 'First build complete', detail: 'Every story of a published build verified' };
  if (!curriculum) return { key: 'curriculum_complete', label: 'Curriculum complete', detail: 'Every graded card in all 12 weeks' };
  if (builds < 3) return { key: 'project_complete', label: `Build ${builds + 1} of 3 complete`, detail: 'Every story of a published build verified' };
  if (!cert) return { key: 'certification_approved', label: 'Certification approved', detail: 'Upload your certificate for staff approval' };
  return null;
}

/** The most recent of: the last card finished, the last milestone latched. */
export function latestWinOf(card: MyProgressInputs['latestCard'], earned: MyProgressMilestone[]): MyProgressWin | null {
  const options: MyProgressWin[] = [];
  const cardDate = toIso(card?.completed_at);
  const cardTitle = cleanText(card?.title, LONG);
  if (cardDate && cardTitle) options.push({ title: cardTitle, date: cardDate });
  for (const m of earned) if (m.date) options.push({ title: m.label, date: m.date });
  options.sort((a, b) => b.date.localeCompare(a.date));
  return options[0] ?? null;
}

function educationLine(raw: unknown): string | null {
  if (typeof raw === 'string') return cleanText(raw, LONG);
  const e = normalizeEducation(raw)[0];
  if (!e) return null;
  const what = [e.credential, e.field].filter(Boolean).join(', ');
  return cleanText(what ? `${what} · ${e.institution}` : e.institution, LONG);
}

/** The allow-listed background. Only these keys are ever read from the extraction. */
export function backgroundFrom(extracted: unknown): MyProgressBackground | null {
  if (!extracted || typeof extracted !== 'object') return null;
  const x = extracted as Record<string, unknown>;
  const skills = (Array.isArray(x.skills) ? x.skills : typeof x.skills === 'string' ? x.skills.split(',') : [])
    .map((s) => cleanText(s, 60)).filter((s): s is string => !!s);
  const bg: MyProgressBackground = {
    title: cleanText(x.title) ?? cleanText(x.role),
    company: cleanText(x.company_name),
    industry: cleanText(x.industry),
    years: cleanText(x.years_experience, 40),
    skills: [...new Set(skills)].slice(0, MAX_SKILLS),
    education: educationLine(x.education),
  };
  const any = bg.title || bg.company || bg.industry || bg.years || bg.education || bg.skills.length;
  return any ? bg : null;
}

/** The learner's own goal (Settings) first, then the resume's. */
export function goalFrom(intake: unknown, extracted: unknown): string | null {
  const per = intake && typeof intake === 'object' ? (intake as { personalization?: unknown }).personalization : null;
  const own = per && typeof per === 'object' ? cleanText((per as Record<string, unknown>).goals, LONG) : null;
  const fromResume = extracted && typeof extracted === 'object' ? cleanText((extracted as Record<string, unknown>).goals, LONG) : null;
  return own ?? fromResume;
}

export function buildMyProgress(i: MyProgressInputs): MyProgressPayload {
  const earned = earnedMilestones(i.milestones);
  const hasResume = !!cleanText(i.profile?.resume_file_name, 255);
  const extracted = i.profile?.extracted ?? null;
  const rung = cleanText(i.rungName);
  return {
    firstName: firstNameOf(i.enrollment.full_name),
    week: weekFrom(i.weeks, i.enrollment.cohort_name),
    points: { total: Math.max(0, Math.trunc(i.pointsTotal || 0)), level: levelOfRung(rung), levelName: rung,
      builder: Math.max(0, Math.trunc(i.xp.builder || 0)), learning: Math.max(0, Math.trunc(i.xp.learning || 0)), community: Math.max(0, Math.trunc(i.xp.community || 0)) },
    latestWin: latestWinOf(i.latestCard, earned),
    milestones: { earned, next: nextMilestone(i.milestones) },
    background: hasResume ? backgroundFrom(extracted) : null,
    goal: goalFrom(i.enrollment.intake_data_json, hasResume ? extracted : null),
    hasResume,
  };
}
