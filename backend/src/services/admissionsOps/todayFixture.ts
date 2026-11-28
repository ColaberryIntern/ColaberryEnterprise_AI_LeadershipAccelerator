/**
 * The Release 1 Today sample (AO2.1). Invented names and numbers from the kit demo (docs/admissions-ops/demo/index.html,
 * already sanitized for this public repo); `sample: true` makes the screen say so on every view. Release 3 (AO5.2)
 * replaces this with alerts and a targets table and keeps the sample for non-production only.
 *
 * Deterministic: every time is relative to the `now` passed in. Section counts, the briefing and each item's freshness
 * are DERIVED from the queue and the systems, never typed, so the filters always agree with the list.
 * Zendesk is down and Retool is stale in the sample, so the down and stale paths render and are tested.
 */
import { planTarget } from './targetMath';
import { TodayPayload, type QueueItem, type SectionId, type SystemId, type SourceStatus } from './todaySchema';

const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000).toISOString();

const SYSTEMS: Array<{ id: SystemId; name: string; record_for: string; status: SourceStatus; age_min: number | null }> = [
  { id: 'ghl', name: 'GHL', record_for: 'Lead and opportunity status', status: 'ok', age_min: 4 },
  { id: 'app_colaberry', name: 'app.colaberry', record_for: 'Registration, enrollment and academic progress', status: 'ok', age_min: 2 },
  { id: 'retool', name: 'Retool', record_for: 'Internal administration', status: 'stale', age_min: 26 * 60 },
  { id: 'tfc', name: 'TFC portal', record_for: 'TFC contract status', status: 'ok', age_min: 140 },
  { id: 'paysimple', name: 'PaySimple', record_for: 'Transactions and recurring payments', status: 'ok', age_min: 9 },
  { id: 'gmail', name: 'Gmail', record_for: 'Email', status: 'ok', age_min: 6 },
  { id: 'zendesk', name: 'Zendesk', record_for: 'Support tickets', status: 'down', age_min: 190 },
  { id: 'sheets', name: 'Google Sheets', record_for: 'Supplementary tracking', status: 'ok', age_min: 55 },
];

const SECTION_DEFS: Array<{ id: SectionId; label: string; systems: SystemId[] }> = [
  { id: 'admissions', label: 'Admissions', systems: ['ghl', 'app_colaberry'] },
  { id: 'communications', label: 'Communications', systems: ['gmail', 'ghl', 'zendesk'] },
  { id: 'students', label: 'Student ops', systems: ['app_colaberry', 'zendesk'] },
  { id: 'payments', label: 'Payments', systems: ['paysimple', 'tfc'] },
  { id: 'compliance', label: 'Compliance', systems: ['gmail', 'app_colaberry'] },
  { id: 'events', label: 'Events', systems: ['ghl', 'gmail'] },
];

