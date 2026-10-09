import { useEffect, useState } from 'react';
import ProvenanceTrail from './ProvenanceTrail';
import SubscribeToggle from './SubscribeToggle';
import UpdatesBanner from './UpdatesBanner';

// STORY-014's parent view: nothing previously fetched/rendered STORY-012's
// public summaries API (`/api/public/summaries`) -- this is the minimal
// frontend flow needed to actually see a published summary, without which
// ProvenanceTrail would have nothing to mount inside.
export default function SummaryList({ sessionId, city }) {
  const [status, setStatus] = useState('loading'); // loading | loaded | error
  const [summaries, setSummaries] = useState([]);
  const [subscribed, setSubscribed] = useState(new Set());
  const [busySubjectId, setBusySubjectId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        // STORY-007: city comes from App.jsx, resolved by UserInputForm from
        // the resident's ZIP. Omitted (null, before a ZIP is resolved) ->
        // unfiltered, same as this component's behavior before this story.
        const summariesUrl = city
          ? `/api/public/summaries?city=${encodeURIComponent(city)}`
          : '/api/public/summaries';
        const [summariesRes, subsRes] = await Promise.all([
          fetch(summariesUrl),
          fetch(`/api/subscriptions/${sessionId}`),
        ]);
        if (!summariesRes.ok) throw new Error('Failed to load summaries');
        const summariesData = await summariesRes.json();
        const subsData = subsRes.ok ? await subsRes.json() : { subjectIds: [] };
        if (!cancelled) {
          setSummaries(summariesData);
          setSubscribed(new Set(subsData.subjectIds || []));
          setStatus('loaded');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, city]);

  const handleToggleSubscribe = async (subjectId) => {
    setBusySubjectId(subjectId);
    const isSubscribed = subscribed.has(subjectId);
    try {
      if (isSubscribed) {
        await fetch(`/api/subscriptions/${subjectId}?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      } else {
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, subjectId }),
        });
      }
      setSubscribed((prev) => {
        const next = new Set(prev);
        if (isSubscribed) next.delete(subjectId); else next.add(subjectId);
        return next;
      });
      setRefreshKey((k) => k + 1);
    } finally {
      setBusySubjectId(null);
    }
  };

  return (
    <section className="summary-list" aria-label="Officeholder and candidate summaries">
      <h2>Officeholders &amp; Candidates</h2>
      <p>Plain-language summaries of positions on issues you care about.</p>

      <UpdatesBanner sessionId={sessionId} refreshKey={refreshKey} />

      {status === 'loading' && <p className="hint">Loading summaries…</p>}
      {status === 'error' && <p className="error">Couldn't load summaries — try again later.</p>}
      {status === 'loaded' && summaries.length === 0 && (
        <p className="hint">No published summaries yet.</p>
      )}

      {status === 'loaded' && summaries.length > 0 && (
        <ul className="summary-list__items">
          {summaries.map((s) => (
            <li key={s.subject_id} className="summary-card">
              <h3>{s.name}</h3>
              <p className="summary-card__office">{s.office} · {s.jurisdiction}</p>
              <p className="summary-card__text">{s.summary_text}</p>
              <div className="summary-card__actions">
                <ProvenanceTrail subjectId={s.subject_id} sessionId={sessionId} />
                <SubscribeToggle
                  subscribed={subscribed.has(s.subject_id)}
                  busy={busySubjectId === s.subject_id}
                  onToggle={() => handleToggleSubscribe(s.subject_id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
