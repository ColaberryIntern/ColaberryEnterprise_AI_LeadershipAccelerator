/**
 * enterpriseIntakeResearch - "we do the homework" (W30, Phase 3).
 *
 * Once the interview is in, the AI reads the company's own website, then writes three things
 * from the form, the write-up and the site:
 *   - a short research brief (what they do, size signals, systems named, open questions);
 *   - 2-3 pilot options (build, guide or train), so the team walks into meeting 1 with options;
 *   - a DRAFT follow-up email to the client with those options.
 * All three go on the client's Basecamp list. The email is never sent from here: Ali sends it
 * from the admin Clients page after reading it (sendFirstContactAsAli).
 *
 * Rules the model is held to, and checked after (a reply that breaks them is not used):
 *   no prices, never the word "free", no promised time savings or outcomes, no em dashes,
 *   American spelling, facts only from what we were given ("not stated" otherwise).
 */
import { z } from 'zod';
import { Op } from 'sequelize';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { chatJson } from '../runtime/runtimeAi';
import { bcPost } from '../ops/basecampClient';
import { env } from '../../config/env';
import { fetchCompanyPage } from './companySiteFetch';
import { esc, intakeBasecampEnabled, tickStep } from './enterpriseIntakeBasecamp';
import { writtenBrief } from './enterpriseIntakeService';

export const MAX_RESEARCH_ATTEMPTS = 3;

export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com',
]);

/** The site to read: what they typed, else their work email's domain (never a webmail one). */
export function siteFor(i: { website: string; email: string }): string | null {
  if (i.website && i.website.trim()) return i.website.trim();
  const domain = String(i.email || '').split('@')[1]?.toLowerCase().trim();
  return domain && !FREE_MAIL.has(domain) ? domain : null;
}

const str = (max: number) => z.string().trim().min(1).max(max);

export const researchSchema = z.object({
  research: z.object({
    summary: str(1200),
    industry: z.string().trim().max(200).default('not stated'),
    size_signals: z.string().trim().max(400).default('not stated'),
    systems: z.array(z.string().trim().max(120)).max(12).default([]),
    open_questions: z.array(z.string().trim().max(300)).max(6).default([]),
  }),
  options: z
    .array(
      z.object({
        title: str(120),
        service: z.enum(['Build', 'Guide', 'Train']),
        what_it_does: str(600),
        success_measure: str(300),
        first_step: str(300),
        why_this_fits: str(400),
      }),
    )
    .min(2)
    .max(3),
  email: z.object({ subject: str(150), body: str(3000) }),
});

export type ResearchResult = z.infer<typeof researchSchema>;

/** Words and marks that may never reach a client, whatever the model wrote. */
export function ruleBreaks(r: ResearchResult): string[] {
  const all = JSON.stringify(r);
  const out: string[] = [];
  if (/\bfree\b/i.test(all)) out.push('the word "free"');
  if (/[$€£]\s?\d|\b\d[\d,.]*\s?(dollars|usd)\b/i.test(all)) out.push('a price');
  if (/\b(guarantee|guaranteed)\b/i.test(all)) out.push('a guarantee');
  if (/—|–/.test(all)) out.push('an em or en dash');
  if (/https?:\/\/|\bwww\./i.test(`${r.email.subject} ${r.email.body}`)) out.push('a link in the email');
  return out;
}

const SYSTEM = [
  'You are a solutions lead at Colaberry, which builds AI systems for companies, guides their teams',
  'through building them, and trains their staff. A prospect asked for a demo pilot and finished a',
  'short AI interview. Do the homework before our first meeting.',
  '',
  'Return JSON: {"research":{"summary","industry","size_signals","systems":[],"open_questions":[]},',
  '"options":[{"title","service":"Build|Guide|Train","what_it_does","success_measure","first_step","why_this_fits"}],',
  '"email":{"subject","body"}}.',
  '',
  'Rules:',
  '- Use ONLY the form, the interview write-up and the website text given. Anything not there is "not stated". Never invent customers, revenue, headcount or news.',
  '- 2 or 3 pilot options, each aimed at the process they named, each small enough to show results in weeks. Tie success_measure to their own figures when they gave any.',
  '- Never state a price, never use the word "free", never promise a time saving, a return or an outcome. No em or en dashes. American spelling.',
  '- open_questions: what we still need to learn in the first meeting.',
  '- email: from Ali Muwwakkil to the prospect, plain text, under 180 words, first name greeting, warm and direct.',
  '  Thank them for the interview, list the options in one line each, and ask for 30 minutes to walk',
  '  through them. No signature (it is added), no sign-off name, no links.',
].join('\n');

