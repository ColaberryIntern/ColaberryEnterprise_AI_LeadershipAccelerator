import AdminFeedbackDashboard from './components/AdminFeedbackDashboard';
import SystemHealthDashboard from './components/SystemHealthDashboard';
import PendingApprovalsDashboard from './components/PendingApprovalsDashboard';
import RecentActionsDashboard from './components/RecentActionsDashboard';
import AnomaliesDashboard from './components/AnomaliesDashboard';
import GovernanceScoreDashboard from './components/GovernanceScoreDashboard';

// Single source of truth for the admin page set -- App.jsx's pathname
// lookup and AdminNav's menu both read this instead of keeping two
// separate lists in sync by hand.
export const ADMIN_PAGES = [
  { path: '/admin/health', label: 'System Health', Component: SystemHealthDashboard },
  { path: '/admin/pending-approvals', label: 'Pending Approvals', Component: PendingApprovalsDashboard },
  { path: '/admin/recent-actions', label: 'Recent Actions', Component: RecentActionsDashboard },
  { path: '/admin/anomalies', label: 'Anomalies', Component: AnomaliesDashboard },
  { path: '/admin/governance', label: 'Governance Score', Component: GovernanceScoreDashboard },
  { path: '/admin/feedback', label: 'Feedback Review', Component: AdminFeedbackDashboard },
];
