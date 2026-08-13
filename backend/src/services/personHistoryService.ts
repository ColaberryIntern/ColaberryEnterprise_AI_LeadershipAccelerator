import { Op } from 'sequelize';
import {
  Enrollment, Lead, Cohort, CommunicationLog, CampaignLead, Campaign,
  AssignmentSubmission, AttendanceRecord, LiveSession, StudentNavigationEvent,
  UserCurriculumProfile, Project, LessonInstance, ScheduledEmail, LeadTemperatureHistory,
  AccountCredit, Subscription,
} from '../models';

/**
 * "Person 360" — a single participant's full history across every data source we
 * key to them (by enrollment_id directly, or by their email → Lead → lead_id).
 * Powers the admin drill-down drawer. Read-only aggregation.
 *
 * Failure-first: each source is queried independently and a failing query degrades
 * to empty rather than breaking the whole view — one missing table must not blank
 * out the entire history.
 */

export type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface TimelineEvent {
  at: string | null;   // ISO timestamp (nulls sort last)
  kind: string;
  icon: string;        // remixicon name
  tone: TimelineTone;
  title: string;
  detail?: string;
}

export interface PersonHistory {
  profile: Record<string, any>;
  acquisition: Record<string, any> | null;
  curriculum: Record<string, any> | null;
  project: Record<string, any> | null;
  summary: {
    emails: number; campaigns: number; sessionsAttended: number;
    submissions: number; pagesViewed: number; lessonsCompleted: number;
  };
  timeline: TimelineEvent[];
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch (err: any) {
    console.error('[Person360] source query failed (degraded to empty):', err?.message);
    return fallback;
  }
}

const toJSON = (rows: any[]): any[] => rows.map((r) => (typeof r?.toJSON === 'function' ? r.toJSON() : r));

