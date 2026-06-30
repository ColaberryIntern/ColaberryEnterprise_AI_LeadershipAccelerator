/**
 * adminNav.ts — admin sidebar information architecture.
 * Pinned links always show; labeled groups are collapsible (see AdminLayout).
 * `icon` is a RemixIcon name without the `ri-` prefix (the brand icon set,
 * loaded via src/colaberry/tokens/fonts.css).
 */
export interface NavLink { path: string; label: string; icon: string; }
export interface NavGroup { label: string | null; links: NavLink[]; }

/** Always-visible quick set above the collapsible groups. */
export const PINNED_LINKS: NavLink[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard-line' },
  { path: '/admin/trust', label: 'Trust Center', icon: 'shield-check-line' },
  { path: '/admin/war-room', label: 'War Room', icon: 'radar-line' },
];

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Revenue', links: [
    { path: '/admin/revenue', label: 'Revenue', icon: 'money-dollar-circle-line' },
    { path: '/admin/pipeline', label: 'Pipeline', icon: 'filter-3-line' },
    { path: '/admin/opportunities', label: 'Opportunities', icon: 'line-chart-line' },
    { path: '/admin/leads', label: 'Leads', icon: 'group-line' },
    { path: '/admin/funnel', label: 'Funnel', icon: 'filter-2-line' },
  ]},
  { label: 'Campaigns', links: [
    { path: '/admin/campaigns', label: 'Campaigns', icon: 'megaphone-line' },
    { path: '/admin/communications', label: 'Communications', icon: 'chat-3-line' },
    { path: '/admin/marketing', label: 'Marketing', icon: 'broadcast-line' },
    { path: '/admin/visitors', label: 'Visitors', icon: 'eye-line' },
  ]},
  { label: 'Lead Ingestion', links: [
    { path: '/admin/sources', label: 'Sources', icon: 'upload-cloud-2-line' },
    { path: '/admin/ingest-logs', label: 'Ingest Logs', icon: 'file-list-3-line' },
    { path: '/admin/routing-rules', label: 'Routing Rules', icon: 'node-tree' },
    { path: '/admin/autonomous', label: 'Autonomous', icon: 'lightbulb-flash-line' },
  ]},
  { label: 'Inbox & Content', links: [
    { path: '/admin/inbox', label: 'Inbox COS', icon: 'inbox-2-line' },
    { path: '/admin/missed-opportunities', label: 'Missed Opportunities', icon: 'mail-close-line' },
    { path: '/admin/content-queue', label: 'Content Queue', icon: 'article-line' },
  ]},
  { label: 'Program', links: [
    { path: '/admin/accelerator', label: 'Accelerator', icon: 'graduation-cap-line' },
    { path: '/admin/orchestration', label: 'Orchestration', icon: 'flow-chart' },
    { path: '/admin/projects', label: 'Projects', icon: 'rocket-2-line' },
  ]},
  { label: 'Intelligence', links: [
    { path: '/admin/ceo', label: 'CEO Command', icon: 'vip-crown-line' },
    { path: '/admin/cb-system', label: 'CB System', icon: 'robot-2-line' },
    { path: '/admin/intelligence', label: 'Intelligence OS', icon: 'cpu-line' },
    { path: '/admin/insights', label: 'Insights', icon: 'lightbulb-line' },
    { path: '/admin/governance', label: 'Governance', icon: 'shield-keyhole-line' },
    { path: '/admin/governance-policy', label: 'Governance Policies', icon: 'shield-star-line' },
  ]},
  { label: 'System', links: [
    { path: '/admin/tickets', label: 'Tickets', icon: 'ticket-2-line' },
    { path: '/admin/reports', label: 'Automated Reports', icon: 'mail-send-line' },
    { path: '/admin/settings', label: 'Settings', icon: 'settings-3-line' },
  ]},
];

/** Flat list for the "jump to" search. */
export const ALL_LINKS: NavLink[] = [
  ...PINNED_LINKS,
  ...NAV_GROUPS.flatMap((g) => g.links),
];
