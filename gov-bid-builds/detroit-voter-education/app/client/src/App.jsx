import { useRef } from 'react';
import UserInputForm from './components/UserInputForm';
import FeedbackForm from './components/FeedbackForm';
import SummaryList from './components/SummaryList';
import AdminFeedbackDashboard from './components/AdminFeedbackDashboard';
import SystemHealthDashboard from './components/SystemHealthDashboard';

// STORY-022/025: a plain pathname check, not a routing library -- this app
// has a couple of admin pages and no other reason to add react-router-dom
// as a dependency for a small number of conditionals. Works in both Vite
// dev (SPA fallback serves index.html for unmatched paths by default) and
// production (server.js's catch-all route does the same).
const IS_ADMIN_FEEDBACK_PATH = typeof window !== 'undefined' && window.location.pathname === '/admin/feedback';
const IS_ADMIN_HEALTH_PATH = typeof window !== 'undefined' && window.location.pathname === '/admin/health';

export default function App() {
  // STORY-014: lazy-generated per-tab session id, passed through to
  // ProvenanceTrail so its audit-logged reads aren't anonymous when
  // possible. Scoped to this component only -- UserInputForm/FeedbackForm's
  // own session handling is unchanged (not this story's scope).
  const sessionIdRef = useRef(crypto.randomUUID());

  if (IS_ADMIN_FEEDBACK_PATH) {
    return (
      <main>
        <header>
          <h1>Detroit Voter Education</h1>
          <p>Admin tools.</p>
        </header>
        <AdminFeedbackDashboard />
      </main>
    );
  }

  if (IS_ADMIN_HEALTH_PATH) {
    return (
      <main>
        <header>
          <h1>Detroit Voter Education</h1>
          <p>Admin tools.</p>
        </header>
        <SystemHealthDashboard />
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
