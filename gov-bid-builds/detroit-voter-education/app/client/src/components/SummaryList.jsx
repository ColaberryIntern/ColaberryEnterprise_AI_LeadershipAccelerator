import { useEffect, useState } from 'react';
import ProvenanceTrail from './ProvenanceTrail';

// STORY-014's parent view: nothing previously fetched/rendered STORY-012's
// public summaries API (`/api/public/summaries`) -- this is the minimal
// frontend flow needed to actually see a published summary, without which
// ProvenanceTrail would have nothing to mount inside.
export default function SummaryList({ sessionId }) {
  const [status, setStatus] = useState('loading'); // loading | loaded | error
  const [summaries, setSummaries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/summaries');
        if (!res.ok) throw new Error('Failed to load summaries');
        const data = await res.json();
        if (!cancelled) {
          setSummaries(data);
          setStatus('loaded');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="summary-list" aria-label="Officeholder and candidate summaries">
      <h2>Officeholders &amp; Candidates</h2>
      <p>Plain-language summaries of positions on issues you care about.</p>

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
              <ProvenanceTrail subjectId={s.subject_id} sessionId={sessionId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
