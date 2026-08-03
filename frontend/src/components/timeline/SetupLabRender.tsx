import React, { useEffect, useRef } from 'react';
import { copyText } from '../../utils/clipboard';

/**
 * SetupLabRender — the bespoke renderer for the `setup_lab` curriculum type (a
 * Claude Code "get unblocked" lab). Shared by the card drawer (CardDetailBody)
 * and the workspace (RuntimeWorkspace).
 *
 * Light theme, portal-consistent, with the Claude Code identity carried by a
 * coral accent + badge + numbered beats. Rendered as native DOM (not the generic
 * sandboxed `lessonDoc` iframe) so there's no double scrollbar AND a real Copy
 * button can reach the clipboard. Copying the prompt fires `onCopied` so the host
 * can reveal the completion action (you copy → run it in Claude Code → complete).
 */
interface Props {
  bodyHtml: string;
  title?: string | null;
  summary?: string | null;
  estMin?: number | null;
  points?: number | null;
  difficulty?: string | null;
  variant?: 'drawer' | 'workspace';
  onCopied?: () => void;
}

const CSS = `
.sl-render{--sl-line:#e4e9f1;--sl-tx:#1a2233;--sl-mut:#5b6675;--sl-accent:#d97757;--sl-accent2:#c4633a;--sl-green:#0b8a4a;--sl-code:#0f1830;
  background:#fff;color:var(--sl-tx);display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.62}
.sl-render .sl-inner{padding:20px 22px 28px;max-width:840px;margin:0 auto;width:100%}
.sl-render.sl-workspace .sl-inner{padding:26px 30px 40px}
.sl-badge{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:800;letter-spacing:1.2px;color:#fff;
  background:linear-gradient(90deg,var(--sl-accent),#c4633a);padding:4px 11px;border-radius:20px;margin-bottom:14px}
.sl-title{font-size:20px;font-weight:800;color:#0b2b4a;margin:0 0 10px;letter-spacing:-.2px}
.sl-meta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.sl-meta span{font-size:10.5px;font-weight:700;letter-spacing:.4px;color:var(--sl-mut);background:#f2f5fa;
  border:1px solid var(--sl-line);border-radius:20px;padding:3px 10px;text-transform:uppercase}
.sl-summary{color:#42506a;margin:0 0 18px;font-size:14px}
.sl-body{counter-reset:beat}
.sl-body h3{counter-increment:beat;font-size:14.5px;font-weight:700;color:#0b2b4a;margin:22px 0 8px;display:flex;align-items:center;gap:11px}
.sl-body h3:first-child{margin-top:0}
.sl-body h3::before{content:counter(beat);flex:0 0 auto;width:23px;height:23px;border-radius:50%;background:var(--sl-accent);
  color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
.sl-body p{margin:0 0 10px;color:#2b3648}
.sl-body strong{color:#0b2b4a}
.sl-body em{color:var(--sl-accent2);font-style:normal;font-weight:600}
.sl-body ol,.sl-body ul{margin:0 0 10px;padding-left:20px;color:#2b3648}
.sl-body li{margin:4px 0}
.sl-body code{background:#f2ede9;color:var(--sl-accent2);padding:1px 6px;border-radius:5px;font-family:Consolas,Menlo,monospace;font-size:.86em}
.sl-body pre{background:var(--sl-code);border:1px solid #0b1220;border-left:3px solid var(--sl-accent);color:#e7eefc;
  padding:13px 15px;border-radius:9px 9px 0 0;overflow:auto;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;
  white-space:pre-wrap;margin:0}
.sl-copy{display:block;width:100%;border:1px solid var(--sl-accent);border-top:0;background:#fff;color:var(--sl-accent2);
  font-weight:800;font-size:12.5px;padding:11px;border-radius:0 0 9px 9px;cursor:pointer;letter-spacing:.3px;transition:.15s;
  margin:0 0 12px;font-family:inherit}
.sl-copy:hover{background:var(--sl-accent);color:#fff}
.sl-copy.done{background:#eafaf1;border-color:var(--sl-green);color:var(--sl-green)}
/* single-scroll, light drawer body when it hosts a Setup Lab */
.tld-body--setuplab{padding:0 !important;background:#fff !important;overflow:hidden !important;display:flex !important}
`;

const SetupLabRender: React.FC<Props> = ({ bodyHtml, title, summary, estMin, points, difficulty, variant, onCopied }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onCopiedRef = useRef(onCopied);
  onCopiedRef.current = onCopied;

  // Attach a working "Copy prompt" button under each <pre> (native clipboard),
  // and signal the host when the student copies so it can reveal completion.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const pres = Array.from(root.querySelectorAll('pre')) as HTMLElement[];
    const added: HTMLButtonElement[] = [];
    pres.forEach((pre) => {
      if (pre.hasAttribute('data-sl-copy')) return;
      pre.setAttribute('data-sl-copy', '1');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sl-copy';
      btn.textContent = '📋  Copy prompt';
      btn.addEventListener('click', () => {
        const text = pre.innerText;
        const done = () => {
          btn.textContent = '✓  Copied — now paste it into Claude Code';
          btn.classList.add('done');
          onCopiedRef.current?.();
          window.setTimeout(() => { btn.textContent = '📋  Copy prompt'; btn.classList.remove('done'); }, 2200);
        };
        copyText(text).then(done, done);
      });
      pre.parentNode?.insertBefore(btn, pre.nextSibling);
      added.push(btn);
    });
    return () => { added.forEach((b) => b.remove()); pres.forEach((p) => p.removeAttribute('data-sl-copy')); };
  }, [bodyHtml]);

  return (
    <div className={`sl-render sl-${variant || 'drawer'}`} ref={ref}>
      <style>{CSS}</style>
      <div className="sl-inner">
        <span className="sl-badge">&#9670; CLAUDE CODE &middot; SETUP LAB</span>
        {title && <h2 className="sl-title">{title}</h2>}
        {(estMin || points || difficulty) && (
          <div className="sl-meta">
            {estMin ? <span>Length {estMin} min</span> : null}
            {points ? <span>Points +{points} pts</span> : null}
            {difficulty ? <span>Level {difficulty}</span> : null}
          </div>
        )}
        {summary && <p className="sl-summary">{summary}</p>}
        <div className="sl-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </div>
    </div>
  );
};

export default SetupLabRender;