export async function getEnrollmentHistory(enrollmentId: string): Promise<PersonHistory | null> {
  const enrollmentRow: any = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort', attributes: ['name'] }],
  });
  if (!enrollmentRow) return null;
  const e = enrollmentRow.toJSON();
  const email = (e.email || '').toLowerCase().trim();

  const leadRow: any = email ? await safe(Lead.findOne({ where: { email } }), null) : null;
  const l = leadRow ? leadRow.toJSON() : null;
  const leadId: number | null = l?.id ?? null;

  const [commsR, campLeadsR, navR, subsR, attR, lessonsR, curricR, projectsR, schedR, tempR] = await Promise.all([
    leadId ? safe(CommunicationLog.findAll({ where: { lead_id: leadId }, order: [['created_at', 'DESC']], limit: 60 }), []) : Promise.resolve([]),
    leadId ? safe(CampaignLead.findAll({ where: { lead_id: leadId }, order: [['enrolled_at', 'DESC']], limit: 30 }), []) : Promise.resolve([]),
    safe(StudentNavigationEvent.findAll({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']], limit: 60 }), []),
    safe(AssignmentSubmission.findAll({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']], limit: 40 }), []),
    safe(AttendanceRecord.findAll({ where: { enrollment_id: enrollmentId }, include: [{ model: LiveSession, as: 'session', attributes: ['title', 'session_date'] }], limit: 40 }), []),
    safe(LessonInstance.findAll({ where: { enrollment_id: enrollmentId }, limit: 60 }), []),
    safe(UserCurriculumProfile.findOne({ where: { enrollment_id: enrollmentId } }), null),
    safe(Project.findAll({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']], limit: 5 }), []),
    leadId ? safe(ScheduledEmail.findAll({ where: { lead_id: leadId, status: 'pending' }, order: [['scheduled_for', 'ASC']], limit: 20 }), []) : Promise.resolve([]),
    leadId ? safe(LeadTemperatureHistory.findAll({ where: { lead_id: leadId }, order: [['created_at', 'DESC']], limit: 15 }), []) : Promise.resolve([]),
  ]);

  const comms = toJSON(commsR), campLeads = toJSON(campLeadsR), nav = toJSON(navR), subs = toJSON(subsR);
  const att = toJSON(attR), lessons = toJSON(lessonsR), projects = toJSON(projectsR), sched = toJSON(schedR), temp = toJSON(tempR);
  const curric = curricR ? (curricR as any).toJSON() : null;

  // Resolve campaign names for the campaign events.
  const campIds = Array.from(new Set(campLeads.map((c) => c.campaign_id).filter(Boolean)));
  const campaigns = campIds.length ? toJSON(await safe(Campaign.findAll({ where: { id: { [Op.in]: campIds } }, attributes: ['id', 'name'] }), [])) : [];
  const campName = new Map(campaigns.map((c) => [c.id, c.name]));

  // This person may span more than one enrollment row (an Open House Explorer row
  // that holds the $50 deposit, a separate paid membership row, plus stray abandoned
  // signups). Aggregate payments + deposits across EVERY enrollment sharing this email
  // so the profile shows everything they actually paid — not just this one row.
  const siblings: any[] = email
    ? toJSON(await safe(Enrollment.findAll({ where: { email: { [Op.iLike]: email } }, order: [['created_at', 'ASC']] }), [e]))
    : [e];
  const siblingIds = siblings.map((s) => s.id);
  const [creditsR, sibSubsR] = await Promise.all([
    safe(AccountCredit.findAll({ where: { enrollment_id: { [Op.in]: siblingIds } } }), []),
    safe(Subscription.findAll({ where: { enrollment_id: { [Op.in]: siblingIds } } }), []),
  ]);
  const credits = toJSON(creditsR);
  const subsJson: any[] = toJSON(sibSubsR);
  const planByEnr = new Map<string, string>();
  for (const su of subsJson) if (su.plan) planByEnr.set(su.enrollment_id, su.plan);
  // Comped "Free Access" seat = an active 'comp' subscription on ANY enrollment
  // sharing this email — not just the one being viewed. subsJson is already scoped
  // to siblingIds (see the query above), so a comp row granted on a sibling row
  // (e.g. an Explorer-shaped duplicate) still reads as "has Free Access" here;
  // without this, the drawer showed "Grant Free Access" for someone who already had
  // it, because the comp subscription happened to live on a different enrollment
  // row for the same person (confirmed live: Brianna Woodard, 2026-07-31).
  const freeAccess = subsJson.some((su) => su.plan === 'comp' && su.status === 'active');
  const totalPaid = siblings.reduce((sum, s) => sum + (s.payment_status === 'paid' ? Number(s.amount_paid || 0) : 0), 0)
    + credits.filter((c) => c.status !== 'void').reduce((sum, c) => sum + Number(c.amount_cents || 0) / 100, 0);

  const t: TimelineEvent[] = [];
  t.push({ at: e.created_at ?? null, kind: 'registered', icon: 'user-add-line', tone: 'info',
    title: e.enrollment_type === 'explorer' ? 'Registered as Explorer (free)' : 'Enrolled',
    detail: e.cohort?.name || undefined });
  if (l?.created_at && new Date(l.created_at).getTime() < new Date(e.created_at ?? 0).getTime() - 60000) {
    t.push({ at: l.created_at, kind: 'lead', icon: 'user-search-line', tone: 'neutral', title: 'First seen as a lead', detail: l.source || undefined });
  }
  // Membership payments — one per paid enrollment row across this email (a person
  // can have their deposit on one row and their membership on another).
  for (const s of siblings.filter((x) => x.payment_status === 'paid' && x.amount_paid != null)) {
    t.push({ at: s.enrolled_at || s.created_at || null, kind: 'payment', icon: 'bank-card-line', tone: 'success',
      title: 'Membership payment', detail: `$${s.amount_paid}${planByEnr.get(s.id) ? ' · ' + planByEnr.get(s.id) : ''}` });
  }
  // Open House deposits ($50 "hold your spot" — separate cash from the membership).
  for (const c of credits) {
    t.push({ at: c.created_at || null, kind: 'deposit', icon: 'ticket-2-line',
      tone: c.status === 'void' ? 'danger' : 'success',
      title: 'Open House deposit', detail: `$${c.amount_cents / 100}${c.status !== 'available' ? ' · ' + c.status : ''}` });
  }
  for (const c of comms) t.push({ at: c.created_at ?? null, kind: 'email',
    icon: c.direction === 'inbound' ? 'inbox-line' : 'mail-send-line',
    tone: (c.status === 'failed' || c.status === 'bounced') ? 'danger' : (c.status === 'opened' || c.status === 'clicked') ? 'success' : 'neutral',
    title: `${c.direction === 'inbound' ? 'Received' : 'Sent'}: ${c.subject || '(no subject)'}`,
    detail: [c.channel, c.status, c.provider].filter(Boolean).join(' · ') });
  for (const c of campLeads) t.push({ at: c.enrolled_at || c.created_at || null, kind: 'campaign', icon: 'megaphone-line', tone: 'info',
    title: `Campaign: ${campName.get(c.campaign_id) || 'Unknown'}`,
    detail: [c.status, c.current_step_index != null ? `step ${c.current_step_index}/${c.total_steps ?? '?'}` : null].filter(Boolean).join(' · ') });
  for (const n of nav) t.push({ at: n.created_at ?? null, kind: 'nav', icon: 'compass-3-line', tone: 'neutral',
    title: `Visited ${n.page || n.event_type || 'the portal'}`, detail: n.page ? n.event_type : undefined });
  for (const s of subs) t.push({ at: s.submitted_at || s.created_at || null, kind: 'submission', icon: 'file-upload-line',
    tone: s.status === 'reviewed' ? 'success' : 'info',
    title: `Submitted: ${s.title || s.assignment_type || 'assignment'}`,
    detail: [s.status, s.score != null ? `score ${s.score}` : null].filter(Boolean).join(' · ') });
  for (const a of att) t.push({ at: a.join_time || a.created_at || null, kind: 'attendance', icon: 'calendar-check-line',
    tone: a.status === 'present' ? 'success' : a.status === 'absent' ? 'danger' : 'warning',
    title: `Session: ${a.session?.title || 'live session'}`, detail: a.status });
  for (const li of lessons.filter((x) => x.completed_at)) t.push({ at: li.completed_at, kind: 'lesson', icon: 'book-open-line', tone: 'success',
    title: 'Completed a lesson', detail: li.quiz_score != null ? `quiz ${li.quiz_score}` : undefined });
  for (const s of sched) t.push({ at: s.scheduled_for ?? null, kind: 'scheduled', icon: 'time-line', tone: 'warning',
    title: `Scheduled: ${s.subject || s.channel || 'message'}`, detail: `${s.channel || 'email'} · pending` });
  for (const th of temp) t.push({ at: th.created_at ?? null, kind: 'temperature', icon: 'fire-line',
    tone: th.new_temperature === 'hot' ? 'danger' : th.new_temperature === 'warm' ? 'warning' : 'neutral',
    title: `Engagement → ${th.new_temperature}`, detail: th.trigger_type || undefined });

  t.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  return {
    profile: {
      id: e.id, full_name: e.full_name, email: e.email, company: e.company, title: e.title, phone: e.phone,
      cohort: e.cohort?.name || null, enrollment_type: e.enrollment_type, payment_status: e.payment_status,
      portal_enabled: e.portal_enabled, status: e.status, created_at: e.created_at, notes: e.notes,
      free_access: freeAccess, // active comped ('Free Access') seat on this enrollment
      total_paid: totalPaid, // membership + deposits across all of this email's enrollment rows
      enrollment_records: siblings.length, // >1 means the same person spans multiple enrollment rows
    },
    acquisition: l ? {
      source: l.source, form_type: l.form_type, utm_source: l.utm_source, utm_campaign: l.utm_campaign,
      page_url: l.page_url, lead_source_type: l.lead_source_type, status: l.status, pipeline_stage: l.pipeline_stage,
      lead_score: l.lead_score, lead_temperature: l.lead_temperature, last_contacted_at: l.last_contacted_at, first_seen: l.created_at,
    } : null,
    curriculum: curric ? {
      goal: curric.goal, ai_maturity_level: curric.ai_maturity_level, identified_use_case: curric.identified_use_case,
    } : null,
    project: projects.length ? {
      name: projects[0].name, stage: projects[0].project_stage, maturity: projects[0].maturity_score,
      requirements_pct: projects[0].requirements_completion_pct, github: projects[0].github_repo_url,
    } : null,
    summary: {
      emails: comms.length,
      campaigns: campLeads.length,
      sessionsAttended: att.filter((a) => a.status === 'present').length,
      submissions: subs.length,
      pagesViewed: nav.length,
      lessonsCompleted: lessons.filter((x) => x.completed_at).length,
    },
    timeline: t.slice(0, 150),
  };
}