function userPrompt(i: EnterpriseIntake, items: Array<{ dimension: string; value: string }>, site: string): string {
  return [
    `Prospect: ${i.full_name} (${i.role || 'role not stated'}) at ${i.company}.`,
    '',
    'FORM:',
    writtenBrief(i),
    '',
    'INTERVIEW WRITE-UP:',
    items.length ? items.map((x) => `- [${x.dimension}] ${x.value}`).join('\n') : 'none',
    '',
    'WEBSITE TEXT:',
    site || 'No website could be read.',
  ].join('\n');
}

const log = (event: string, outcome: string, context: Record<string, unknown>) =>
  (outcome === 'failure' ? console.error : console.log)(
    JSON.stringify({ level: outcome === 'failure' ? 'error' : 'info', service: 'enterprise-intake-research', event, outcome, context }),
  );

const running = new Set<string>();

/**
 * Research one interviewed intake, once. Up to MAX_RESEARCH_ATTEMPTS tries (the counter is
 * bumped before the model is called, so a crash still counts). Never throws for a model or site
 * problem: it records the attempt and returns why.
 */
export async function researchIntake(
  intakeId: string,
): Promise<'researched' | 'done' | 'not_ready' | 'missing' | 'busy' | 'gave_up' | 'rejected' | 'failed'> {
  if (running.has(intakeId)) return 'busy';
  running.add(intakeId);
  try {
    const intake = await EnterpriseIntake.findByPk(intakeId);
    if (!intake) return 'missing';
    if (intake.researched_at) return 'done';
    if (!intake.understanding_id) return 'not_ready';
    if ((intake.research_attempts || 0) >= MAX_RESEARCH_ATTEMPTS) return 'gave_up';
    await intake.update({ research_attempts: (intake.research_attempts || 0) + 1 });

    const record = await ProjectUnderstandingRecord.findByPk(intake.understanding_id);
    const items = ((record?.items as Array<{ dimension: string; value: string }>) || []).map((x) => ({ dimension: x.dimension, value: x.value }));
    const target = siteFor(intake);
    const page = target ? await fetchCompanyPage(target) : null;
    const siteText = page ? [page.title, page.description, page.text].filter(Boolean).join('\n').slice(0, 6000) : '';

    let parsed: unknown;
    try {
      ({ parsed } = await chatJson('enterprise-intake-research', SYSTEM, userPrompt(intake, items, siteText), undefined, 1800));
    } catch (err) {
      log('enterprise_intake_research_failed', 'failure', { intake_id: intakeId, message: String((err as Error)?.message || err).slice(0, 200) });
      return 'failed';
    }
    const result = researchSchema.safeParse(parsed);
    if (!result.success) {
      log('enterprise_intake_research_rejected', 'failure', { intake_id: intakeId, reason: 'shape', issues: result.error.issues.slice(0, 3).map((x) => x.path.join('.')) });
      return 'rejected';
    }
    const breaks = ruleBreaks(result.data);
    if (breaks.length) {
      log('enterprise_intake_research_rejected', 'failure', { intake_id: intakeId, reason: 'rules', breaks });
      return 'rejected';
    }

    await intake.update({
      research: { ...result.data.research, site: page ? page.url : null },
      pilot_options: result.data.options,
      options_email_subject: result.data.email.subject,
      options_email_body: result.data.email.body,
      researched_at: new Date(),
    });
    log('enterprise_intake_researched', 'success', { intake_id: intakeId, options: result.data.options.length, site: Boolean(page) });
    return 'researched';
  } finally {
    running.delete(intakeId);
  }
}

