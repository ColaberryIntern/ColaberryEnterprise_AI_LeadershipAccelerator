import UserInputForm from './components/UserInputForm';
import FeedbackForm from './components/FeedbackForm';

export default function App() {
  return (
    <main>
      <header>
        <h1>Detroit Voter Education</h1>
        <p>Personalized voter information for Detroit residents.</p>
      </header>
      <UserInputForm />
      <FeedbackForm />
    </main>
  );
}
