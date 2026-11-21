/**
 * enterpriseIntakeAliBrief - one email to Ali about a client, led by the meeting date (v2).
 *
 * Ali, 2026-11-21: "At the end of this, an email needs to be sent to me after all these steps
 * with a visual update showing me everything I need to know about this client with a big focus
 * on the meeting date."
 *
 * When: the meeting is booked AND our research is done. If the research is still not done 24
 * hours before the meeting (the client never did the AI interview), it is sent anyway, flagged.
 * Once per client: an atomic claim (ali_brief_claimed_at, stale after 10 minutes) that also
 * counts the attempt; a failed send releases it; after MAX_BRIEF_ATTEMPTS it is dead-lettered.
 *
 * The HTML is email-safe (tables, inline styles) and every client-supplied value is escaped.
 */
import { Op } from 'sequelize';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { env } from '../../config/env';
import { meetingWhen, TZ } from './enterpriseIntakeTime';
import { hoursPerYear, roiLabel, Roi } from './enterpriseIntakeRoi';
import { sendAliBrief } from './enterpriseIntakeEmails';

export const MAX_BRIEF_ATTEMPTS = 3;
const CLAIM_STALE_MS = 10 * 60 * 1000;
const SENT_WRITE_TRIES = 3;
const SENT_WRITE_BACKOFF_MS = 500;
/** Briefs this process sent: never sent again, even if recording sent_at failed. */
const sentThisProcess = new Set<string>();
/** Test seam only. */
export const resetSentForTest = (): void => sentThisProcess.clear();

interface ResearchView {
  summary?: string;
  industry?: string;
  size_signals?: string;
  systems?: string[];
  open_questions?: string[];
  news?: NewsView[];
  ai_trends?: NewsView[];
}
interface NewsView { headline?: string; date?: string | null; why_it_matters?: string }
interface OptionView { title?: string; service?: string; what_it_does?: string; first_step?: string; roi?: Roi }
const FALLBACK_BEFORE_MS = 24 * 60 * 60 * 1000;

const e = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/[–—]/g, '-');

const log = (event: string, outcome: 'success' | 'failure', context: Record<string, unknown>, error_class?: string) =>
  (outcome === 'failure' ? console.error : console.log)(JSON.stringify({
    level: outcome === 'failure' ? 'error' : 'info', service: 'enterprise-intake-brief', event, outcome, ...(error_class ? { error_class } : {}), context,
  }));

const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString('en-US', { timeZone: TZ, ...opts });

