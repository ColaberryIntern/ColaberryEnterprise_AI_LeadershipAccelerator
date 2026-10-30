import { useState } from 'react';

const ISSUE_TYPES = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'data_error', label: 'Incorrect information' },
  { value: 'accessibility', label: 'Accessibility issue' },
  { value: 'other', label: 'Other' },
];

export default function FeedbackForm({ sessionId }) {
  const [type, setType] = useState('general');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId || null, type, message }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Submission failed');
        setStatus('error');
        return;
      }

      setStatus('success');
      setMessage('');
      setType('general');
    } catch {
      setErrorMsg('Network error — please try again');
      setStatus('error');
    }
  };

  const remaining = 2000 - message.length;
  const canSubmit = message.trim().length > 0 && status !== 'submitting';

  return (
    <section className="feedback-form" aria-label="Feedback form">
      <h2>Give Feedback</h2>
      <p>Help us improve the Detroit Voter Education platform.</p>

      {status === 'success' ? (
        <div className="confirmation" role="status">
          <strong>Thank you.</strong> Your feedback has been recorded.
          <br />
          <button
            className="link-btn"
            onClick={() => setStatus('idle')}
          >
            Submit more feedback
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="feedback-type">Type</label>
            <select
              id="feedback-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {ISSUE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="feedback-message">
              Message <span className="char-count">{remaining} left</span>
            </label>
            <textarea
              id="feedback-message"
              rows={5}
              maxLength={2000}
              placeholder="Describe your feedback or issue..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby="feedback-hint"
            />
            <span id="feedback-hint" className="hint">
              {remaining < 100 ? `${remaining} characters remaining` : ''}
            </span>
          </div>

          {status === 'error' && (
            <p className="error" role="alert">{errorMsg}</p>
          )}

          <button type="submit" disabled={!canSubmit}>
            {status === 'submitting' ? 'Submitting…' : 'Submit Feedback'}
          </button>
        </form>
      )}
    </section>
  );
}
