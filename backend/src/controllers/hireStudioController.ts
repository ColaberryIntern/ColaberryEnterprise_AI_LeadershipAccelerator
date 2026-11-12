/**
 * hireStudioController - the candidate studio's Hire settings and interview inbox (kit §4.2).
 *
 *   GET/PUT /api/portal/career/portfolio-page/hire-intro
 *   GET/PUT /api/portal/career/portfolio-page/interview-availability
 *   PUT     /api/portal/career/portfolio-page/case-study-order
 *   GET     /api/portal/career/hire-interviews
 *   POST    /api/portal/career/hire-interviews/:id/(confirm|decline|propose)
 *
 * The enrollment is ALWAYS the caller's, from the participant token. No id is read from a body.
 */
import { Request, Response, NextFunction } from 'express';
import type { ZodError } from 'zod';
import { sequelize } from '../config/database';
import { loadHireIndex } from '../services/hire/hireTalentIndex';
import {
  availabilityInputSchema, caseStudyOrderInputSchema, hireIntroInputSchema, readAvailability, readCaseStudyOrder,
  readHireIntro, writeAvailability, writeCaseStudyOrder, writeHireIntro,
} from '../services/hire/hireStudioSettings';
import { actOnInterview, INBOX_ACTIONS, listMyInterviews, type InboxAction } from '../services/hire/hireInterviewInbox';

const eid = (req: Request) => req.participant!.sub;

// Services throw errors carrying `status` and `error_class` (the hireListingController contract).
function fail(res: Response, e: any, next: NextFunction): void {
  if (e?.status) {
    res.status(e.status).json({ error: e.message || 'error', error_class: e.error_class });
    return;
  }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'hire_studio_controller_error', outcome: 'failure',
    error_class: e?.error_class || e?.name || 'Error', context: { message: e?.message },
  }));
  next(e);
}

function issues(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

/** The learner's published Hire case-study slugs: what their carousel may be ordered from. */
interface MyHireCases {
  /** Their Hire address, when the profile is reachable there (for "Preview my public profile"). */
  readonly talentSlug: string | null;
  readonly cases: readonly { readonly slug: string; readonly title: string; readonly coverImageUrl: string | null }[];
}

async function myHireCases(enrollmentId: string): Promise<MyHireCases> {
  const [rows] = await sequelize.query('SELECT slug FROM career_portfolio_pages WHERE enrollment_id = $1 LIMIT 1', { bind: [enrollmentId] });
  const slug = Array.isArray(rows) && rows[0] ? String((rows[0] as { slug: unknown }).slug || '') : '';
  if (!slug) return { talentSlug: null, cases: [] };
  const [entry] = await loadHireIndex(['public', 'unlisted'], slug);
  if (!entry) return { talentSlug: null, cases: [] };
  return {
    talentSlug: entry.page.slug,
    cases: entry.cases.map((c) => ({ slug: c.slug, title: c.title, coverImageUrl: c.look?.coverImageUrl ?? null })),
  };
}

const myPublishedSlugs = async (enrollmentId: string) => (await myHireCases(enrollmentId)).cases.map((c) => c.slug);

export async function handleGetHireIntro(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ ok: true, intro: await readHireIntro(eid(req)) }); } catch (e) { fail(res, e, next); }
}

export async function handlePutHireIntro(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = hireIntroInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: issues(parsed.error) }); return; }
  try { res.json({ ok: true, intro: await writeHireIntro(eid(req), parsed.data) }); } catch (e) { fail(res, e, next); }
}

export async function handleGetInterviewAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ ok: true, availability: await readAvailability(eid(req)) }); } catch (e) { fail(res, e, next); }
}

export async function handlePutInterviewAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = availabilityInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: issues(parsed.error) }); return; }
  try { res.json({ ok: true, availability: await writeAvailability(eid(req), parsed.data) }); } catch (e) { fail(res, e, next); }
}

export async function handleGetCaseStudyOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [slugs, mine] = await Promise.all([readCaseStudyOrder(eid(req)), myHireCases(eid(req))]);
    const published = mine.cases.map((c) => c.slug);
    res.json({ ok: true, slugs: slugs.filter((s) => published.includes(s)), published, cases: mine.cases, talentSlug: mine.talentSlug });
  } catch (e) { fail(res, e, next); }
}

export async function handlePutCaseStudyOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = caseStudyOrderInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: issues(parsed.error) }); return; }
  try {
    const slugs = await writeCaseStudyOrder(eid(req), parsed.data.slugs, await myPublishedSlugs(eid(req)));
    res.json({ ok: true, slugs });
  } catch (e) { fail(res, e, next); }
}

export async function handleListHireInterviews(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ ok: true, interviews: await listMyInterviews(eid(req)) }); } catch (e) { fail(res, e, next); }
}

export async function handleActOnHireInterview(req: Request, res: Response, next: NextFunction): Promise<void> {
  const action = String(req.params.action || '') as InboxAction;
  if (!INBOX_ACTIONS.includes(action)) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    res.json({ ok: true, interview: await actOnInterview(eid(req), String(req.params.id || ''), action, req.body) });
  } catch (e) { fail(res, e, next); }
}