export function daysAway(meeting: Date, now: Date): string {
  const day = (d: Date) => fmtDay(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const ms = new Date(day(meeting)).getTime() - new Date(day(now)).getTime();
  const n = Math.round(ms / 86_400_000);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

export function briefSubject(i: Pick<EnterpriseIntake, 'company' | 'full_name' | 'meeting_start'>): string {
  const d = new Date(i.meeting_start!);
  return `Pilot meeting ${fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' })}, ${fmtDay(d, { hour: 'numeric', minute: '2-digit' })} CT: ${i.company || i.full_name} (${i.full_name})`
    .replace(/[–—]/g, '-').slice(0, 200);
}

export interface BriefInput {
  intake: EnterpriseIntake;
  facts: Array<{ dimension: string; value: string }>;
  now: Date;
  adminUrl: string;
}

const section = (title: string, body: string) =>
  `<tr><td style="padding:18px 24px 4px;font:700 13px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#5b6578">${e(title)}</td></tr>`
  + `<tr><td style="padding:0 24px 8px;font:15px/1.55 Arial,sans-serif;color:#1a2233">${body}</td></tr>`;

const ul = (xs: string[]) => (xs.length ? `<ul style="margin:6px 0;padding-left:20px">${xs.map((x) => `<li style="margin:3px 0">${x}</li>`).join('')}</ul>` : '<div style="color:#5b6578">none</div>');

const chip = (text: string, tone: 'ok' | 'warn' | 'bad') => {
  const c = { ok: ['#e8f5ee', '#1d7a46'], warn: ['#fff5e1', '#9a5b00'], bad: ['#fdecea', '#b42318'] }[tone];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:12px;background:${c[0]};color:${c[1]};font:700 12px Arial,sans-serif">${e(text)}</span>`;
};

export function buildAliBriefHtml({ intake: i, facts, now, adminUrl }: BriefInput): string {
  const m = new Date(i.meeting_start!);
  const r = (i.research || {}) as ResearchView;
  const options = (i.pilot_options || []) as OptionView[];
  const year = hoursPerYear(i.hours_per_week as unknown as number);
  const maxHours = Math.max(1, ...options.map((o) => Number((o.roi as Roi | undefined)?.hours_high ?? (o.roi as Roi | undefined)?.share_high ?? 0)));

  const interview = i.interviewed_at
    ? chip(`AI interview done (${i.interviewed_via === 'call' ? 'call' : 'typed'}, ${fmtDay(new Date(i.interviewed_at), { month: 'short', day: 'numeric' })})`, 'ok')
    : i.interview_mode === 'later' && i.interview_scheduled_for
      ? chip(`AI interview NOT done yet (scheduled ${meetingWhen(new Date(i.interview_scheduled_for))})`, 'bad')
      : chip('AI interview NOT done yet', 'bad');
  const research = i.researched_at ? chip('Research and options ready', 'ok') : chip('Research waiting on the interview', 'warn');
  const files = (i.client_files || []);

  const hero = [
    '<tr><td style="background:#1f4fd1;padding:28px 24px;color:#ffffff;font-family:Arial,sans-serif">',
    `<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Your pilot meeting, ${e(daysAway(m, now))}</div>`,
    `<div style="font-size:40px;font-weight:700;line-height:1.1;margin-top:6px">${e(fmtDay(m, { weekday: 'long' }))}</div>`,
    `<div style="font-size:28px;font-weight:700;line-height:1.2">${e(fmtDay(m, { month: 'long', day: 'numeric', year: 'numeric' }))}</div>`,
    `<div style="font-size:24px;margin-top:4px">${e(fmtDay(m, { hour: 'numeric', minute: '2-digit' }))} Central, 30 minutes</div>`,
    `<div style="font-size:17px;margin-top:10px">${e(i.full_name)}${i.role ? `, ${e(i.role)}` : ''} at <strong>${e(i.company)}</strong></div>`,
    i.meeting_link ? `<div style="margin-top:16px"><a href="${e(i.meeting_link)}" style="display:inline-block;background:#ffffff;color:#1f4fd1;padding:10px 18px;border-radius:6px;font-weight:700;text-decoration:none">Join Google Meet</a></div>` : '',
    '</td></tr>',
    `<tr><td style="padding:14px 24px 0">${interview} ${research} ${chip(`${files.length} file${files.length === 1 ? '' : 's'} from the client`, files.length ? 'ok' : 'warn')}</td></tr>`,
  ].join('');

  const who = ul([
    `<strong>${e(i.full_name)}</strong>${i.role ? `, ${e(i.role)}` : ''}`,
    `${e(i.email)}${i.phone ? `, ${e(i.phone)}` : ''}`,
    i.website ? `Website: ${e(i.website)}` : 'Website: not given',
    `Considering: ${e(i.service || 'not stated')}. Department: ${e(i.department || 'not stated')}. Start: ${e(i.start_timing || 'not stated')}.`,
    `Who else decides: ${e(i.other_deciders || 'not stated')}`,
  ]);

  const numbers = [
    `<div style="margin:4px 0 8px">${e(i.process || 'not stated')}</div>`,
    year !== null
      ? `<div style="font:700 26px Arial,sans-serif;color:#1f4fd1">${e(year.toLocaleString('en-US'))} hours a year</div><div style="color:#5b6578">${e(i.people_count ?? '?')} people, ${e(i.hours_per_week)} hours a week between them</div>`
      : '<div style="color:#5b6578">No hours given.</div>',
    `<div style="margin-top:6px"><strong>What AI has to return:</strong> ${e(i.required_return || 'not stated')}</div>`,
  ].join('');

  const optionRows = options.map((o, n) => {
    const roi = o.roi as Roi | undefined;
    const value = Number(roi?.hours_high ?? roi?.share_high ?? 0);
    const width = Math.max(4, Math.round((value / maxHours) * 100));
    return `<div style="margin:10px 0 14px"><div><strong>${n + 1}. ${e(o.title)}</strong> (${e(o.service)})</div>`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0"><tr><td style="background:#e3e6ec;border-radius:4px"><div style="width:${width}%;background:#1d7a46;height:10px;border-radius:4px"></div></td></tr></table>`
      + `<div style="color:#5b6578;font-size:13px">Potential return (internal estimate): ${e(roiLabel(roi))}</div>`
      + `<div>${e(o.what_it_does)}</div><div style="font-size:13px"><strong>First step:</strong> ${e(o.first_step)}</div></div>`;
  }).join('');

  const news = (xs: NewsView[] | undefined) => ul((Array.isArray(xs) ? xs : []).map((x) => `${e(x.headline)}${x.date ? ` <span style="color:#5b6578">(${e(x.date)})</span>` : ''}: ${e(x.why_it_matters)}`));

  return [
    '<!doctype html><html><body style="margin:0;background:#f6f7f9">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9"><tr><td align="center" style="padding:16px">',
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">',
    hero,
    section('The client', who),
    section('Their process and numbers', numbers),
    section('AI interview: what we learned', facts.length ? ul(facts.slice(0, 10).map((f) => `<strong>${e(f.dimension)}:</strong> ${e(f.value)}`)) : '<div style="color:#b42318">No interview yet. Their form answers above are all we have.</div>'),
    section('Their own research', files.length ? ul(files.map((f) => `${e(f.name)} <span style="color:#5b6578">(${f.size >= 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`})</span>`)) : '<div style="color:#5b6578">None uploaded.</div>'),
    section('Our research', i.researched_at ? `<div>${e(r.summary)}</div><div style="margin-top:6px;font-size:13px;color:#5b6578">Industry: ${e(r.industry)}. Size: ${e(r.size_signals)}. Systems: ${e((r.systems || []).join(', ') || 'none named')}.</div>` : '<div style="color:#9a5b00">Not ready yet: it runs right after the AI interview.</div>'),
    i.researched_at ? section('In the news', news(r.news)) : '',
    i.researched_at ? section('AI in their industry', news(r.ai_trends)) : '',
    options.length ? section('Pilot options, highest potential return first', optionRows) : '',
    i.researched_at ? section('Still to learn in the meeting', ul((r.open_questions || []).map((q: string) => e(q)))) : '',
    `<tr><td style="padding:16px 24px 24px;font:14px Arial,sans-serif"><a href="${e(adminUrl)}" style="color:#1f4fd1;font-weight:700">Open the client in Admin</a> <span style="color:#5b6578">(write-up, transcript, research, draft options email, proposal). The Basecamp list is in the Colaberry Enterprise Intake project.</span></td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

const adminUrlOf = (id: string) => `${(env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/$/, '')}/admin/enterprise-clients/${id}`;

/** Send the brief for one client if it is due. */
export async function sendAliBriefOnce(intakeId: string, now = new Date()): Promise<'sent' | 'not_due' | 'claimed_elsewhere' | 'failed' | 'missing'> {
  const i = await EnterpriseIntake.findByPk(intakeId);
  if (!i) return 'missing';
  const attempts = i.ali_brief_attempts || 0;
  if (sentThisProcess.has(i.id) || !i.meeting_start || i.ali_brief_sent_at || i.lost_at || i.signed_at || attempts >= MAX_BRIEF_ATTEMPTS) return 'not_due';
  const until = new Date(i.meeting_start).getTime() - now.getTime();
  if (until <= 0) return 'not_due';
  if (!i.researched_at && until > FALLBACK_BEFORE_MS) return 'not_due';

  const [n] = await EnterpriseIntake.update(
    { ali_brief_claimed_at: now, ali_brief_attempts: attempts + 1 } as Partial<EnterpriseIntake>,
    { where: {
      id: i.id, ali_brief_sent_at: null, ali_brief_attempts: attempts,
      [Op.or]: [{ ali_brief_claimed_at: null }, { ali_brief_claimed_at: { [Op.lt]: new Date(now.getTime() - CLAIM_STALE_MS) } }],
    } as Record<string, unknown> },
  );
  if (n !== 1) return 'claimed_elsewhere';

  try {
    const record = i.understanding_id ? await ProjectUnderstandingRecord.findByPk(i.understanding_id) : null;
    const facts = ((record?.items as Array<{ dimension: string; value: string }>) || []).map((x) => ({ dimension: x.dimension, value: x.value }));
    await sendAliBrief(briefSubject(i), buildAliBriefHtml({ intake: i, facts, now, adminUrl: adminUrlOf(i.id) }));
  } catch (err) {
    await EnterpriseIntake.update({ ali_brief_claimed_at: null } as Partial<EnterpriseIntake>, { where: { id: i.id, ali_brief_sent_at: null } as Record<string, unknown> })
      .catch((x) => log('enterprise_ali_brief_release_failed', 'failure', { intake_id: i.id, message: String((x as Error)?.message || x).slice(0, 200) }, 'UpstreamUnavailable'));
    const dead = attempts + 1 >= MAX_BRIEF_ATTEMPTS;
    log(dead ? 'enterprise_intake_dead_letter' : 'enterprise_ali_brief_failed', 'failure', {
      intake_id: i.id, step: 'ali_brief', attempt: attempts + 1, message: String((err as Error)?.message || err).slice(0, 200),
    }, (err as { error_class?: string })?.error_class || 'UpstreamUnavailable');
    return 'failed';
  }

  // The email is out. From here the claim is NEVER released: a failed write below must not let a
  // later sweep send Ali a second brief. The process remembers, and the write is retried.
  sentThisProcess.add(i.id);
  for (let n = 1; n <= SENT_WRITE_TRIES; n++) {
    try {
      await EnterpriseIntake.update({ ali_brief_sent_at: now } as Partial<EnterpriseIntake>, { where: { id: i.id } as Record<string, unknown> });
      log('enterprise_ali_brief_sent', 'success', { intake_id: i.id, researched: Boolean(i.researched_at), attempt: attempts + 1 });
      return 'sent';
    } catch (err) {
      if (n === SENT_WRITE_TRIES) {
        log('enterprise_intake_dead_letter', 'failure', {
          intake_id: i.id, step: 'ali_brief_mark_sent', note: 'brief WAS sent; sent_at not recorded, claim held so it is not resent by this process',
          message: String((err as Error)?.message || err).slice(0, 200),
        }, 'ContractViolation');
      } else {
        await new Promise((r) => setTimeout(r, SENT_WRITE_BACKOFF_MS * n));
      }
    }
  }
  return 'sent';
}

/** Sweep: clients with a booked, upcoming meeting and no brief yet. */
export async function syncAliBriefs(limit = 20, now = new Date()): Promise<{ sent: number; failed: number }> {
  const rows = await EnterpriseIntake.findAll({
    where: {
      meeting_start: { [Op.gt]: now },
      ali_brief_sent_at: null,
      ali_brief_attempts: { [Op.lt]: MAX_BRIEF_ATTEMPTS },
      lost_at: null,
      signed_at: null,
    } as Record<string, unknown>,
    attributes: ['id'],
    order: [['meeting_start', 'ASC']],
    limit,
  });
  const out = { sent: 0, failed: 0 };
  for (const r of rows) {
    const s = await sendAliBriefOnce(r.id, now);
    if (s === 'sent') out.sent++;
    else if (s === 'failed') out.failed++;
  }
  return out;
}

/** Right after research finishes or a meeting is booked: try now instead of waiting for the sweep. */
export function aliBriefSoon(intakeId: string): void {
  sendAliBriefOnce(intakeId).catch((err) => log('enterprise_ali_brief_failed', 'failure', { intake_id: intakeId, message: String(err?.message || err).slice(0, 200) }, 'UpstreamUnavailable'));
}
