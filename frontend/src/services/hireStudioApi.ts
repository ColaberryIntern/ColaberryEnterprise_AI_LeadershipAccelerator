import portalApi from '../utils/portalApi';

/**
 * The candidate studio's Hire profile (hire.refactored.ai profile upgrade, Phase 3). Every call
 * acts on the signed-in learner's own enrollment: the server takes it from the session and never
 * from anything sent here.
 */

export type IntroQuestionKey = 'handed' | 'caught' | 'team';
export type WorkSetup = 'remote' | 'hybrid' | 'onsite';
export type InterviewFormat = 'intro' | 'walkthrough' | 'working';

export const INTRO_QUESTIONS: ReadonlyArray<{ key: IntroQuestionKey; text: string }> = [
  { key: 'handed', text: 'What problem do you most want to be handed?' },
  { key: 'caught', text: 'Tell us about a time you caught something before it shipped.' },
  { key: 'team', text: 'How do you like to work with a team?' },
];

export const FORMATS: ReadonlyArray<{ id: InterviewFormat; name: string; minutes: number }> = [
  { id: 'intro', name: 'Intro call', minutes: 20 },
  { id: 'walkthrough', name: 'Case study walkthrough', minutes: 45 },
  { id: 'working', name: 'Working session', minutes: 60 },
];

export interface HireIntro {
  headlineDraft: string | null;
  answers: Array<{ key: IntroQuestionKey; text: string }>;
  roles: string[];
  setups: WorkSetup[];
  location: string | null;
  earliestStart: string | null;
  /** Internal only. Never shown on Hire. */
  workAuth: string | null;
  /** Read-only here; recording arrives with the intro video update. */
  video?: { status: string; seconds: number | null } | null;
}

export interface InterviewAvailability {
  enabled: boolean;
  tz: string;
  blocks: string[];
  formats: InterviewFormat[];
  maxPerWeek: number | null;
  minNoticeHours: number;
  autoConfirm: boolean;
}

export interface MyHireCase { slug: string; title: string; coverImageUrl: string | null }

export interface CaseStudyOrder {
  slugs: string[];
  cases: MyHireCase[];
  /** Their hire.refactored.ai address, when the profile is reachable there. */
  talentSlug: string | null;
}

export interface HireInterview {
  id: string;
  format: InterviewFormat;
  caseStudySlug: string | null;
  startsAt: string;
  minutes: number;
  status: 'requested' | 'confirmed' | 'declined' | 'rescheduled' | 'cancelled' | 'completed';
  employer: { name: string; company: string; role: string; message: string };
  extraInterviewers: number;
  recordRequested: boolean;
  roomUrl: string | null;
  createdAt: string;
}

const BASE = '/api/portal/career/portfolio-page';

export async function fetchHireIntro(): Promise<HireIntro> {
  return (await portalApi.get(`${BASE}/hire-intro`)).data.intro;
}

export async function saveHireIntro(intro: Omit<HireIntro, 'video'>): Promise<HireIntro> {
  const { video: _video, ...body } = intro as HireIntro;
  return (await portalApi.put(`${BASE}/hire-intro`, body)).data.intro;
}

export async function fetchAvailability(): Promise<InterviewAvailability> {
  return (await portalApi.get(`${BASE}/interview-availability`)).data.availability;
}

export async function saveAvailability(a: InterviewAvailability): Promise<InterviewAvailability> {
  return (await portalApi.put(`${BASE}/interview-availability`, a)).data.availability;
}

export async function fetchCaseStudyOrder(): Promise<CaseStudyOrder> {
  const d = (await portalApi.get(`${BASE}/case-study-order`)).data;
  return { slugs: d.slugs ?? [], cases: d.cases ?? [], talentSlug: d.talentSlug ?? null };
}

export async function saveCaseStudyOrder(slugs: string[]): Promise<string[]> {
  return (await portalApi.put(`${BASE}/case-study-order`, { slugs })).data.slugs;
}

export async function fetchHireInterviews(): Promise<HireInterview[]> {
  return (await portalApi.get('/api/portal/career/hire-interviews')).data.interviews;
}

export async function actOnHireInterview(id: string, action: 'confirm' | 'decline' | 'propose', startsAt?: string): Promise<HireInterview> {
  const body = action === 'propose' ? { startsAt } : {};
  return (await portalApi.post(`/api/portal/career/hire-interviews/${encodeURIComponent(id)}/${action}`, body)).data.interview;
}
