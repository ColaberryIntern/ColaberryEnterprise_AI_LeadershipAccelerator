import { useRef } from 'react';
import UserInputForm from './components/UserInputForm';
import FeedbackForm from './components/FeedbackForm';
import SummaryList from './components/SummaryList';

export default function App() {
  // STORY-014: lazy-generated per-tab session id, passed through to
  // ProvenanceTrail so its audit-logged reads aren't anonymous when
  // possible. Scoped to this component only -- UserInputForm/FeedbackForm's
  // own session handling is unchanged (not this story's scope).
  const sessionIdRef = useRef(crypto.randomUUID());

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
