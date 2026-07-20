import React, { useEffect, useRef } from 'react';

/**
 * SetupLabRender — the bespoke renderer for the `setup_lab` curriculum type (a
 * Claude Code "get unblocked" lab). Shared by the card drawer (CardDetailBody)
 * and the workspace (RuntimeWorkspace).
 *
 * Why native DOM (not the generic sandboxed `lessonDoc` iframe):
 *  - a fixed-height iframe inside the drawer's own scroll = a double scrollbar;
 *    a flowing native block is the single scroll.
 *  - a Copy button in an opaque-origin sandbox iframe can't reach the clipboard;
 *    native lets a real onClick use navigator.clipboard.
 * The generated body_html is authored HTML we produced (h3/p/pre/ol/strong/code
 * only, no scripts) — safe to render, but we still never run scripts from it.
 */
interface Props {
  bodyHtml: string;
  title?: string | null;
  summary?: string | null;
  estMin?: number | null;
  points?: number | null;
  difficulty?: string | null;
  variant?: 'drawer' | 'workspace';
}

const CSS = `
.sl-render{--sl-bg:#0c1322;--sl-panel:#0f1830;--sl-line:rgba(255,255,255,.10);--sl-tx:#e9eef7;--sl-mut:#9fb0c9;--sl-accent:#d97757;--sl-accent2:#f0a074;--sl-green:#49c98a;
  background:var(--sl-bg);color:var(--sl-tx);display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.62}
.sl-render .sl-inner{padding:20px 22px 28px;max-width:840px;margin:0 auto;width:100%}
.sl-render.sl-workspace .sl-inner{padding:26px 30px 40px}
.sl-badge{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:800;letter-spacing:1.2px;color:#0c1322;
  background:linear-gradient(90deg,var(--sl-accent),#c4633a);padding:4px 11px;border-radius:20px;margin-bottom:14px}
.sl-title{font-size:20px;font-weight:800;color:#fff;margin:0 0 10px;letter-spacing:-.2px}
.sl-meta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.sl-meta span{font-size:10.5px;font-weight:700;letter-spacing:.4px;color:var(--sl-mut);background:rgba(255,255,255,.05);
  border:1px solid var(--sl-line);border-radius:20px;padding:3px 10px;text-transform:uppercase}
.sl-summary{color:#c6d2e6;margin:0 0 18px;font-size:14px}
.sl-body{counter-reset:beat}
.sl-body h3{counter-increment:beat;font-size:14.5px;font-weight:700;color:#fff;margin:22px 0 8px;display:flex;align-items:center;gap:11px}
.sl-body h3:first-child{margin-top:0}
.sl-body h3::before{content:counter(beat);flex:0 0 auto;width:23px;height:23px;border-radius:50%;background:var(--sl-accent);
  color:#0c1322;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
.sl-body p{margin:0 0 10px;color:#dbe4f2}
.sl-body strong{color:#fff}
.sl-body em{color:#f0d9c9}
.sl-body ol,.sl-body ul{margin:0 0 10px;padding-left:20px;color:#cdd8ea}
.sl-body li{margin:4px 0}
.sl-body code{background:rgba(224,136,92,.15);color:var(--sl-accent2);padding:1px 6px;border-radius:5px;font-family:Consolas,Menlo,monospace;font-size:.86em}
.sl-body pre{background:var(--sl-panel);border:1px solid var(--sl-line);border-left:3px solid var(--sl-accent);color:#e7eefc;
  padding:13px 15px;border-radius:9px 9px 0 0;overflow:auto;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;
  white-space:pre-wrap;margin:0}
.sl-copy{display:block;width:100%;border:1px solid var(--sl-line);border-top:0;background:#131e38;color:var(--sl-accent2);
  font-weight:700;font-size:12.5px;padding:10px;border-radius:0 0 9px 9px;cursor:pointer;letter-spacing:.3px;transition:.15s;
  margin:0 0 12px;font-family:inherit}
.sl-copy:hover{background:#182545;color:#fff}
.sl-copy.done{color:var(--sl-green)}
/* Make the drawer body fully dark + single-scroll when it hosts a Setup Lab. */
.tld-body--setuplab{padding:0 !important;background:#0c1322 !important;overflow:hidden !important;display:flex !important}
`;

const SetupLabRender: React.FC<Props> = ({ bodyHtml, title, summary, estMin, points, difficulty, variant }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Attach a working "Copy prompt" button under each <pre> (native clipboard).
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
          btn.textContent = '✓  Copied';
          btn.classList.add('done');
          window.setTimeout(() => { btn.textContent = '📋  Copy prompt'; btn.classList.remove('done'); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
        else done();
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
