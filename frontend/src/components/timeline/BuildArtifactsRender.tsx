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
// Documents PLUS the recordings the rebuilt labs ask for. Weeks 5 and 7 end with
// a short screen capture proving the thing ran — an Inspector session answering a
// real call, three subagents handling one task — and before this they could not be
// submitted at all. Kept in step with `buildArtifactUpload` on the server, which
// is the actual gate; this list only decides what the file picker offers.
const ACCEPT = '.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.rtf,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.webm,.mp3,.m4a,.wav,.zip';
const ACCEPT_EXT = ACCEPT.split(',');
// 100MB, matching GitHub's file limit — the labs also tell students to commit the
// recording to their repo, so accepting something GitHub would reject is a trap.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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
.ba-sync{border-radius:10px;padding:11px 14px;margin:10px 0 0;font-size:12.8px;line-height:1.55}
.ba-sync.ok{border:1px solid #bfe6cd;background:#f2fbf6;color:#0b6e3f}
.ba-sync.warn{border:1px solid #ffe0a3;background:#fff7e6;color:#5c4a1a}
.ba-sync code{background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;font-family:Consolas,Menlo,monospace}
.ba-sync a{color:inherit;font-weight:700}
.ba-fixcmd{background:var(--code);color:#e7eefc;border-radius:7px;padding:9px 11px;margin:0 0 6px;overflow-x:auto;
  font-family:Consolas,Menlo,monospace;font-size:11.5px;line-height:1.5;white-space:pre;user-select:all}
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
  const [repoSync, setRepoSync] = useState<string | null>(null);
  const [syncRepo, setSyncRepo] = useState<{ owner: string; name: string } | null>(null);
  // Connecting a repo FROM HERE, rather than sending the student to Projects.
  //
  // The only other way to connect is `WorkspaceRepoPanel`, which renders solely
  // inside a project workspace — so a student with no project has never been
  // shown the option at all. Measured 2026-08-27: of the 8 students producing
  // real work with no repo connected, SIX had no project, including one with 17
  // submitted artifacts. They were not ignoring the step; it did not exist for
  // them.
  //
  // `/api/portal/project/setup/github` is enrollment-keyed and calls
  // `ensureProject` before connecting, so it creates the project on the way and
  // needs nothing to exist first. It was already built and had no caller in the
  // UI — this is the front door, not a new mechanism.
  const [showConnect, setShowConnect] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const connectRepo = async () => {
    const url = repoInput.trim();
    if (!url) { setConnectErr('Paste the GitHub address of your repository.'); return; }
    setConnectErr(''); setConnecting(true);
    try {
      await portalApi.post('/api/portal/project/setup/github', {
        repo_url: url,
        // Optional. Without it the platform can read the repo but not write to
        // it, which is a legitimate choice — the student's own commits are what
        // matter, and every point they earn is recorded server-side regardless.
        ...(tokenInput.trim() ? { access_token: tokenInput.trim() } : {}),
      });
      setShowConnect(false);
      setRepoSync(null);          // the warning no longer applies
      setRepoInput(''); setTokenInput('');
    } catch (err: any) {
      setConnectErr(err?.response?.data?.error || 'Could not connect that repository. Check the address and try again.');
    } finally { setConnecting(false); }
  };

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
    if (!ACCEPT_EXT.includes(ext)) { setUploadErr(`That's a ${ext || 'file with no extension'}. Upload what you built — accepted: PDF, Word, PowerPoint, Excel, Markdown, RTF, Text, CSV, images, MP4, MOV, WEBM, MP3, M4A, WAV, ZIP.`); e.target.value = ''; return; }
    // Checked here as well as on the server so a 90-second recording fails in a
    // second with advice, rather than after uploading 100MB to be rejected.
    if (f.size > MAX_UPLOAD_BYTES) {
      setUploadErr(`That file is ${(f.size / 1024 / 1024).toFixed(0)}MB and the limit is 100MB. If it's a recording, trim it to about 30-60 seconds or ask Claude Code to compress it — the same limit applies when you commit it to your repo.`);
      e.target.value = ''; return;
    }
    setUploadErr(''); setUploading(true);
    try {
      if (cardId) {
        const fd = new FormData();
        fd.append('file', f);
        // Which project this was built against. A sample build is real work and
        // is kept, but the repo index labels it — a portfolio that silently
        // mixes sample work into a capstone overstates itself.
        fd.append('project_label', proj);
        fd.append('is_sample', String(SAMPLE_PROJECTS.some((p) => p.name === proj)));
        const res: any = await portalApi.post(`/api/portal/runtime/cards/${cardId}/build-artifact`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setRepoSync(res?.data?.repo_sync?.outcome || null);
        const r = res?.data?.repo_sync?.repo;
        setSyncRepo(r?.owner && r?.name ? { owner: r.owner, name: r.name } : null);
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
          <>
            <div className="ba-donemsg">&#10003; Build submitted — nice work. You can keep building more artifacts for practice (no extra points).</div>
            {repoSync === 'written' && (
              <div className="ba-sync ok">&#10003; Saved to your GitHub repo under <code>artifacts/</code>.</div>
            )}
            {repoSync === 'unchanged' && (
              <div className="ba-sync ok">&#10003; Already in your GitHub repo — nothing changed.</div>
            )}
            {repoSync === 'no_repo' && (
              <div className="ba-sync warn">
                This is saved here, but <b>not in GitHub yet</b> — you haven&rsquo;t connected a repository.
                Connect one and your artifacts, including this one, sync automatically.
                {!showConnect && (
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-sm btn-outline-secondary" style={{ fontWeight: 700 }}
                      onClick={() => setShowConnect(true)}>
                      <i className="ri-github-fill me-1" />Connect a repository
                    </button>
                  </div>
                )}
                {showConnect && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input className="pw-in" style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5 }}
                      placeholder="https://github.com/your-name/your-repo"
                      value={repoInput} onChange={(e) => setRepoInput(e.target.value)} disabled={connecting} />
                    <input className="pw-in" style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5 }}
                      placeholder="GitHub token (optional — only needed if you want us to commit for you)"
                      value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} disabled={connecting} />
                    <div style={{ fontSize: 12.5, color: 'var(--mut)', lineHeight: 1.5 }}>
                      You don&rsquo;t need the token. Without it we can read your repo and everything still counts —
                      you just commit your own work, which is better for your GitHub profile anyway.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-sm" disabled={connecting}
                        style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700 }} onClick={connectRepo}>
                        {connecting ? 'Connecting…' : 'Connect'}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={connecting}
                        onClick={() => { setShowConnect(false); setConnectErr(''); }}>Cancel</button>
                    </div>
                    {connectErr && <div style={{ fontSize: 12.5, color: '#b42318' }}>{connectErr}</div>}
                  </div>
                )}
              </div>
            )}
            {repoSync === 'no_access' && (
              /* THE FIX, NOT THE DIAGNOSIS. "We cannot write to your repository"
                 is something a student has to go and act on later, and later is
                 exactly where sixteen of them got stuck. Both routes are shown
                 because we cannot know which they have: the link needs only a
                 browser, the command needs `gh` already authenticated but is
                 faster for someone already in the terminal they build in. */
              <div className="ba-sync warn">
                <p style={{ margin: '0 0 8px' }}>
                  Saved here, but <b>not in GitHub</b> — Colaberry can&rsquo;t write to your repository yet, so
                  this artifact isn&rsquo;t on the version an employer would look at.
                </p>
                {syncRepo ? (
                  <>
                    <p style={{ margin: '0 0 6px' }}>
                      <b>About a minute to fix.</b> Open{' '}
                      <a
                        href={`https://github.com/${syncRepo.owner}/${syncRepo.name}/settings/access`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {syncRepo.owner}/{syncRepo.name} → Collaborators
                      </a>{' '}
                      and add <code>ColaberryIntern</code>.
                    </p>
                    <p style={{ margin: '0 0 6px' }}>Or, if you have the GitHub CLI, run this where you build:</p>
                    <pre className="ba-fixcmd">{`gh api --method PUT repos/${syncRepo.owner}/${syncRepo.name}/collaborators/ColaberryIntern -f permission=push`}</pre>
                  </>
                ) : (
                  <p style={{ margin: '0 0 6px' }}>
                    Open your repo&rsquo;s <b>Settings → Collaborators</b> on GitHub and add{' '}
                    <code>ColaberryIntern</code>.
                  </p>
                )}
                <p style={{ margin: 0 }}>
                  We accept within the hour, and <b>every artifact you&rsquo;ve already built syncs then too</b>,
                  not just the next one.
                </p>
              </div>
            )}
            {repoSync === 'repo_gone' && (
              <div className="ba-sync warn">
                Saved here, but we couldn&rsquo;t find the repository you connected &mdash; it may have been
                renamed or deleted. Reconnect it and everything syncs automatically.
              </div>
            )}
            {(repoSync === 'failed' || repoSync === 'not_configured') && (
              <div className="ba-sync warn">Saved here. The GitHub copy didn&rsquo;t go through — we&rsquo;ll retry on your next upload.</div>
            )}
          </>
        ) : copyGateMet ? (
          <div className="ba-submit">
            <div className="ba-submit-h">Submit your build</div>
            <p className="ba-submit-p">Upload what you built — a file Claude Code made, or the screen recording if this week asked for one. If you have a GitHub repository connected, text files (<code>.md</code>, <code>.txt</code>, <code>.csv</code>) also land there under <code>artifacts/</code>; recordings are kept here, and the lab shows you how to commit those to your own repo. Accepted: PDF, Word, PowerPoint, Excel, Markdown, RTF, Text, CSV, images, MP4, MOV, WEBM, MP3, M4A, WAV, ZIP — up to 100MB.</p>
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