/** The brief, options and draft email as one Basecamp comment. */
export function researchHtml(i: Pick<EnterpriseIntake, 'research' | 'pilot_options' | 'options_email_subject' | 'options_email_body'>): string {
  const r = (i.research || {}) as Record<string, any>;
  const options = (i.pilot_options || []) as Array<Record<string, string>>;
  const list = (xs: unknown) => (Array.isArray(xs) && xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div>not stated</div>');
  return [
    '<div><strong>Company research brief (AI)</strong></div>',
    `<div>${esc(r.summary)}</div>`,
    `<div><strong>Website read:</strong> ${esc(r.site || 'none could be read')}</div>`,
    `<div><strong>Industry:</strong> ${esc(r.industry)}. <strong>Size signals:</strong> ${esc(r.size_signals)}</div>`,
    '<div><strong>Systems named</strong></div>',
    list(r.systems),
    '<div><strong>Still to learn in the first meeting</strong></div>',
    list(r.open_questions),
    '<br><div><strong>Draft pilot options (AI, for the team to review)</strong></div>',
    ...options.map(
      (o, n) =>
        `<div><strong>${n + 1}. ${esc(o.title)}</strong> (${esc(o.service)})</div><ul><li>${esc(o.what_it_does)}</li><li><strong>Success:</strong> ${esc(o.success_measure)}</li><li><strong>First step:</strong> ${esc(o.first_step)}</li><li><strong>Why it fits:</strong> ${esc(o.why_this_fits)}</li></ul>`,
    ),
    '<br><div><strong>Draft email to the client (not sent)</strong>. Review and send it from Admin, Enterprise clients.</div>',
    `<div><em>Subject:</em> ${esc(i.options_email_subject)}</div>`,
    `<div>${esc(i.options_email_body).replace(/\n/g, '<br>')}</div>`,
  ].join('');
}

/** Post the research on the client's list once, then tick the research step. */
export async function postResearchToList(intakeId: string): Promise<'posted' | 'ticked' | 'off' | 'missing' | 'not_ready' | 'done'> {
  if (!intakeBasecampEnabled()) return 'off';
  const intake = await EnterpriseIntake.findByPk(intakeId);
  if (!intake) return 'missing';
  if (intake.bc_research_posted_at) {
    // Posted already. The tick is its own step, retried until it lands (as the interview's is).
    if (intake.bc_research_ticked_at || !intake.bc_todolist_id) return 'done';
    if (!(await tickStep(env.enterpriseIntakeBcProjectId, intake.bc_todolist_id, 'research'))) return 'not_ready';
    await intake.update({ bc_research_ticked_at: new Date() });
    return 'ticked';
  }
  if (!intake.researched_at || !intake.bc_todolist_id || !intake.bc_checklist_ready_at) return 'not_ready';
  const [claimed] = await EnterpriseIntake.update(
    { bc_research_posted_at: new Date() } as Partial<EnterpriseIntake>,
    { where: { id: intakeId, bc_research_posted_at: null } as Record<string, unknown> },
  );
  if (claimed !== 1) return 'done';
  const project = env.enterpriseIntakeBcProjectId;
  try {
    await bcPost(`/buckets/${project}/recordings/${intake.bc_todolist_id}/comments.json`, { content: researchHtml(intake) });
  } catch (err) {
    await EnterpriseIntake.update({ bc_research_posted_at: null } as Partial<EnterpriseIntake>, { where: { id: intakeId } });
    throw err;
  }
  try {
    if (await tickStep(project, intake.bc_todolist_id, 'research')) await intake.update({ bc_research_ticked_at: new Date() });
  } catch {
    /* the sweep retries the tick: bc_research_ticked_at is still null */
  }
  return 'posted';
}

/** After the interview: research, then post. Logs, never throws (request path). */
export function researchSoon(intakeId: string): void {
  researchIntake(intakeId)
    .then((r) => (r === 'researched' ? postResearchToList(intakeId) : r))
    .catch((err) => log('enterprise_intake_research_failed', 'failure', { intake_id: intakeId, message: String(err?.message || err).slice(0, 200) }));
}

/** Sweep: research what is waiting (bounded), and post what is researched but not yet posted. */
export async function syncEnterpriseResearch(limit = 5): Promise<{ researched: number; posted: number; failed: number }> {
  const out = { researched: 0, posted: 0, failed: 0 };
  const before = new Date(Date.now() - 60_000);
  const waiting = await EnterpriseIntake.findAll({
    where: {
      understanding_id: { [Op.ne]: null },
      researched_at: null,
      research_attempts: { [Op.lt]: MAX_RESEARCH_ATTEMPTS },
      interviewed_at: { [Op.lt]: before },
    } as Record<string, unknown>,
    order: [['interviewed_at', 'ASC']],
    limit,
  });
  for (const i of waiting) {
    const r = await researchIntake(i.id).catch(() => 'failed' as const);
    if (r === 'researched') out.researched += 1;
    else if (r === 'failed' || r === 'rejected') out.failed += 1;
  }
  if (!intakeBasecampEnabled()) return out;
  const unposted = await EnterpriseIntake.findAll({
    where: {
      researched_at: { [Op.ne]: null },
      bc_checklist_ready_at: { [Op.ne]: null },
      [Op.or]: [{ bc_research_posted_at: null }, { bc_research_ticked_at: null }],
    } as Record<string | symbol, unknown>,
    limit: 20,
  });
  for (const i of unposted) {
    try {
      const r = await postResearchToList(i.id);
      if (r === 'posted' || r === 'ticked') out.posted += 1;
    } catch {
      out.failed += 1;
    }
  }
  return out;
}