type Row = Omit<QueueItem, 'pulled_at' | 'down_systems'>;
const ROWS: Row[] = [
  { id: 'q-renee', section: 'payments', when: 'today', trigger: 'Cancelled contract, active student', subject: { kind: 'student', label: 'Renee Okafor', ref: 'sample-renee-okafor' },
    why: 'TFC cancelled her contract for nonpayment, but she is still active in IPBC. TFC has not confirmed charge-off, so nothing is treated as forgiven.',
    systems_checked: ['tfc', 'app_colaberry', 'paysimple'], next_step: 'Open profile', approval: 'read_only' },
  { id: 'q-marcus', section: 'admissions', when: 'today', trigger: 'Paid but not activated', subject: { kind: 'student', label: 'Marcus Bell', ref: 'sample-marcus-bell' },
    why: 'Annual membership payment cleared. He has no cohort and no dashboard access yet.',
    systems_checked: ['paysimple', 'app_colaberry'], next_step: 'Open profile', approval: 'needs_approval' },
  { id: 'q-dana', section: 'payments', when: 'today', trigger: 'Recurring payment failure', subject: { kind: 'student', label: 'Dana Whitfield', ref: 'sample-dana-whitfield' },
    why: 'Monthly membership payment failed twice. A payment-assistance email is drafted and waiting.',
    systems_checked: ['paysimple', 'gmail'], next_step: 'Open profile', approval: 'needs_approval' },
  { id: 'q-wioa', section: 'compliance', when: 'today', trigger: 'Workforce deadline', subject: { kind: 'group', label: 'WIOA attendance verification due this week', ref: null },
    why: 'A Workforce Solutions counselor asked for attendance dates. The letter is drafted from verified records.',
    systems_checked: ['gmail', 'app_colaberry'], next_step: 'Review letter', approval: 'needs_approval' },
  { id: 'q-crm', section: 'payments', when: 'today', trigger: 'CRM revenue mismatch', subject: { kind: 'group', label: '3 Won opportunities, $1,250 revenue in GHL', ref: null },
    why: 'None of the three Won opportunities has a matching payment yet. Verify before the weekly report goes out.',
    systems_checked: ['ghl', 'paysimple'], next_step: 'Reconcile', approval: 'read_only' },
  { id: 'q-unpaid', section: 'admissions', when: 'today', trigger: 'Registered but unpaid', subject: { kind: 'group', label: '14 AI registrants have not picked a paid plan', ref: null },
    why: 'One personal follow-up drafted for each, based on their last conversation.',
    systems_checked: ['app_colaberry', 'ghl', 'gmail'], next_step: 'Review 14 drafts', approval: 'bulk_needs_approval' },
  { id: 'q-ticket', section: 'students', when: 'today', trigger: 'Overdue support ticket', subject: { kind: 'group', label: 'Access issue open 5 days in Zendesk', ref: null },
    why: 'The student paid and enrolled, but activation never ran. The existing ticket was found, so no second thread gets opened.',
    systems_checked: ['zendesk', 'paysimple', 'app_colaberry'], next_step: 'Open ticket', approval: 'needs_approval' },
  { id: 'q-inactive', section: 'students', when: 'this_week', trigger: 'Student inactivity', subject: { kind: 'group', label: '6 November AI cohort students have not started', ref: null },
    why: 'No module activity since their welcome session. A check-in is drafted.',
    systems_checked: ['app_colaberry'], next_step: 'See students', approval: 'needs_approval' },
  { id: 'q-email', section: 'communications', when: 'this_week', trigger: 'Unanswered email', subject: { kind: 'group', label: '4 student emails waiting more than 48 hours', ref: null },
    why: 'Two payment-plan questions and two re-enrollment requests. Replies are drafted from each student record.',
    systems_checked: ['gmail', 'ghl'], next_step: 'Review replies', approval: 'needs_approval' },
  { id: 'q-tfc', section: 'payments', when: 'this_week', trigger: 'TFC audit', subject: { kind: 'group', label: '15 cancelled contracts need confirmation', ref: null },
    why: '28 accounts audited: 4 completed, 9 withdrawn, 15 cancelled. 6 have no withdrawal request on file.',
    systems_checked: ['tfc', 'sheets', 'gmail'], next_step: 'Open audit', approval: 'read_only' },
  { id: 'q-openhouse', section: 'events', when: 'this_week', trigger: 'Open House follow-up', subject: { kind: 'group', label: '9 attendees have not enrolled', ref: null },
    why: 'Follow-ups are drafted for attendees, with a separate note for no-shows.',
    systems_checked: ['ghl', 'gmail'], next_step: 'Review drafts', approval: 'bulk_needs_approval' },
];

const MAY_DO = [
  { level: 1, name: 'Retrieve', rule: 'Searches records within your access, on its own.' },
  { level: 2, name: 'Analyze', rule: 'Summaries, comparisons and discrepancy flags, on its own.' },
  { level: 3, name: 'Prepare for approval', rule: 'Drafts only. A person sends or applies.' },
  { level: 4, name: 'Routine actions', rule: 'None authorized yet. Each runs as a draft until you allow it in Setup.' },
  { level: 5, name: 'Mandatory approval', rule: 'Refunds, recalls, adjustments, suspensions, bulk sends: prepared, never executed.' },
];

export function buildTodaySample(now: Date): TodayPayload {
  const systems = SYSTEMS.map((s) => ({ id: s.id, name: s.name, record_for: s.record_for, status: s.status, synced_at: s.age_min === null ? null : minutesAgo(now, s.age_min) }));
  const byId = new Map(systems.map((s) => [s.id, s]));
  const queue: QueueItem[] = ROWS.map((r) => {
    const times = r.systems_checked.map((id) => byId.get(id)!.synced_at);
    const pulled = times.includes(null) ? null : times.reduce((a, b) => ((a as string) < (b as string) ? a : b));
    return { ...r, pulled_at: pulled, down_systems: r.systems_checked.filter((id) => byId.get(id)!.status === 'down') };
  });
  const today = queue.filter((q) => q.when === 'today');
  const first = today[0] ?? null;
  const plan = planTarget(150, 2, 34, 0.08);
  return {
    sample: true,
    generated_at: now.toISOString(),
    briefing: {
      headline: `${today.length} ${today.length === 1 ? 'thing needs' : 'things need'} you today.`,
      start_with: first ? `${first.trigger}: ${first.subject.label}` : null,
      detail: 'Every draft is waiting in Approvals. Nothing has been sent.',
    },
    target: { target: 150, confirmed_paid: 2, days_left: 34, assumed_rate: 0.08, ...plan, source: 'paysimple', pulled_at: byId.get('paysimple')!.synced_at },
    sections: SECTION_DEFS.map((d) => ({ ...d, count: queue.filter((q) => q.section === d.id).length })),
    queue,
    may_do: MAY_DO,
    systems,
  };
}
