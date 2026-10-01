import { useState } from 'react';

// STORY-022: first admin-facing UI in this app. Reuses the same x-admin-key
// header every other admin route already relies on (dataExport,
// accessibilityAudit, dataIngestion, governmentData) -- the key is typed
// into a local field and kept only in component state (not localStorage),
// never embedded in the built bundle. This is explicitly a rehearsal-scope
// shared-key model, not real per-admin authentication -- see
// decision-record-STORY-022.md for why that's an intentional, flagged
// limitation rather than an oversight.
const FEEDBACK_TYPES = ['accessibility', 'general', 'bug', 'data_error', 'other'];

export default function AdminFeedbackDashboard() {
  const [adminKey, setAdminKey] = useState('');
  const [filterType, setFilterType] = useState('accessibility');
  const [status, setStatus] = useState('idle'); // idle | loading | loaded | error | unauthorized
  const [items, setItems] = useState([]);
  const [reviewingId, setReviewingId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});

  const loadFeedback = async () => {
    setStatus('loading');
    try {
      const url = filterType === 'all' ? '/api/feedback' : `/api/feedback?type=${encodeURIComponent(filterType)}`;
      const res = await fetch(url, { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) {
        setStatus('unauthorized');
        return;
      }
      if (!res.ok) throw new Error('Failed to load feedback');
      const data = await res.json();
      setItems(data);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  };

  const markReviewed = async (id) => {
    setReviewingId(id);
    try {
      const res = await fetch(`/api/feedback/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ adminId: 'city-content-admin', notes: noteDrafts[id] || '' }),
      });
      if (!res.ok) throw new Error('Failed to mark reviewed');
      const { reviewedAt } = await res.json();
      setItems((prev) => prev.map((item) => (
        item.id === id ? { ...item, reviewed_by: 'city-content-admin', reviewed_at: reviewedAt } : item
      )));
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <section className="admin-feedback-dashboard" aria-label="Accessibility feedback review dashboard">
      <h2>Feedback Review — City Content Admin</h2>
      <p>Rehearsal-only: authenticates with a shared admin key, not real per-admin login. See STORY-022 decision record.</p>

      <div className="field">
        <label htmlFor="admin-key">Admin key</label>
        <input
          id="admin-key"
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="feedback-filter">Feedback type</label>
        <select id="feedback-filter" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          {FEEDBACK_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <button type="button" onClick={loadFeedback} disabled={!adminKey || status === 'loading'}>
        {status === 'loading' ? 'Loading…' : 'Load feedback'}
      </button>

      {status === 'unauthorized' && <p className="error" role="alert">Invalid admin key.</p>}
      {status === 'error' && <p className="error" role="alert">Couldn't load feedback — try again.</p>}

      {status === 'loaded' && items.length === 0 && (
        <p className="hint">No feedback of this type yet.</p>
      )}

      {status === 'loaded' && items.length > 0 && (
        <ul className="admin-feedback-dashboard__list">
          {items.map((item) => (
            <li key={item.id} className="admin-feedback-dashboard__item">
              <div className="admin-feedback-dashboard__meta">
                <strong>{item.type}</strong> · {new Date(item.created_at).toLocaleString()}
              </div>
              <p>{item.message}</p>
              {item.reviewed_at ? (
                <p className="admin-feedback-dashboard__reviewed" role="status">
                  Reviewed by {item.reviewed_by} at {new Date(item.reviewed_at).toLocaleString()}
                  {item.review_notes ? ` — "${item.review_notes}"` : ''}
                </p>
              ) : (
                <div className="admin-feedback-dashboard__review-actions">
                  <label htmlFor={`notes-${item.id}`}>Review notes (optional)</label>
                  <input
                    id={`notes-${item.id}`}
                    type="text"
                    value={noteDrafts[item.id] || ''}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => markReviewed(item.id)}
                    disabled={reviewingId === item.id}
                  >
                    {reviewingId === item.id ? 'Marking…' : 'Mark reviewed'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
