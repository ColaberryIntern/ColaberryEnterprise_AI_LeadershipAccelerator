import React, { useCallback, useEffect, useState } from 'react';
import { fetchPresentationPrompt, type PresentationPromptResponse } from './presentationApi';

/**
 * The Build stage's deck prompt: fetch it, show what it will and will not contain,
 * and let the student take it away.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * It does not generate the deck. In-app generation lands in a later phase; until then
 * the student takes this prompt to Claude Code themselves, which is the workflow the
 * programme already teaches. Pretending otherwise would be a button that does nothing.
 *
 * It does not hide gaps. The server returns the list of fields it could not fill, and
 * they are shown before the prompt rather than buried in it — a student who pastes a
 * prompt full of "(not supplied)" without noticing gets a deck full of invented
 * detail, which is the exact failure the accuracy rules exist to prevent.
 */

export interface PromptPanelProps {
  projectId: string;
  storyId: string;
  /** Explorer/demo mode: never calls the API. */
  demo?: boolean;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: PresentationPromptResponse }
  | { kind: 'error'; message: string }
  | { kind: 'demo' };

const mins = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s}s`);

export default function PromptPanel({ projectId, storyId, demo }: PromptPanelProps) {
  const [state, setState] = useState<State>(demo ? { kind: 'demo' } : { kind: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (demo) { setState({ kind: 'demo' }); return; }
    let live = true;
    setState({ kind: 'loading' });
    fetchPresentationPrompt(projectId, storyId)
      .then((data) => { if (live) setState({ kind: 'ready', data }); })
      .catch((err: any) => {
        if (!live) return;
        // Say what actually happened. "Something went wrong" teaches a student
        // nothing and makes them retry a thing that cannot work.
        const status = err?.response?.status;
        const message = status === 404
          ? 'The deck prompt is not available for this task yet.'
          : err?.response?.data?.error || 'Could not load the prompt. Try again.';
        setState({ kind: 'error', message });
      });
    return () => { live = false; };
  }, [projectId, storyId, demo]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some contexts. The textarea below is selectable, so
      // the student still has a way through — say so rather than failing silently.
      setCopied(false);
    }
  }, []);

  const download = useCallback((data: PresentationPromptResponse) => {
    const blob = new Blob([data.prompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.template_id}-prompt.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  if (state.kind === 'demo') {
    return (
      <div className="ps-pending" data-testid="ps-prompt-demo">
        <strong>This is a preview account.</strong>
        The deck prompt is built from a real student&rsquo;s own project, so there is nothing to generate here.
      </div>
    );
  }

  if (state.kind === 'loading') {
    return <p className="ps-note ps-note--soft" data-testid="ps-prompt-loading">Building your prompt&hellip;</p>;
  }

  if (state.kind === 'error') {
    return <p className="ps-note" role="alert" data-testid="ps-prompt-error">{state.message}</p>;
  }

  const { data } = state;
  return (
    <div data-testid="ps-prompt">
      <div className="ps-card">
        <h3>{data.template_label}</h3>
        <p className="ps-note ps-note--soft">
          {mins(data.speaking_seconds)} speaking
          {data.qa_seconds > 0 && <> &middot; {mins(data.qa_seconds)} Q&amp;A, held separately</>}
        </p>
      </div>

      {data.missing.length > 0 && (
        <div className="ps-pending" data-testid="ps-prompt-missing">
          <strong>Your project is missing {data.missing.length} thing{data.missing.length === 1 ? '' : 's'} this prompt wanted.</strong>
          It will say &ldquo;(not supplied)&rdquo; rather than invent them: {data.missing.join(', ')}. You can still
          use the prompt — just fill those in yourself rather than letting the deck guess.
        </div>
      )}

      <div className="ps-acts">
        <button type="button" className="ps-btn" onClick={() => copy(data.prompt)} data-testid="ps-copy">
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
        <button type="button" className="ps-btn ps-btn--soft" onClick={() => download(data)} data-testid="ps-download">
          Download as .txt
        </button>
      </div>

      <p className="ps-note ps-note--soft" style={{ marginTop: 10 }}>
        Paste this into Claude Code in your own project folder. It will produce the deck, your speaker
        notes, a demo runbook and a rehearsal checklist.
      </p>

      {/* Selectable, so a student whose clipboard is blocked still has a way through. */}
      <textarea
        className="ps-prompt-text"
        readOnly
        value={data.prompt}
        rows={14}
        aria-label="Your personalised deck prompt"
        data-testid="ps-prompt-text"
      />
    </div>
  );
}
