import React, { useState } from 'react';
import api from '../../../utils/api';
import type { CommunicationMessage, MessageAsSent } from '../../../adminOs/personTypes';
import { fmtDateTime } from './primitives';

/**
 * The message as the recipient saw it.
 *
 * Email bodies are HTML. Showing the source tells a reader nothing about what
 * landed in the inbox, and Ali's ask was "exactly how it looked to her".
 * Rendered in a SANDBOXED iframe via srcDoc, never dangerouslySetInnerHTML:
 * the body came from a template engine and Mandrill, and an iframe with no
 * scripts and no same-origin keeps anything in it from reaching the admin
 * session. It also means no link inside can be followed, which matters for
 * magic-link mail. Plain-text bodies are wrapped so they still read.
 */
export function RenderedBody({ body }: { body: string }) {
  const looksHtml = /<\s*(html|body|div|table|p|a|br|span)\b/i.test(body);
  const doc = looksHtml
    ? body
    : `<!doctype html><html><body style="font:14px/1.5 system-ui, sans-serif; margin:16px; white-space:pre-wrap">${
        body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body></html>`;
  return (
    <iframe
      title="Message as delivered"
      sandbox=""
      srcDoc={doc}
      className="w-100 border rounded bg-white"
      style={{ height: 520 }}
    />
  );
}

const HIGHLIGHT_STYLE = '<style>a[data-clicked]{outline:3px solid #198754;outline-offset:3px;background:#d1e7dd;'
  + 'box-shadow:0 0 0 8px #d1e7dd;border-radius:2px}</style>';

const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// The same rule the server applies before it stores or returns a click URL
// (backend utils/piiRedaction.maskUrlSecrets). Applied to BOTH sides of the
// comparison so a held body that still carries a token matches its click.
const maskUrlSecrets = (s: string) => s.replace(/([?&](?:token|key|secret|sig|signature|auth|code|t)=)[^&#\s"'<>]+/gi, '$1***');

/**
 * Mark every anchor whose href is one of the clicked URLs, so the reader sees
 * WHICH link was clicked rather than being told one was. A string transform
 * rather than DOM work: the document is never parsed on this origin.
 */
export function highlightClicked(html: string, clickedUrls: string[]): string {
  if (clickedUrls.length === 0) return html;
  const wanted = new Set(clickedUrls.map((u) => maskUrlSecrets(u.trim())));
  let hits = 0;
  const marked = html.replace(/<a\b([^>]*?)\bhref=(["'])(.*?)\2([^>]*)>/gi, (whole, pre, q, href, post) => {
    if (!wanted.has(maskUrlSecrets(decodeEntities(href).trim()))) return whole;
    hits += 1;
    return `<a${pre}href=${q}${href}${q}${post} data-clicked="1">`;
  });
  if (hits === 0) return html;
  return /<head[^>]*>/i.test(marked)
    ? marked.replace(/<head[^>]*>/i, (m) => `${m}${HIGHLIGHT_STYLE}`)
    : `${HIGHLIGHT_STYLE}${marked}`;
}

const REASON_TEXT: Record<Extract<MessageAsSent, { found: false }>['reason'], string> = {
  not_in_search: 'Mandrill has no message to this person with this subject around that time. Its search covers roughly the last month.',
  content_expired: 'Mandrill still lists this message but no longer holds its content — it keeps the full email for a few weeks only.',
  recipient_mismatch: 'Mandrill returned a message addressed to someone else, so it was refused rather than shown.',
  mandrill_unavailable: 'Mandrill did not answer. Try again in a moment.',
  not_configured: 'This environment has no Mandrill key, so the message cannot be fetched here.',
};

/**
 * For a message this platform never stored -- a portal link, a class reminder,
 * a digest -- fetch it from Mandrill on demand and show it as sent, with the
 * clicked link highlighted. On demand only: each fetch is two Mandrill calls,
 * and the modal must not spend them on every open.
 */
export default function AsSentPanel({ personRef, m }: { personRef: string; m: CommunicationMessage }) {
  const [state, setState] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'done'; result: MessageAsSent } | { status: 'error' }>({ status: 'idle' });
  const at = m.sentAt ?? m.scheduledFor;
  const neverSent = !m.sentAt || m.status === 'cancelled' || m.status === 'failed';
  const canAsk = !!(m.subject && at) && !neverSent;

  const fetchIt = async () => {
    if (!canAsk) return;
    setState({ status: 'loading' });
    try {
      const res = await api.get('/api/admin/people/message-as-sent', {
        params: { ref: personRef, subject: m.subject, at, ...(m.mandrillId ? { mandrillId: m.mandrillId } : {}) },
      });
      setState({ status: 'done', result: res.data as MessageAsSent });
    } catch {
      setState({ status: 'error' });
    }
  };

  if (!canAsk) {
    return (
      <p className="text-muted small mb-0">
        {neverSent
          ? 'This message was never sent, so there is nothing to read.'
          : 'No body was stored for this message, and without a subject and a time it cannot be looked up in Mandrill.'}
      </p>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div>
        <p className="text-muted small mb-2">
          This platform did not store this message. Mandrill did, for a few weeks after sending.
        </p>
        <button type="button" className="btn btn-sm btn-outline-dark" onClick={fetchIt} disabled={state.status === 'loading'}>
          {state.status === 'loading'
            ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Fetching from Mandrill…</>
            : <><i className="ri-mail-open-line me-1" aria-hidden="true" />Open the email as it was sent</>}
        </button>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="alert alert-warning small py-2 mb-0">
        Could not reach the server to fetch this message.{' '}
        <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={fetchIt}>Try again</button>
      </div>
    );
  }

  const r = state.result;
  if (!r.found) {
    return (
      <div className="alert alert-secondary small py-2 mb-0">
        <i className="ri-information-line me-1" aria-hidden="true" />
        {REASON_TEXT[r.reason]}
      </div>
    );
  }

  const body = r.html ?? r.text ?? '';
  return (
    <div>
      <div className="text-muted small mb-2">
        Sent {fmtDateTime(r.sentAt)}{r.from && <> from <span className="fw-medium">{r.from}</span></>}
        {' '}· {r.opens} {r.opens === 1 ? 'open' : 'opens'} · {r.clicks} {r.clicks === 1 ? 'click' : 'clicks'}
        {' '}· retrieved from Mandrill, not from this platform's records.
      </div>
      {r.clickedUrls.length > 0 ? (
        <div className="small mb-2">
          <span className="badge bg-success-subtle text-success-emphasis me-1">
            <i className="ri-cursor-line me-1" aria-hidden="true" />clicked
          </span>
          The highlighted {r.clickedUrls.length === 1 ? 'link is the one' : 'links are the ones'} they clicked:
          <ul className="mb-0 mt-1">
            {r.clickedUrls.map((u) => <li key={u}><code style={{ fontSize: '.75rem' }}>{u}</code></li>)}
          </ul>
        </div>
      ) : r.clicks > 0 ? (
        <p className="small text-muted mb-2">Mandrill counts {r.clicks} {r.clicks === 1 ? 'click' : 'clicks'} but did not keep the URL, so nothing is highlighted.</p>
      ) : null}
      {body
        ? <RenderedBody body={highlightClicked(body, r.clickedUrls)} />
        : <p className="text-muted small mb-0">Mandrill returned the message without a body.</p>}
    </div>
  );
}
