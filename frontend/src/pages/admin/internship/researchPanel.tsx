import React, { useCallback, useState } from 'react';
import {
  fetchResearchPacket, LEAD_LABEL, type ResearchPacket,
} from '../../../services/internNudgeApi';

/**
 * The research panel: what this intern asked, and the records that answer it.
 *
 * ## Why it is a button and not part of the brief
 *
 * The packet reads the shipped source tree and runs database lookups per identifier. That is worth
 * paying for on the handful of rows where somebody is genuinely waiting on an answer, and wasteful
 * on the rest, so it is fetched when a manager asks rather than on every prepare.
 *
 * ## It is evidence, not an answer
 *
 * Every lead shows WHERE it came from, because the whole point is that a reply can say "I checked
 * the running container rather than the code" and have that be true. Questions that resolved to
 * nothing are listed separately and prominently: those are the ones that need a human, and hiding
 * them would turn a known gap into a silent one.
 */

const LEAD_ICON: Record<string, string> = {
  source: 'ri-code-s-slash-line',
  agent: 'ri-robot-2-line',
  person: 'ri-shield-user-line',
  domain: 'ri-government-line',
};

export const ResearchPanel: React.FC<{ enrollmentId: string }> = ({ enrollmentId }) => {
  const [packet, setPacket] = useState<ResearchPacket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setPacket(await fetchResearchPacket(enrollmentId));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not build the research packet.');
    } finally {
      setBusy(false);
    }
  }, [enrollmentId]);

  if (!packet) {
    return (
      <div className="aint-research">
        <button type="button" className="aint-btn" disabled={busy} onClick={load}>
          <i className={busy ? 'ri-loader-4-line' : 'ri-search-eye-line'} aria-hidden="true" />
          {busy ? ' Reading the code, the registry and the access records…' : ' Research their questions'}
        </button>
        {error && <p className="aint-alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="aint-research">
      <h4>
        <i className="ri-search-eye-line" aria-hidden="true" /> What they asked, and what answers it
        <span className="aint-count">{packet.leads.length}</span>
      </h4>

      {packet.questions.map((q, i) => (
        <details key={i} className="aint-rq">
          <summary>
            <strong>{q.subject}</strong>
            <span className="aint-sub"> · {q.receivedAt.slice(0, 10)} · {q.text.length} characters</span>
          </summary>
          <p className="aint-rq-text">{q.text}</p>
        </details>
      ))}

      {packet.leads.length > 0 && (
        <ul className="aint-leads">
          {packet.leads.map((l, i) => (
            <li key={i}>
              <span className={`aint-pill lead-${l.kind}`}>
                <i className={LEAD_ICON[l.kind] ?? 'ri-file-list-line'} aria-hidden="true" /> {LEAD_LABEL[l.kind]}
              </span>
              <span className="aint-lead-body">
                <code>{l.term}</code>
                <span className="aint-lead-find">{l.finding}</span>
                <span className="aint-sub"><i className="ri-focus-3-line" aria-hidden="true" /> {l.evidence}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Shown even when empty is NOT the case: a question nothing could evidence is the single
          most useful thing on this panel, because it is the one only Ali can answer. */}
      {packet.needsHuman.length > 0 && (
        <div className="aint-needshuman">
          <strong><i className="ri-quill-pen-line" aria-hidden="true" /> Only you can answer these:</strong>
          <ul>{packet.needsHuman.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      {packet.notes.map((n, i) => <p key={i} className="aint-muted">{n}</p>)}

      <p className="aint-muted">
        Built {new Date(packet.generatedAt).toLocaleTimeString()} from the running image and the live
        database. Read only, and every value is redacted before it leaves the server.
      </p>
    </div>
  );
};

export default ResearchPanel;
