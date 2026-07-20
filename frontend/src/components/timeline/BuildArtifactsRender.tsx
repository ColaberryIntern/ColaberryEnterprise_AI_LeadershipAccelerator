import React, { useEffect, useMemo, useRef, useState } from 'react';
import portalApi from '../../utils/portalApi';
import { copyText } from '../../utils/clipboard';

/**
 * BuildArtifactsRender — the bespoke renderer for the "Build Artifact(s) Lab"
 * curriculum type (render_band `build_artifacts`; merges implementation_task +
 * artifact_submission). A build station: the student picks WHAT to build (5
 * curriculum-aware artifacts) and WHICH project (their repos + sample projects),
 * gets a Deep-Dive-grade paste-in prompt (project name substituted), builds a
 * real artifact FILE in Claude Code, and completes by UPLOADING that file (its
 * type is validated). Points are awarded on the FIRST submitted build only.
 * Owns its own completion (upload + submit) inline so it works identically in the
 * drawer (phone) and workspace (computer). Shared by both surfaces.
 */
interface Artifact { name: string; what: string; prompt: string; }
interface ProjectOpt { id: string; name: string; sample?: boolean; }

const SAMPLE_PROJECTS: ProjectOpt[] = [
  { id: 'sample-retail', name: 'the Retail Analytics Dashboard (sample)', sample: true },
  { id: 'sample-support', name: 'the Customer Support Assistant (sample)', sample: true },
  { id: 'sample-forecast', name: 'the Sales Forecasting Tool (sample)', sample: true },
];
const ACCEPT = '.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.rtf,.txt,.md,.csv';
const ACCEPT_EXT = ACCEPT.split(',');

