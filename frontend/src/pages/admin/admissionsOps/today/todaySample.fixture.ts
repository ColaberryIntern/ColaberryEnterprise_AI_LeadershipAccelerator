/**
 * A small Today payload for frontend tests only (nothing in the app imports it). Invented names, the backend sample's
 * shape: three items over two sections, one depending on a system that is down.
 */
import type { TodayPayload } from '../../../../services/admissionsOpsApi';

export const TODAY_SAMPLE: TodayPayload = {
  sample: true,
  generated_at: '2026-11-30T15:00:00.000Z',
  briefing: { headline: '2 things need you today.', start_with: 'Paid but not activated: Marcus Bell', detail: 'Every draft is waiting in Approvals. Nothing has been sent.' },
  target: { target: 150, confirmed_paid: 2, days_left: 34, assumed_rate: 0.08, remaining: 148, daily_required: 5, prospects_needed: 1850, source: 'paysimple', pulled_at: '2026-11-30T14:51:00.000Z' },
  sections: [
    { id: 'admissions', label: 'Admissions', count: 1, systems: ['ghl', 'app_colaberry'] },
    { id: 'communications', label: 'Communications', count: 0, systems: ['gmail', 'ghl', 'zendesk'] },
    { id: 'students', label: 'Student ops', count: 1, systems: ['app_colaberry', 'zendesk'] },
    { id: 'payments', label: 'Payments', count: 1, systems: ['paysimple', 'tfc'] },
    { id: 'compliance', label: 'Compliance', count: 0, systems: ['gmail', 'app_colaberry'] },
    { id: 'events', label: 'Events', count: 0, systems: ['ghl', 'gmail'] },
  ],
  queue: [
    { id: 'q-marcus', section: 'admissions', when: 'today', trigger: 'Paid but not activated', subject: { kind: 'student', label: 'Marcus Bell', ref: 'sample-marcus-bell' },
      why: 'Payment cleared; no dashboard access yet.', systems_checked: ['paysimple', 'app_colaberry'], next_step: 'Open profile', approval: 'needs_approval',
      pulled_at: '2026-11-30T14:51:00.000Z', down_systems: [] },
    { id: 'q-ticket', section: 'students', when: 'today', trigger: 'Overdue support ticket', subject: { kind: 'group', label: 'Access issue open in Zendesk', ref: null },
      why: 'Activation never ran.', systems_checked: ['zendesk', 'app_colaberry'], next_step: 'Open ticket', approval: 'needs_approval',
      pulled_at: '2026-11-30T11:50:00.000Z', down_systems: ['zendesk'] },
    { id: 'q-tfc', section: 'payments', when: 'this_week', trigger: 'TFC audit', subject: { kind: 'group', label: 'Cancelled contracts need confirmation', ref: null },
      why: 'Audit sheet updated.', systems_checked: ['tfc'], next_step: 'Open audit', approval: 'read_only',
      pulled_at: '2026-11-30T12:40:00.000Z', down_systems: [] },
  ],
  may_do: [
    { level: 1, name: 'Retrieve', rule: 'r' }, { level: 2, name: 'Analyze', rule: 'a' }, { level: 3, name: 'Prepare for approval', rule: 'p' },
    { level: 4, name: 'Routine actions', rule: 'None authorized yet.' }, { level: 5, name: 'Mandatory approval', rule: 'm' },
  ],
  systems: [
    { id: 'ghl', name: 'GHL', record_for: 'x', status: 'ok', synced_at: '2026-11-30T14:56:00.000Z' },
    { id: 'app_colaberry', name: 'app.colaberry', record_for: 'x', status: 'ok', synced_at: '2026-11-30T14:58:00.000Z' },
    { id: 'retool', name: 'Retool', record_for: 'x', status: 'stale', synced_at: '2026-11-29T13:00:00.000Z' },
    { id: 'tfc', name: 'TFC portal', record_for: 'x', status: 'ok', synced_at: '2026-11-30T12:40:00.000Z' },
    { id: 'paysimple', name: 'PaySimple', record_for: 'x', status: 'ok', synced_at: '2026-11-30T14:51:00.000Z' },
    { id: 'gmail', name: 'Gmail', record_for: 'x', status: 'ok', synced_at: '2026-11-30T14:54:00.000Z' },
    { id: 'zendesk', name: 'Zendesk', record_for: 'x', status: 'down', synced_at: '2026-11-30T11:50:00.000Z' },
    { id: 'sheets', name: 'Google Sheets', record_for: 'x', status: 'not_connected', synced_at: null },
  ],
};
