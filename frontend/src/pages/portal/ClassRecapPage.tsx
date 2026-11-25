import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPublicRecap, type PublicRecap } from '../../services/weeklyLiveRecapApi';
import './classRecap.css';

/**
 * The class recap page (Basecamp WL1.2, Ali 2026-11-24): the link in the recap email takes an attendee
 * back to "the live session / event link chat they used in the class". No login, ever: the personal
 * token in the link is the key. With a valid token the page shows the class chat as it was; without
 * one (a forwarded or expired link) it shows the overview only. Colaberry Training branding, like the
 * check-in page it follows.
 */
export const RECAP_TAB_TITLE = 'Class recap | Colaberry Training';

export default function ClassRecapPage(): React.ReactElement {
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const [data, setData] = useState<PublicRecap | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => { document.title = RECAP_TAB_TITLE; }, []);
  useEffect(() => {
    let cancelled = false;
    getPublicRecap(sessionId, token)
      .then((d) => { if (!cancelled) { setData(d); setState('ready'); } })
      .catch((e) => { if (!cancelled) setState(e?.response?.status === 404 ? 'missing' : 'error'); });
    return () => { cancelled = true; };
  }, [sessionId, token]);

  if (state === 'loading') return <main className="rcp-root"><p className="rcp-muted" data-testid="rcp-loading">Loading your recap.</p></main>;
  if (state !== 'ready' || !data) {
    return (
      <main className="rcp-root">
        <section className="rcp-card" data-testid="rcp-missing">
          <h1 className="rcp-h1">{state === 'missing' ? 'This recap is not available' : 'We could not load this recap'}</h1>
          <p className="rcp-muted">{state === 'missing' ? 'The link may be from a class that has no recap yet.' : 'Please try the link again in a minute.'}</p>
        </section>
      </main>
    );
  }
  const s = data.summary;
  return (
    <main className="rcp-root">
      <header className="rcp-hero" data-testid="rcp-hero">
        <div className="rcp-eyebrow">Colaberry Training · Class recap · {data.date}</div>
        <h1 className="rcp-h1 rcp-h1-light">{s.headline}</h1>
        {s.intro && <p className="rcp-intro">{s.intro}</p>}
      </header>

      <section className="rcp-ideas" data-testid="rcp-ideas" aria-label="What we covered">
        {s.ideas.map((d, i) => (
          <article className="rcp-idea" key={i}>
            {d.icon && <span className="rcp-icon" aria-hidden="true">{d.icon}</span>}
            <h2 className="rcp-idea-title">{d.title}</h2>
            {d.text && <p className="rcp-idea-text">{d.text}</p>}
          </article>
        ))}
      </section>

      {s.steps.length > 0 && (
        <section className="rcp-card" data-testid="rcp-steps">
          <h2 className="rcp-h2">What we built, step by step</h2>
          <ol className="rcp-steps">{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </section>
      )}
      {s.quote && <blockquote className="rcp-quote" data-testid="rcp-quote">{s.quote}</blockquote>}
      {s.homework && <p className="rcp-card rcp-homework"><strong>Your one task this week:</strong> {s.homework}</p>}

      {data.nextEventUrl && (
        <p className="rcp-cta-row">
          <a className="rcp-cta" href={data.nextEventUrl} target="_blank" rel="noopener noreferrer" data-testid="rcp-next">Save your seat for the next class</a>
        </p>
      )}

      <section className="rcp-card" data-testid="rcp-chat-section">
        <h2 className="rcp-h2">The class chat</h2>
        {data.chat === null && <p className="rcp-muted" data-testid="rcp-chat-locked">Open this page from the link in your recap email to see the class chat.</p>}
        {data.chat !== null && data.chat.length === 0 && <p className="rcp-muted">No one posted in the chat during this class.</p>}
        {data.chat !== null && data.chat.length > 0 && (
          <ol className="rcp-chat" data-testid="rcp-chat">
            {data.chat.map((m) => (
              <li key={m.id} className={m.kind === 'assistant' ? 'rcp-msg rcp-msg-assistant' : 'rcp-msg'}>
                <span className="rcp-msg-name">{m.name}</span>
                <span className="rcp-msg-text">{m.content}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <footer className="rcp-foot">Colaberry Training</footer>
    </main>
  );
}
