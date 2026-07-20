import React, { useMemo, useState } from 'react';

/**
 * PromptCatalogRender — the bespoke renderer for the `prompt_lab` (render_band
 * `prompt_catalog`) curriculum type: a catalog of practice prompts for the week,
 * grouped by rising-ambition category. Each prompt shows a plain-English
 * explanation; the prompt itself is hidden until the student reveals it, then
 * copies it into Claude Code. Shared by the drawer + the workspace.
 *
 * The generation prompt emits a strict structure (<h3> category, then repeating
 * <h4> title / <p> explanation / <pre> prompt), which we parse into React so the
 * reveal + copy are real components (no DOM hacking, native clipboard, light theme).
 */
interface PromptItem { title: string; explanation: string; prompt: string; }
interface Category { name: string; prompts: PromptItem[]; }

function parseCatalog(html: string): Category[] {
  let root: HTMLElement | null = null;
  try {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    root = doc.getElementById('r');
  } catch { return []; }
  if (!root) return [];
  const cats: Category[] = [];
  let cur: Category | null = null;
  let curP: PromptItem | null = null;
  Array.from(root.children).forEach((node) => {
    const tag = node.tagName.toLowerCase();
    const text = (node.textContent || '').trim();
    if (tag === 'h3') { cur = { name: text, prompts: [] }; cats.push(cur); curP = null; }
    else if (tag === 'h4') {
      if (!cur) { cur = { name: '', prompts: [] }; cats.push(cur); }
      curP = { title: text, explanation: '', prompt: '' };
      cur.prompts.push(curP);
    } else if (tag === 'p') { if (curP) curP.explanation = (curP.explanation ? curP.explanation + ' ' : '') + text; }
    else if (tag === 'pre') { if (curP) curP.prompt = node.textContent || ''; }
  });
  return cats.filter((c) => c.prompts.length);
}

const CAT_EMOJI = ['🌱', '🔨', '🚀', '⚡', '🎯', '🧠'];

const CSS = `
.plc-render{--line:#e4e9f1;--tx:#1a2233;--mut:#5b6675;--ink:#0b2b4a;--accent:#d97757;--accent2:#c4633a;--green:#0b8a4a;--code:#0f1830;
  background:#fff;color:var(--tx);display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.6}
.plc-render .plc-inner{padding:22px 24px 34px;max-width:680px;margin:0 auto;width:100%}
.plc-badge{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:800;letter-spacing:1.2px;color:#fff;
  background:linear-gradient(90deg,var(--accent),#c4633a);padding:4px 11px;border-radius:20px;margin-bottom:14px}
.plc-h{font-size:19px;font-weight:800;color:var(--ink);margin:0 0 4px}
.plc-sum{color:var(--mut);font-size:13.5px;margin:0 0 6px}
.plc-cathead{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--accent2);margin:28px 0 10px;display:flex;align-items:center;gap:8px}
.plc-prompt{border:1px solid var(--line);border-radius:12px;padding:16px 18px 14px;margin:0 0 14px;background:#fbfcfe}
.plc-prompt:hover{border-color:#cfd8e6}
.plc-title{font-size:15.5px;font-weight:700;color:var(--ink);margin:0 0 6px}
.plc-exp{margin:0 0 10px;color:#3a475c;font-size:13.5px;line-height:1.6}
.plc-ctl{display:flex;gap:8px;align-items:center}
.plc-toggle{border:1px solid var(--accent);background:#fff;color:var(--accent2);font-weight:700;font-size:12px;padding:7px 13px;border-radius:8px;cursor:pointer;font-family:inherit}
.plc-toggle:hover{background:var(--accent);color:#fff}
.plc-copy{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:700;font-size:12px;padding:7px 13px;border-radius:8px;cursor:pointer;font-family:inherit}
.plc-copy:hover{color:var(--ink);border-color:var(--mut)}
.plc-copy.done{color:var(--green);border-color:var(--green)}
.plc-pre{background:var(--code);border-left:3px solid var(--accent);color:#e7eefc;padding:13px 15px;border-radius:8px;overflow:auto;
  font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;margin:10px 0 0}
.tld-body--promptcatalog{padding:0 !important;background:#fff !important;overflow:hidden !important;display:flex !important}
`;

const PromptRow: React.FC<{ p: PromptItem }> = ({ p }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(p.prompt).then(done, done);
    else done();
  };
  return (
    <div className="plc-prompt">
      <div className="plc-title">▸ {p.title}</div>
      {p.explanation && <p className="plc-exp">{p.explanation}</p>}
      <div className="plc-ctl">
        <button type="button" className="plc-toggle" onClick={() => setOpen((o) => !o)}>{open ? '▾ Hide prompt' : '▸ Show prompt'}</button>
        {open && <button type="button" className={`plc-copy${copied ? ' done' : ''}`} onClick={copy}>{copied ? '✓ Copied' : '📋 Copy'}</button>}
      </div>
      {open && <pre className="plc-pre">{p.prompt}</pre>}
    </div>
  );
};

interface Props { bodyHtml: string; title?: string | null; summary?: string | null; variant?: 'drawer' | 'workspace'; }

const PromptCatalogRender: React.FC<Props> = ({ bodyHtml, title, summary, variant }) => {
  const cats = useMemo(() => parseCatalog(bodyHtml || ''), [bodyHtml]);
  return (
    <div className={`plc-render plc-${variant || 'drawer'}`}>
      <style>{CSS}</style>
      <div className="plc-inner">
        <span className="plc-badge">&#9670; CLAUDE CODE &middot; PROMPT LAB</span>
        {title && <h2 className="plc-h">{title}</h2>}
        {summary && <p className="plc-sum">{summary}</p>}
        {cats.map((c, i) => (
          <div key={i} className="plc-cat">
            <div className="plc-cathead">{CAT_EMOJI[i % CAT_EMOJI.length]} {c.name}</div>
            {c.prompts.map((p, j) => <PromptRow key={j} p={p} />)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PromptCatalogRender;
