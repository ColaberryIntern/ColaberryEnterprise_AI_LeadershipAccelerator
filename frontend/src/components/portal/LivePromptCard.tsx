import React, { useCallback, useState } from 'react';
import type { BroadcastPrompt } from '../../services/onboardingApi';

/**
 * One Prompt Drop, on either live surface.
 *
 * WHY IT IS ITS OWN COMPONENT. The phone deck and the desktop workspace show the same prompt
 * and must not drift, but they do not show the same amount of it. A phone is read with one
 * thumb while a class is moving, so it gets the prompt, what to expect and when to stop. A
 * laptop is where the work actually happens, so it also gets the three fields the phone drops
 * — which tool to paste into, which mode to be in, and what to do when it goes wrong. Those
 * fields have been in the payload since the instructor deck started sending them
 * (`sessionLiveController.ts:91-92`) and no surface has ever rendered them.
 *
 * `pasteWhere` AND `ccMode` ARE DOC 04's "Claude Code controls" IN THE FORM THE DATA SUPPORTS.
 * They are free text written by whoever authored the week — "Claude Code", "Plan Mode" — not
 * a machine-readable tool selector. So this tells the viewer which tool and which mode and
 * hands them the prompt; it does not try to launch anything, because guessing a destination
 * from prose is how you send somebody to a chat window for a terminal exercise. A real launch
 * control belongs with the session builder's tool-mode declaration (requirements §9), which
 * does not exist yet.
 *
 * COPY IS BEST-EFFORT ON PURPOSE. `navigator.clipboard` is absent on an insecure origin and
 * in several in-app browsers, which is a meaningful slice of a live audience. The button says
 * nothing happened rather than claiming success, and the prompt is selectable text either way.
 */

export interface LivePromptCardProps {
  prompt: BroadcastPrompt;
  /** Desktop workspace. Renders the fields the one-thumb deck deliberately drops. */
  full?: boolean;
  /** Injected in tests. Production writes to the system clipboard. */
  copy?: (text: string) => Promise<void>;
}

const CONFIRM_MS = 1600;

function writeToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error('NoClipboard'));
  return navigator.clipboard.writeText(text);
}

export default function LivePromptCard({
  prompt, full = false, copy,
}: LivePromptCardProps): React.ReactElement {
  const write = copy ?? writeToClipboard;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const onCopy = useCallback(() => {
    setCopyFailed(false);
    write(prompt.prompt).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), CONFIRM_MS);
      },
      () => { setCopyFailed(true); },
    );
  }, [write, prompt.prompt]);

  const tools = full ? [
    prompt.pasteWhere ? { key: 'paste', label: 'Paste into', value: prompt.pasteWhere } : null,
    prompt.ccMode ? { key: 'mode', label: 'Mode', value: prompt.ccMode } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string }> : [];

  return (
    <div className="lpc" data-testid="companion-prompt">
      <style>{LPC_CSS}</style>

      <p className="lpc-label">&#9000; {prompt.label}</p>

      {tools.length > 0 && (
        <ul className="lpc-tools" data-testid="prompt-tools">
          {tools.map((t) => (
            <li key={t.key}>
              <span className="lpc-tool-label">{t.label}</span>
              <span className="lpc-tool-value">{t.value}</span>
            </li>
          ))}
        </ul>
      )}

      <pre className="lpc-prompt">{prompt.prompt}</pre>

      <button type="button" className="lpc-copy" onClick={onCopy} data-testid="prompt-copy">
        {copied ? 'Copied' : 'Copy prompt'}
      </button>

      <p className="lpc-live" aria-live="polite">
        {copied ? 'Prompt copied to your clipboard.' : ''}
        {copyFailed ? 'Copying is blocked in this browser — select the prompt and copy it by hand.' : ''}
      </p>

      {prompt.expectedResult && (
        <p className="lpc-note" data-testid="prompt-expected">
          <b>&#128064; You should see:</b> {prompt.expectedResult}
        </p>
      )}
      {prompt.stopCondition && (
        <p className="lpc-note" data-testid="prompt-stop">
          <b>&#128721; Stop when:</b> {prompt.stopCondition}
        </p>
      )}
      {full && prompt.rescue && (
        <p className="lpc-note lpc-rescue" data-testid="prompt-rescue">
          <b>&#128726; If it goes wrong:</b> {prompt.rescue}
        </p>
      )}
    </div>
  );
}

const LPC_CSS = `
.lpc{
  background:var(--surface-card);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-lg);
  padding:14px 14px 12px;
  text-align:left;
}
.lpc-label{
  font-size:12px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  color:var(--text-subtle); margin:0 0 8px;
}
.lpc-note{ font-size:12.5px; line-height:1.5; color:var(--text-muted); margin:10px 0 0; }
.lpc-rescue{ color:var(--text-body); }

/* The tool strip reads as a spec sheet, not a sentence: a viewer under time pressure is
   scanning for "which window do I paste this into". */
.lpc-tools{ list-style:none; display:flex; flex-wrap:wrap; gap:8px; margin:0 0 10px; padding:0; }
.lpc-tools li{
  display:inline-flex; align-items:baseline; gap:6px;
  padding:4px 10px;
  background:var(--surface-subtle);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-pill);
}
.lpc-tool-label{
  font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:var(--text-subtle);
}
.lpc-tool-value{ font-size:13px; font-weight:600; color:var(--text-strong); }

.lpc-prompt{
  font-family:Consolas, "SF Mono", monospace; font-size:12.5px; line-height:1.5;
  white-space:pre-wrap; word-break:break-word; margin:0;
  padding:10px; color:var(--text-body);
  background:var(--surface-subtle); border:1px solid var(--border-subtle);
  border-radius:var(--radius-md);
}
.lpc-copy{
  width:100%; min-height:48px; margin-top:10px;
  font-family:var(--font-body); font-size:15px; font-weight:600;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
}
.lpc-copy:focus-visible{ outline:none; box-shadow:var(--focus-ring); }

/* Announced, not shown twice: the button label already changed. */
.lpc-live{
  position:absolute; width:1px; height:1px; margin:-1px; padding:0;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}
`;
