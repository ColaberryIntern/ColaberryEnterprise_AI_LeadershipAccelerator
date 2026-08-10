import { useState } from 'react';

// STORY-014: "why am I seeing this" trail. Fetches lazily (only when the
// resident expands it) rather than on every summary render, so viewing a
// list of summaries doesn't fire an audit-logged provenance read for every
// card whether the resident looks at it or not.
export default function ProvenanceTrail({ subjectId, sessionId }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | loaded | error
  const [trail, setTrail] = useState([]);

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (status === 'loaded') return;

    setStatus('loading');
    try {
      const url = sessionId
        ? `/api/public/summaries/${subjectId}/provenance?sessionId=${encodeURIComponent(sessionId)}`
        : `/api/public/summaries/${subjectId}/provenance`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load provenance trail');
      const data = await res.json();
      setTrail(data.trail || []);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="provenance-trail">
      <button
        type="button"
        className="provenance-trail__toggle"
        onClick={handleToggle}
        aria-expanded={expanded}
      >
        {expanded ? 'Hide' : 'Why am I seeing this?'}
      </button>

      {expanded && (
        <div className="provenance-trail__content" role="region" aria-label="Source citations">
          {status === 'loading' && <p className="hint">Loading sources…</p>}
          {status === 'error' && <p className="error">Couldn't load sources — try again.</p>}
          {status === 'loaded' && trail.length === 0 && (
            <p className="hint">No source citations recorded for this summary.</p>
          )}
          {status === 'loaded' && trail.length > 0 && (
            <ul className="provenance-trail__list">
              {trail.map((entry) => (
                <li key={entry.issue} className="provenance-trail__item">
                  <strong>{entry.issue}:</strong> {entry.recordType}
                  {entry.retrievedAt && <span className="provenance-trail__date"> · retrieved {entry.retrievedAt}</span>}
                  {entry.sourceUrl && (
                    <>
                      {' '}
                      <a href={entry.sourceUrl} target="_blank" rel="noreferrer noopener">
                        View source document
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
