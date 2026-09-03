import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CertMode,
  CertQuestionItem,
  CertRevealedItem,
  CertSessionView,
  CertReadiness,
  startCertSession,
  submitCertResponse,
  completeCertSession,
} from '../../../services/certPrepApi';

/**
 * CertSessionRunner — one sitting: answer, see why, move on, finish.
 *
 * WHAT THIS COMPONENT DOES NOT KNOW. It never receives the answer key. The item
 * it renders has no `correct_keys` and no `rationale` field, because the server
 * does not send them until the answer is submitted. That is not a convention this
 * component upholds by discipline — it is structurally unable to leak the answer,
 * because it was never given one.
 *
 * MULTI-RESPONSE IS EXPLICIT. The real exam always states how many options to
 * select, so `select_count` drives both the instruction line and the input type:
 * radio for one, checkbox for more. Guessing the arity would make an item
 * unanswerable in exactly the way the authoring validator refuses to allow.
 *
 * THE TIMER IS ADVISORY HERE AND AUTHORITATIVE ON THE SERVER. This displays the
 * remaining time from `expires_at`, but a submission after the deadline is
 * refused by the API regardless of what the clock in the browser says. A client
 * with a skewed clock cannot buy itself extra minutes.
 */

interface Props {
  mode: CertMode;
  domainIds?: string[];
  onExit: () => void;
  onFinished: (readiness: CertReadiness | null) => void;
}

type Phase = 'starting' | 'running' | 'submitting' | 'finished' | 'error';

