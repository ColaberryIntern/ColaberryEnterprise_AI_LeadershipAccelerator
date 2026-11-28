/**
 * The Admissions & Ops Command Center's 16 screens, as data (AO1.4). One list feeds the section bar, the route
 * module, the placeholders and (AO2.2) the agent manifests, so they can never disagree.
 *
 * Kit: docs/admissions-ops/docs/SPEC.md sections 2.2, 2.4 and 4. Cross-links are the ones the demo draws beyond the
 * section bar (docs/admissions-ops/demo/*.html). `release` is when the screen stops being a placeholder.
 */
import { AGENT_NAME } from './agentConfig';

export const OPS_BASE = '/admin/admissions-ops';

export type ScreenId =
  | 'today' | 'admissions' | 'students' | 'student360' | 'academics' | 'payments' | 'tfcAudit' | 'support'
  | 'communications' | 'compliance' | 'reports' | 'weeklyReport' | 'agent' | 'approvals' | 'knowledge' | 'setup';

export interface OpsScreen {
  id: ScreenId;
  /** Path relative to OPS_BASE ('' is the index). Student 360 carries :ref. */
  path: string;
  title: string;
  /** Where it sits: a work section, a tool, or a screen opened from inside another. */
  place: 'work' | 'tool' | 'inner';
  /** The section-bar entry that is highlighted while this screen is open. */
  parent: ScreenId;
  /** What the screen will hold, in one sentence (shown on its placeholder; read by the agent). */
  holds: string;
  release: 1 | 2 | 3 | 4;
  links: ScreenId[];
}

export const SCREENS: readonly OpsScreen[] = [
  { id: 'today', path: '', title: 'Today', place: 'work', parent: 'today', release: 1, links: ['student360', 'tfcAudit', 'weeklyReport'],
    holds: 'The morning briefing, the enrollment target, and one queue of everything that needs attention, each item with its sources.' },
  { id: 'admissions', path: 'admissions', title: 'Admissions', place: 'work', parent: 'admissions', release: 3, links: ['student360', 'weeklyReport'],
    holds: 'Opportunity counts, the lifecycle from registration to onboarding, exceptions, follow-ups due and Open House tracks.' },
  { id: 'students', path: 'students', title: 'Students', place: 'work', parent: 'students', release: 2, links: ['student360', 'tfcAudit'],
    holds: 'Universal search and one row per person, with academic, contract, financial and placement status in separate columns.' },
  { id: 'student360', path: 'students/:ref', title: 'Student 360', place: 'inner', parent: 'students', release: 2, links: ['tfcAudit'],
    holds: 'One student across every system: how the match was made, four separate status cards, one history and what is not known yet.' },
  { id: 'academics', path: 'academics', title: 'Academics', place: 'work', parent: 'academics', release: 3, links: ['student360', 'tfcAudit'],
    holds: 'Cohorts, students who need a nudge, the status mix, membership anniversaries and completion.' },
  { id: 'payments', path: 'payments', title: 'Payments', place: 'work', parent: 'payments', release: 3, links: ['student360', 'tfcAudit'],
    holds: 'Reconciliation checks between two systems, failed recurring payments and the plan mix. Decisions go to Approvals.' },
  { id: 'tfcAudit', path: 'payments/tfc-audit', title: 'TFC audit', place: 'inner', parent: 'payments', release: 3, links: ['student360', 'weeklyReport'],
    holds: 'TFC accounts by category with contract, academic and payment status kept apart, and the exceptions to resolve.' },
  { id: 'support', path: 'support', title: 'Support', place: 'work', parent: 'support', release: 3, links: ['student360'],
    holds: 'Open tickets with what was checked, and the paid-without-access check: payment, enrollment, activation.' },
  { id: 'communications', path: 'communications', title: 'Communications', place: 'work', parent: 'communications', release: 3, links: ['student360', 'tfcAudit'],
    holds: 'One inbox across connected channels and a before-you-send panel. Drafts wait in Approvals; nothing is sent from here.' },
  { id: 'compliance', path: 'compliance', title: 'Compliance', place: 'work', parent: 'compliance', release: 3, links: ['student360'],
    holds: 'Agency requests, workforce invoices, missing documents and verification letters built from records.' },
  { id: 'reports', path: 'reports', title: 'Reports', place: 'work', parent: 'reports', release: 4, links: ['tfcAudit', 'weeklyReport'],
    holds: 'The reports that build themselves, each figure with its source, and the enrollment target tracker.' },
  { id: 'weeklyReport', path: 'reports/weekly-opportunity', title: 'Weekly Opportunity Report', place: 'inner', parent: 'reports', release: 4, links: ['tfcAudit'],
    holds: 'The weekly report as leadership receives it. Sending it is an approval.' },
  { id: 'agent', path: 'agent', title: `Ask ${AGENT_NAME}`, place: 'tool', parent: 'agent', release: 4, links: ['student360', 'tfcAudit', 'weeklyReport'],
    holds: `The full ${AGENT_NAME} workspace: requests by area, a visible investigation, the mode and the permission levels.` },
  { id: 'approvals', path: 'approvals', title: 'Approvals', place: 'tool', parent: 'approvals', release: 3, links: ['student360'],
    holds: `Everything ${AGENT_NAME} prepared and will not do alone. A person approves or holds, and the decision is recorded.` },
  { id: 'knowledge', path: 'knowledge', title: 'Knowledge', place: 'tool', parent: 'knowledge', release: 3, links: ['student360', 'tfcAudit'],
    holds: 'Versioned policies with effective dates, approved templates and saved findings. The current approved policy wins.' },
  { id: 'setup', path: 'setup', title: 'Setup', place: 'tool', parent: 'setup', release: 2, links: ['tfcAudit'],
    holds: `Connected systems and their freshness, what ${AGENT_NAME} may do per screen, alert thresholds and the audit log.` },
];

export function screenById(id: ScreenId): OpsScreen {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown screen ${id}`);
  return s;
}

/** The URL for a screen. Student 360 needs a ref; without one it falls back to the Students list. */
export function screenHref(id: ScreenId, ref?: string): string {
  const s = screenById(id);
  if (s.path.includes(':ref')) return ref ? `${OPS_BASE}/${s.path.replace(':ref', encodeURIComponent(ref))}` : `${OPS_BASE}/students`;
  return s.path ? `${OPS_BASE}/${s.path}` : OPS_BASE;
}

/** Section-bar entries: work sections left, tools right, in kit order. */
export const WORK_SECTIONS = SCREENS.filter((s) => s.place === 'work');
export const TOOL_SECTIONS = SCREENS.filter((s) => s.place === 'tool');
