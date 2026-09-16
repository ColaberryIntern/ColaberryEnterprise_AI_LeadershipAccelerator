import React, { useEffect, useRef, useState } from 'react';
import { SectionCard, StatusBadge } from '../shell';
import {
  IntakeStudent,
  IntakeTurn,
  IntakeTurnResult,
  describeBuildError,
  searchIntakeStudents,
  sendIntakeTurn,
} from '../../../services/adminFlotationIntakeApi';
import { getViewAsUrl } from '../../../services/adminOrgApi';

/**
 * The interview, from the management side.
 *
 *     "I want to be able to build the project from scratch using the same system as the
 *      AI Flotation project intake. I want that same exact intake on the Mgmt side so I can
 *      build projects for students."  (Ali, 2026-09-16)
 *
 * Pick a student, describe the project the way a customer would, answer the interviewer's
 * questions. When it has enough, it writes the understanding up and the build starts on its
 * own - through the same `runIntakeTurn` the public /start page calls, so what happens here
 * is what happens to a prospect, question for question.
 *
 * The transcript lives in this component, exactly as /start keeps it in the page. One
 * session id per conversation; the server uses it to make the final turn idempotent.
 */

type Phase = 'pick' | 'talk' | 'done';

const newSessionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export default function StartProjectForStudent() {
  const [phase, setPhase] = useState<Phase>('pick');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<IntakeStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<IntakeStudent | null>(null);

  const [sessionId, setSessionId] = useState(newSessionId);
  const [turns, setTurns] = useState<IntakeTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<Extract<IntakeTurnResult, { done: true }> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Search as they type, after a pause, from two characters - the server refuses less.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setMatches([]); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchIntakeStudents(q);
        if (live) setMatches(found);
      } catch {
        if (live) setMatches([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, busy]);

  const pick = (s: IntakeStudent) => {
    setStudent(s);
    setMatches([]);
    setQuery('');
    setPhase('talk');
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !student || busy) return;
    const next = [...turns, { role: 'user' as const, text }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const result = await sendIntakeTurn({ enrollmentId: student.id, sessionId, turns: next });
      setTurns([...next, { role: 'assistant', text: result.message }]);
      if (result.done) {
        setFinished(result);
        setPhase('done');
      }
    } catch (err) {
      // Their message stays in the transcript; they can send the next one and the server
      // sees the whole thing again. Nothing was lost.
      setError(describeBuildError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPhase('pick');
    setStudent(null);
    setSessionId(newSessionId());
    setTurns([]);
    setDraft('');
    setError(null);
    setFinished(null);
  };

  const viewAs = async () => {
    if (!student) return;
    const url = await getViewAsUrl(student.id);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <SectionCard
      title="Start a project for a student"
      icon="chat-new-line"
      subtitle="The same interview a prospect gets on aiflotation.com. Describe the project as they would; the build starts when it has enough."
      actions={
        phase !== 'pick' ? (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={reset} disabled={busy}>
            <i className="ri-arrow-go-back-line me-1" />Start another
          </button>
        ) : undefined
      }
    >
      {phase === 'pick' && (
        <div style={{ maxWidth: 520 }}>
          <label htmlFor="intake-student" className="form-label small fw-semibold mb-1">Who is this project for?</label>
          <input
            id="intake-student"
            className="form-control form-control-sm"
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {searching && <div className="small text-muted mt-2">Searching&hellip;</div>}
          {!searching && query.trim().length >= 2 && matches.length === 0 && (
            <div className="small text-muted mt-2">No student matches that.</div>
          )}
          {matches.length > 0 && (
            <div className="list-group mt-2">
              {matches.map((m) => (
                <button key={m.id} type="button" className="list-group-item list-group-item-action py-2" onClick={() => pick(m)}>
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <span>
                      <span className="fw-semibold">{m.full_name || m.email}</span>
                      {m.full_name && <span className="text-muted small ms-2">{m.email}</span>}
                    </span>
                    <StatusBadge label={m.tier} tone={m.tier === 'guest' ? 'neutral' : 'info'} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase !== 'pick' && student && (
        <>
          <div className="d-flex align-items-center gap-2 mb-3 small">
            <i className="ri-user-line text-muted" aria-hidden="true" />
            <span>Building for <strong>{student.full_name || student.email}</strong></span>
            {student.full_name && <span className="text-muted">{student.email}</span>}
          </div>

          <div
            ref={logRef}
            className="border rounded p-3 mb-3"
            style={{ maxHeight: 420, overflowY: 'auto', background: 'var(--bs-tertiary-bg, #f8f9fa)' }}
            aria-live="polite"
          >
            {turns.length === 0 && (
              <p className="text-muted small mb-0">
                Start the way a customer would: what is the project, who is it for, what is painful today? One or two
                sentences is enough; the interviewer asks for the rest.
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`d-flex mb-2 ${t.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}>
                <div
                  className={`rounded px-3 py-2 small ${t.role === 'user' ? 'bg-primary text-white' : 'bg-white border'}`}
                  style={{ maxWidth: '78%', whiteSpace: 'pre-wrap' }}
                >
                  {t.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="d-flex justify-content-start mb-2">
                <div className="rounded px-3 py-2 small bg-white border text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />thinking
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-danger small">{error}</p>}

          {phase === 'talk' && (
            <form
              className="d-flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void send(); }}
            >
              <textarea
                className="form-control form-control-sm"
                rows={2}
                placeholder={turns.length === 0 ? 'Describe the project…' : 'Your answer…'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                disabled={busy}
                maxLength={4000}
              />
              <button type="submit" className="btn btn-sm btn-primary align-self-end" disabled={busy || !draft.trim()}>
                <i className="ri-send-plane-line me-1" />Send
              </button>
            </form>
          )}

          {phase === 'done' && finished && (
            <div className="border rounded p-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                <StatusBadge
                  label={finished.understanding === 'created' || finished.understanding === 'deduplicated' ? 'written up' : finished.understanding}
                  tone={finished.understanding === 'created' || finished.understanding === 'deduplicated' ? 'success' : 'danger'}
                />
                {finished.build?.started ? (
                  <StatusBadge label="build started" tone="success" />
                ) : (
                  <StatusBadge label="build not started" tone="warning" />
                )}
              </div>
              <p className="small mb-2">
                {finished.build?.started ? (
                  <>
                    The project is building now - intake &rarr; decompose &rarr; gate &rarr; repair &rarr; publish, a minute or two.
                    It will appear in {student.full_name || 'their'} portal exactly as a student-created one would.
                  </>
                ) : (
                  <>The write-up was recorded but no build started: {finished.build?.reason || 'no reason given'}.</>
                )}
              </p>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void viewAs()}>
                <i className="ri-eye-line me-1" />See it as they would
              </button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
