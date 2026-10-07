import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../../utils/api';
import { collectContext, installRecorders } from './reportContext';

/**
 * "Report a problem", on the Marketing pages only.
 *
 * Ali, 2026-10-07, handing this work to Sohail and an intern: they need to report problems with
 * screenshots and explanations, by email, with enough detail that Claude Code can act without a
 * conversation.
 *
 * THE SCREENSHOT IS PASTED, NOT RENDERED. The obvious choices were html2canvas and
 * getDisplayMedia. html2canvas re-implements a renderer in JavaScript and quietly gets things
 * wrong - web fonts, cross-origin images, shadows, anything it does not support - which means
 * the picture of the bug can disagree with the bug. getDisplayMedia is faithful but opens a
 * "share your screen" prompt, which is a strange thing to ask of someone reporting a typo.
 *
 * Pasting sidesteps both: the operating system already takes a perfect screenshot (Win+Shift+S,
 * Cmd+Shift+4), people already know how, and the clipboard hands us real PNG bytes. Drag-drop
 * and a file picker cover the same ground for anyone who saved the file first. No new
 * dependency, and the image is exactly what they saw.
 *
 * THREE QUESTIONS, NOT ONE BOX. "It's broken" is the report nobody can act on. Asking what
 * happened and what they expected as separate fields is the cheapest way to stop that, and the
 * expectation is usually the part that reveals the real disagreement.
 */

const MAX_BYTES = 6 * 1024 * 1024;

interface Props {
  /** The brand the Marketing section is scoped to, which changes how these pages behave. */
  brandLabel: string | null;
}

type Status = { kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; message: string };

