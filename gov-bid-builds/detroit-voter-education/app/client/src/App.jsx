import { useRef, useState } from 'react';
import UserInputForm from './components/UserInputForm';
import FeedbackForm from './components/FeedbackForm';
import SummaryList from './components/SummaryList';
import AdminNav from './components/AdminNav';
import { ADMIN_PAGES } from './adminRoutes';

// STORY-022/025/026/027/028/029: a plain pathname lookup, not a routing
// library -- this app has a small, fixed set of admin pages and no other
// reason to add react-router-dom as a dependency. Works in both Vite dev
// (SPA fallback serves index.html for unmatched paths by default) and
// production (server.js's catch-all route does the same). Three
// near-identical per-path `if` blocks (STORY-022, STORY-025) became this
// map when STORY-026 would have been a fourth copy-paste. Now sourced from
// adminRoutes.js so App.jsx's lookup and AdminNav's menu can't drift apart.
const ADMIN_ROUTES = Object.fromEntries(ADMIN_PAGES.map(({ path, Component }) => [path, Component]));

export default function App() {
  // STORY-014: lazy-generated per-tab session id, passed through to
  // ProvenanceTrail so its audit-logged reads aren't anonymous when
  // possible. Scoped to this component only -- UserInputForm/FeedbackForm's
  // own session handling is unchanged (not this story's scope).
  const sessionIdRef = useRef(crypto.randomUUID());
  // STORY-007: resolved once the resident's ZIP is saved and looked up via
  // STORY-006's jurisdiction API. Lifted here (not local to UserInputForm)
  // so SummaryList can filter on it -- the two components have no other
  // shared parent state today.
  const [jurisdictionCity, setJurisdictionCity] = useState(null);

  const currentPath = typeof window !== 'undefined' ? window.location.pathname : undefined;
  const AdminPage = currentPath ? ADMIN_ROUTES[currentPath] : undefined;
  if (AdminPage) {
    return (
      <main>
        <header>
          <h1>Detroit Voter Education</h1>
          <p>Admin tools.</p>
        </header>
        <AdminNav currentPath={currentPath} />
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
      <UserInputForm onJurisdictionResolved={setJurisdictionCity} />
      <SummaryList sessionId={sessionIdRef.current} city={jurisdictionCity} />
      <FeedbackForm />
    </main>
  );
}