/** mm:ss remaining, or null when the sitting is untimed. */
function remainingLabel(expiresAt: string | null, nowMs: number): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - nowMs;
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const CertSessionRunner: React.FC<Props> = ({ mode, domainIds, onExit, onFinished }) => {
  const [phase, setPhase] = useState<Phase>('starting');
  const [view, setView] = useState<CertSessionView | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<CertRevealedItem | null>(null);
  const [summary, setSummary] = useState<{ scaled: number | null; correct: number; total: number } | null>(null);
  const [errorText, setErrorText] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const questionShownAt = useRef<number>(Date.now());

  // A retried start must not mint a second session, so the key is generated once
  // per mount and reused if the request is retried.
  const idempotencyKey = useRef(
    `start:${mode}:${(domainIds ?? []).join('-')}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await startCertSession({
          mode,
          domain_ids: domainIds,
          idempotency_key: idempotencyKey.current,
        });
        if (!alive) return;
        setView(res.data);
        setPhase('running');
        questionShownAt.current = Date.now();
      } catch (err: any) {
        if (!alive) return;
        setErrorText(
          err?.response?.data?.code === 'CERT_NO_APPROVED_QUESTIONS'
            ? 'There are no approved questions for this set yet.'
            : err?.response?.data?.error ?? 'We could not start that session.',
        );
        setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [mode, domainIds]);

  // Tick only while a timed sitting is running.
  useEffect(() => {
    if (phase !== 'running' || !view?.session.expires_at) return undefined;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase, view?.session.expires_at]);

  const items: CertQuestionItem[] = view?.items ?? [];
  const item = items[index];
  const multi = (item?.select_count ?? 1) > 1;

  const toggle = (key: string) => {
    if (revealed) return; // answered — the choice is locked
    setSelected((prev) => {
      if (!multi) return [key];
      return prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    });
  };

  const submit = async () => {
    if (!view || !item || selected.length === 0) return;
    setPhase('submitting');
    try {
      const res = await submitCertResponse(view.session.id, {
        question_key: item.question_key,
        selected_keys: selected,
        time_ms: Date.now() - questionShownAt.current,
      });
      setRevealed(res.data);
      setPhase('running');
    } catch (err: any) {
      setErrorText(
        err?.response?.data?.code === 'CERT_SESSION_EXPIRED'
          ? 'Time is up for this sitting.'
          : err?.response?.data?.error ?? 'That answer did not save.',
      );
      setPhase('error');
    }
  };

  const next = () => {
    setRevealed(null);
    setSelected([]);
    questionShownAt.current = Date.now();
    setIndex((i) => i + 1);
  };

  const finish = useCallback(async () => {
    if (!view) return;
    setPhase('submitting');
    try {
      const res = await completeCertSession(view.session.id);
      setSummary({
        scaled: res.data.session.scaled_score,
        correct: res.data.session.correct_count ?? 0,
        total: res.data.session.total_count ?? items.length,
      });
      setPhase('finished');
      onFinished(res.data.readiness);
    } catch (err: any) {
      setErrorText(err?.response?.data?.error ?? 'We could not score that sitting.');
      setPhase('error');
    }
  }, [view, items.length, onFinished]);

  if (phase === 'starting') {
    return <div className="cp-skeleton" aria-busy="true" aria-label="Starting your session"><span /><span /></div>;
  }

  if (phase === 'error') {
    return (
      <section className="cp-empty" role="alert">
        <p>{errorText}</p>
        <button type="button" className="cp-btn cp-btn--ghost" onClick={onExit}>Back to Cert Prep</button>
      </section>
    );
  }

  if (phase === 'finished' && summary) {
    return (
      <section className="cp-result" aria-live="polite">
        <div className="cp-eyebrow">Sitting complete</div>
        <h2>
          {summary.scaled === null
            ? 'Nothing scored'
            : `${summary.scaled} on the readiness scale`}
        </h2>
        <p>
          {summary.correct} of {summary.total} correct.
          {summary.scaled !== null && ' This is a Colaberry readiness estimate, not a predicted exam score.'}
        </p>
        <button type="button" className="cp-btn cp-btn--primary" onClick={onExit}>Back to Cert Prep</button>
      </section>
    );
  }

  if (!item) {
    return (
      <section className="cp-result">
        <h2>That is every question in this set</h2>
        <p>Finish to score it and update your readiness.</p>
        <button type="button" className="cp-btn cp-btn--primary" onClick={() => void finish()}>
          Finish and score
        </button>
      </section>
    );
  }

  const timeLeft = remainingLabel(view?.session.expires_at ?? null, nowMs);

  return (
    <section className="cp-runner" aria-label={`Question ${index + 1} of ${items.length}`}>
      <header className="cp-runner-head">
        <span className="cp-eyebrow">
          {mode === 'mock' ? 'Mock sitting' : mode === 'diagnostic' ? 'Baseline diagnostic' : 'Practice'}
          {' · '}{item.domain_id}
        </span>
        <span className="cp-runner-progress">
          Question {index + 1} of {items.length}
          {timeLeft && <> · <b>{timeLeft}</b> left</>}
        </span>
      </header>

      <p className="cp-stem">{item.stem}</p>
      <p className="cp-select-hint">
        {multi ? `Select ${item.select_count}.` : 'Select 1.'}
      </p>

      <ul className="cp-options" role={multi ? 'group' : 'radiogroup'}>
        {item.options.map((option) => {
          const isPicked = selected.includes(option.key);
          const isKey = revealed?.correct_keys.includes(option.key) ?? false;
          const cls = revealed
            ? isKey ? 'is-correct' : isPicked ? 'is-wrong' : ''
            : isPicked ? 'is-picked' : '';
          return (
            <li key={option.key}>
              <button
                type="button"
                className={`cp-option ${cls}`}
                aria-pressed={isPicked}
                disabled={!!revealed}
                onClick={() => toggle(option.key)}
              >
                <span className="cp-option-key">{option.key}</span>
                <span>{option.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {revealed && (
        <div className={`cp-rationale ${revealed.is_correct ? 'is-correct' : 'is-wrong'}`} role="status">
          <b>{revealed.is_correct ? 'Correct' : 'Not quite'}</b>
          <p>{revealed.rationale}</p>
          {!revealed.is_correct && selected.map((key) => (
            revealed.distractor_rationales[key] ? (
              <p key={key} className="cp-why-wrong">
                <b>{key}:</b> {revealed.distractor_rationales[key]}
              </p>
            ) : null
          ))}
        </div>
      )}

      <div className="cp-runner-actions">
        {!revealed ? (
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            disabled={selected.length === 0 || phase === 'submitting'}
            onClick={() => void submit()}
          >
            {phase === 'submitting' ? 'Saving…' : 'Submit answer'}
          </button>
        ) : index + 1 < items.length ? (
          <button type="button" className="cp-btn cp-btn--primary" onClick={next}>Next question</button>
        ) : (
          <button type="button" className="cp-btn cp-btn--primary" onClick={() => void finish()}>
            Finish and score
          </button>
        )}
        <button type="button" className="cp-btn cp-btn--ghost" onClick={onExit}>
          Save and exit
        </button>
      </div>
    </section>
  );
};

export default CertSessionRunner;