export default function ReportAProblem({ brandLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [whatExpected, setWhatExpected] = useState('');
  const [steps, setSteps] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [shotName, setShotName] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const dialogRef = useRef<HTMLDivElement>(null);

  // Recording starts when Marketing mounts, not when the form opens: the console error worth
  // reading happened before anyone decided to report anything.
  useEffect(() => { installRecorders(); }, []);

  const readFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus({ kind: 'error', message: 'That file is not an image.' }); return; }
    if (file.size > MAX_BYTES) { setStatus({ kind: 'error', message: 'That image is larger than 6MB. Crop it, or grab just the part that is wrong.' }); return; }
    const reader = new FileReader();
    reader.onload = () => { setShot(String(reader.result)); setShotName(file.name || 'pasted image'); setStatus({ kind: 'idle' }); };
    reader.onerror = () => setStatus({ kind: 'error', message: 'That image could not be read.' });
    reader.readAsDataURL(file);
  }, []);

  // Paste anywhere in the dialog, which is how a screenshot actually arrives.
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); readFile(item.getAsFile()); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open, readFile]);

  // Escape closes, and focus moves into the dialog when it opens.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLElement>('input,textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const canSend = summary.trim().length >= 5 && whatHappened.trim().length >= 10 && status.kind !== 'sending';

  const send = async () => {
    setStatus({ kind: 'sending' });
    try {
      const ctx = collectContext(brandLabel);
      await api.post('/api/admin/marketing/bug-report', {
        summary: summary.trim(),
        whatHappened: whatHappened.trim(),
        whatExpected: whatExpected.trim() || undefined,
        stepsToReproduce: steps.trim() || undefined,
        screenshot: shot || undefined,
        ...ctx,
      });
      setStatus({ kind: 'sent' });
      setSummary(''); setWhatHappened(''); setWhatExpected(''); setSteps(''); setShot(null); setShotName('');
      setTimeout(() => { setOpen(false); setStatus({ kind: 'idle' }); }, 2200);
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.response?.data?.error || 'The report could not be sent. Nothing was lost - try again.' });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-dark btn-sm rounded-pill shadow position-fixed"
        style={{ right: '1.25rem', bottom: '1.25rem', zIndex: 1040 }}
        onClick={() => setOpen(true)}
        data-testid="report-problem-open"
      >
        <i className="ri-bug-line me-1" aria-hidden="true" />
        Report a problem
      </button>
    );
  }

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: 'rgba(0,0,0,.35)', zIndex: 1050 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-problem-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div ref={dialogRef} className="bg-white rounded-3 shadow-lg p-4" style={{ width: 'min(42rem, calc(100vw - 2rem))', maxHeight: 'calc(100vh - 3rem)', overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-start mb-1">
          <h2 className="h5 mb-0" id="report-problem-title">Report a problem</h2>
          <button type="button" className="btn-close" aria-label="Close" onClick={() => setOpen(false)} data-testid="report-problem-close" />
        </div>
        <p className="text-muted small mb-3">
          This goes straight to the people who can fix it, with the page you are on, the brand you
          are working as, and any errors the page has already produced.
        </p>

        {status.kind === 'sent' && (
          <div className="alert alert-success py-2" data-testid="report-problem-sent">
            Sent. Thank you - that report has everything needed to start on it.
          </div>
        )}
        {status.kind === 'error' && (
          <div className="alert alert-danger py-2" role="alert" data-testid="report-problem-error">{status.message}</div>
        )}

        <label className="form-label small fw-semibold mb-1" htmlFor="bug-summary">
          In one line, what is wrong? <span className="text-danger">*</span>
        </label>
        <input
          id="bug-summary" className="form-control form-control-sm mb-3" value={summary} maxLength={160}
          placeholder="e.g. The campaign list shows email campaigns"
          onChange={(e) => setSummary(e.target.value)} data-testid="bug-summary"
        />

        <label className="form-label small fw-semibold mb-1" htmlFor="bug-happened">
          What happened? <span className="text-danger">*</span>
        </label>
        <textarea
          id="bug-happened" className="form-control form-control-sm mb-3" rows={3} value={whatHappened}
          placeholder="What you did, and what the page did back."
          onChange={(e) => setWhatHappened(e.target.value)} data-testid="bug-happened"
        />

        <label className="form-label small fw-semibold mb-1" htmlFor="bug-expected">What did you expect instead?</label>
        <textarea
          id="bug-expected" className="form-control form-control-sm mb-3" rows={2} value={whatExpected}
          placeholder="Often the most useful line in the whole report."
          onChange={(e) => setWhatExpected(e.target.value)} data-testid="bug-expected"
        />

        <label className="form-label small fw-semibold mb-1" htmlFor="bug-steps">How would someone else see it? <span className="text-muted fw-normal">(optional)</span></label>
        <textarea
          id="bug-steps" className="form-control form-control-sm mb-3" rows={2} value={steps}
          placeholder="1. Open Landing pages  2. Pick Colaberry Training  3. ..."
          onChange={(e) => setSteps(e.target.value)} data-testid="bug-steps"
        />

        <div
          className="border border-2 border-dashed rounded-3 p-3 text-center mb-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}
          data-testid="bug-dropzone"
        >
          {shot ? (
            <div>
              <img src={shot} alt="The screenshot you attached" style={{ maxHeight: '11rem', maxWidth: '100%' }} className="rounded border mb-2" />
              <div className="small text-muted">
                {shotName}
                <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={() => { setShot(null); setShotName(''); }} data-testid="bug-remove-shot">Remove</button>
              </div>
            </div>
          ) : (
            <div className="small text-muted">
              <div className="fw-semibold text-body mb-1">Add a screenshot</div>
              Take one with <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (or <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>4</kbd>),
              then paste it here. You can also drop a file, or
              {' '}
              <label className="btn btn-link btn-sm p-0 align-baseline mb-0">
                choose one
                <input type="file" accept="image/*" hidden onChange={(e) => readFile(e.target.files?.[0])} data-testid="bug-file" />
              </label>.
            </div>
          )}
        </div>

        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-sm btn-dark" disabled={!canSend} onClick={send} data-testid="bug-send">
            {status.kind === 'sending' ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </div>
    </div>
  );
}
