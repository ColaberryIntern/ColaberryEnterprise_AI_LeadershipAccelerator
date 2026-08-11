import { useRef } from 'react';
import UserInputForm from './components/UserInputForm';
import FeedbackForm from './components/FeedbackForm';
import SummaryList from './components/SummaryList';
import AdminFeedbackDashboard from './components/AdminFeedbackDashboard';
import SystemHealthDashboard from './components/SystemHealthDashboard';
import PendingApprovalsDashboard from './components/PendingApprovalsDashboard';

// STORY-022/025/026: a plain pathname lookup, not a routing library -- this
// app has a small, fixed set of admin pages and no other reason to add
// react-router-dom as a dependency. Works in both Vite dev (SPA fallback
// serves index.html for unmatched paths by default) and production
// (server.js's catch-all route does the same). Three near-identical
// per-path `if` blocks (STORY-022, STORY-025) became this map when
// STORY-026 would have been a fourth copy-paste.
const ADMIN_ROUTES = {
  '/admin/feedback': AdminFeedbackDashboard,
  '/admin/health': SystemHealthDashboard,
  '/admin/pending-approvals': PendingApprovalsDashboard,
};

export default function App() {
  // STORY-014: lazy-generated per-tab session id, passed through to
  // ProvenanceTrail so its audit-logged reads aren't anonymous when
  // possible. Scoped to this component only -- UserInputForm/FeedbackForm's
  // own session handling is unchanged (not this story's scope).
  const sessionIdRef = useRef(crypto.randomUUID());

  const AdminPage = typeof window !== 'undefined' ? ADMIN_ROUTES[window.location.pathname] : undefined;
  if (AdminPage) {
    return (
      <main>
        <header>
          <h1>Detroit Voter Education</h1>
          <p>Admin tools.</p>
        </header>
        <AdminPage />
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>Detroit Voter Education</h1>
        <p>Personalized voter information for Detroit residents.</p>
      </header>
      <UserInputForm />
      <SummaryList sessionId={sessionIdRef.current} />
      <FeedbackForm />
    </main>
  );
}