function parseArtifacts(html: string): Artifact[] {
  let root: HTMLElement | null = null;
  try { root = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html').getElementById('r'); }
  catch { return []; }
  if (!root) return [];
  const out: Artifact[] = []; let cur: Artifact | null = null;
  Array.from(root.children).forEach((n) => {
    const tag = n.tagName.toLowerCase(); const text = (n.textContent || '').trim();
    if (tag === 'h4' || tag === 'h3') { cur = { name: text, what: '', prompt: '' }; out.push(cur); }
    else if (tag === 'p') { if (cur) cur.what = (cur.what ? cur.what + ' ' : '') + text; }
    else if (tag === 'pre') { if (cur) cur.prompt = n.textContent || ''; }
  });
  return out.filter((a) => a.name);
}

const CSS = `
.ba-render{--line:#e4e9f1;--tx:#1a2233;--mut:#5b6675;--ink:#0b2b4a;--accent:#d97757;--accent2:#c4633a;--green:#0b8a4a;--code:#0f1830;
  background:#fff;color:var(--tx);display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.6}
.ba-render .ba-inner{padding:24px 28px 40px;max-width:760px;margin:0 auto;width:100%}
.ba-badge{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:800;letter-spacing:1.2px;color:#fff;
  background:linear-gradient(90deg,var(--accent),#c4633a);padding:4px 11px;border-radius:20px;margin-bottom:12px}
.ba-h{font-size:20px;font-weight:800;color:var(--ink);margin:0 0 4px}
.ba-sum{color:var(--mut);font-size:13.5px;margin:0 0 20px}
.ba-panel{border:1px solid var(--line);border-radius:14px;background:#fbfcfe;padding:18px 20px;margin:0 0 16px}
.ba-selrow{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.ba-selrow{grid-template-columns:1fr}}
.ba-lbl{font-size:12px;font-weight:700;color:var(--ink);margin:0 0 6px;display:block}
.ba-render select{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;color:var(--tx);background:#fff;font-family:inherit;cursor:pointer}
.ba-what{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:13.5px;color:#3a475c;margin:14px 0 0;line-height:1.6}
.ba-pl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--accent2);margin:0 0 8px}
.ba-pre{background:var(--code);border-left:3px solid var(--accent);color:#e7eefc;padding:14px 16px;border-radius:9px 9px 0 0;overflow:auto;
  font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;margin:0;max-height:300px}
.ba-copy{display:block;width:100%;border:1px solid var(--accent);border-top:0;background:#fff;color:var(--accent2);font-weight:800;font-size:13px;
  padding:11px;border-radius:0 0 9px 9px;cursor:pointer;font-family:inherit}
.ba-copy:hover{background:var(--accent);color:#fff}
.ba-copy.done{background:#eafaf1;border-color:var(--green);color:var(--green)}
.ba-note{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--mut);margin:14px 0 0}
.ba-track{font-size:12.5px;font-weight:700;color:var(--ink);background:#f4f6fb;border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin:14px 0 0}
.ba-pts{font-size:12px;color:#5c4a1a;background:#fff7e6;border:1px solid #ffe0a3;border-radius:8px;padding:9px 12px;margin:10px 0 0;line-height:1.5}
.ba-submit{border:1px solid var(--accent);border-radius:12px;background:#fffaf7;padding:16px 18px;margin:18px 0 0}
.ba-submit-h{font-size:14px;font-weight:800;color:var(--ink);margin:0 0 4px}
.ba-submit-p{font-size:12.5px;color:var(--mut);margin:0 0 12px;line-height:1.5}
.ba-submit-btn{border:0;border-radius:9px;padding:12px 16px;font-weight:800;font-size:13px;cursor:pointer;background:var(--accent);color:#fff;width:100%}
.ba-submit-btn:hover{background:var(--accent2)}
.ba-submit-btn:disabled{opacity:.6;cursor:default}
.ba-err{color:#b3261e;background:#fdeceb;border:1px solid #f5c6c2;border-radius:8px;padding:8px 11px;font-size:12.5px;margin:10px 0 0}
.ba-donemsg{border:1px solid #bfe6cd;background:#eafaf1;color:var(--green);border-radius:12px;padding:14px 16px;margin:18px 0 0;font-size:13.5px;font-weight:600}
.tld-body--buildartifacts{padding:0 !important;background:#fff !important;overflow:hidden !important;display:flex !important}
`;

interface Props {
  bodyHtml: string; title?: string | null; summary?: string | null; variant?: 'drawer' | 'workspace';
  cardId?: string; completed?: boolean; onComplete?: () => Promise<void> | void; onCopied?: () => void;
}

const BuildArtifactsRender: React.FC<Props> = ({ bodyHtml, title, summary, variant, cardId, completed, onComplete, onCopied }) => {
  const arts = useMemo(() => parseArtifacts(bodyHtml || ''), [bodyHtml]);
  const [projects, setProjects] = useState<ProjectOpt[]>(SAMPLE_PROJECTS);
  const [ownCount, setOwnCount] = useState(0);
  const [artIdx, setArtIdx] = useState(0);
  const [proj, setProj] = useState<string>(SAMPLE_PROJECTS[0].name);
  const [copied, setCopied] = useState<Set<number>>(new Set());
  const [flash, setFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [localDone, setLocalDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    portalApi.get('/api/portal/projects')
      .then((r: any) => {
        const own: ProjectOpt[] = (r?.data?.projects || []).map((p: any) => ({ id: p.id, name: p.name || 'Untitled project' }));
        if (!alive) return;
        setOwnCount(own.length); setProjects([...own, ...SAMPLE_PROJECTS]);
        if (own.length) setProj(own[0].name);
      })
      .catch(() => { /* samples only */ });
    return () => { alive = false; };
  }, []);

  const cur = arts[artIdx] || arts[0];
  const promptText = (cur?.prompt || '').split('{PROJECT}').join(proj);
  const copyGateMet = copied.size > 0;
  const isDone = !!completed || localDone;

  const copy = () => {
    const done = () => { setCopied((s) => { const n = new Set(s); n.add(artIdx); return n; }); onCopied?.(); setFlash(true); window.setTimeout(() => setFlash(false), 1800); };
    copyText(promptText).then(done, done);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    if (!ACCEPT_EXT.includes(ext)) { setUploadErr(`That's a ${ext || 'file with no extension'}. Upload the document file you built — accepted: PDF, Word, PowerPoint, Excel, Markdown, RTF, Text, CSV.`); e.target.value = ''; return; }
    setUploadErr(''); setUploading(true);
    try {
      if (cardId) {
        const fd = new FormData(); fd.append('file', f);
        await portalApi.post(`/api/portal/runtime/cards/${cardId}/build-artifact`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      if (onComplete) await onComplete();
      setLocalDone(true);
    } catch (err: any) {
      setUploadErr(err?.response?.data?.error || 'Upload failed — please try again.');
    } finally { setUploading(false); e.target.value = ''; }
  };

  const total = arts.length || 5;
  return (
    <div className={`ba-render ba-${variant || 'drawer'}`}>
      <style>{CSS}</style>
      <div className="ba-inner">
        <span className="ba-badge">&#9670; CLAUDE CODE &middot; BUILD</span>
        {title && <h2 className="ba-h">{title}</h2>}
        {summary && <p className="ba-sum">{summary}</p>}
        <div className="ba-panel">
          <div className="ba-selrow">
            <div>
              <label className="ba-lbl" htmlFor="ba-art">1 &middot; What do you want to build?</label>
              <select id="ba-art" value={artIdx} onChange={(e) => setArtIdx(Number(e.target.value))}>
                {arts.map((a, i) => <option key={i} value={i}>{i + 1}. {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="ba-lbl" htmlFor="ba-proj">2 &middot; On which project?</label>
              <select id="ba-proj" value={proj} onChange={(e) => setProj(e.target.value)}>
                {ownCount > 0 && (
                  <optgroup label="Your projects">
                    {projects.filter((p) => !p.sample).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </optgroup>
                )}
                <optgroup label="Sample projects (no repo needed)">
                  {SAMPLE_PROJECTS.map((p) => <option key={p.id} value={p.name}>{p.name.replace('the ', '')}</option>)}
                </optgroup>
              </select>
            </div>
          </div>
          {cur?.what && <div className="ba-what">{cur.what}</div>}
        </div>
        <div className="ba-pl">Your build prompt — paste into Claude Code</div>
        <pre className="ba-pre">{promptText}</pre>
        <button type="button" className={`ba-copy${flash ? ' done' : ''}`} onClick={copy}>{flash ? '✓  Copied — paste into Claude Code' : '📋  Copy build prompt'}</button>
        <div className="ba-note">&#9201; Builds in ~5+ minutes &middot; a real, portfolio-grade deliverable on your selected project.</div>
        <div className="ba-track">Built {copied.size} of {total} this section &middot; you can build all {total}, on any project.</div>
        <div className="ba-pts">&#127942; <b>Points on your first submitted build only.</b> Re-run on other artifacts or projects any time for practice — extra builds don&rsquo;t add points.</div>

        {isDone ? (
          <div className="ba-donemsg">&#10003; Build submitted — nice work. You can keep building more artifacts for practice (no extra points).</div>
        ) : copyGateMet ? (
          <div className="ba-submit">
            <div className="ba-submit-h">Submit your build</div>
            <p className="ba-submit-p">Upload the file Claude Code saved to your <b>Downloads</b> folder (it told you the exact name). Accepted: PDF, Word, PowerPoint, Excel, Markdown, RTF, Text, CSV.</p>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={onFile} />
            <button type="button" className="ba-submit-btn" disabled={uploading} onClick={() => fileRef.current && fileRef.current.click()}>{uploading ? 'Uploading…' : '⬆  Upload your file & submit'}</button>
            {uploadErr && <div className="ba-err">{uploadErr}</div>}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BuildArtifactsRender;
