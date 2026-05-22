#!/usr/bin/env node
/**
 * generateSessionChangelog.js — per-session change report (HTML).
 *
 * Reads PROGRESS.md, selects the entries tagged with a given Session ID
 * (the `- Session: CC-YYYYMMDD-xxxx` line, per CLAUDE.md's session protocol),
 * renders a detailed, styled HTML changelog to docs/sessions/SESSION_<id>.html,
 * and opens it in the default browser.
 *
 * Why per-session: multiple Claude instances run against this repo at once.
 * Keying the report on the Session ID means each instance owns its own HTML and
 * they never overwrite each other.
 *
 * Usage:
 *   node scripts/generateSessionChangelog.js CC-20260522-2b04
 *   node scripts/generateSessionChangelog.js CC-20260522-2b04 --no-open
 *
 * Pure, repeatable, safe to re-run: it overwrites only that session's HTML.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROGRESS = path.join(REPO_ROOT, 'PROGRESS.md');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'sessions');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Parse PROGRESS.md into structured entries. An entry starts at a
 * `- [x] <title>` / `- [ ] <title>` line and runs until the next such line or
 * the next H1/H2 heading. A markdown table immediately following an entry is
 * captured as its "files touched" list.
 */
function parseEntries(md) {
  const lines = md.split(/\r?\n/);
  const entries = [];
  let cur = null;

  const field = (line, label) => {
    const m = line.match(new RegExp(`^\\s*-\\s*${label}:\\s*(.+)$`, 'i'));
    return m ? m[1].trim() : null;
  };

  for (const line of lines) {
    const header = line.match(/^- \[[x ]\]\s+(.+)$/);
    if (header) {
      if (cur) entries.push(cur);
      cur = { title: header[1].trim(), date: '', session: '', whatChanged: '', verification: '', notes: '', files: [] };
      continue;
    }
    // A new top-level heading ends the current entry.
    if (/^#{1,2}\s/.test(line)) { if (cur) { entries.push(cur); cur = null; } continue; }
    if (!cur) continue;

    const d = field(line, 'Date'); if (d) { cur.date = d; continue; }
    const s = field(line, 'Session'); if (s) { cur.session = s; continue; }
    const w = field(line, 'What changed'); if (w) { cur.whatChanged = w; continue; }
    const v = field(line, 'Verification'); if (v) { cur.verification = v; continue; }
    const n = field(line, 'Notes'); if (n) { cur.notes = n; continue; }

    // Markdown table rows (the file/change list). Skip header + separator.
    if (/^\s*\|/.test(line)) {
      const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
      if (cells.length >= 2 && !/^-{2,}$/.test(cells[0]) && cells[0].toLowerCase() !== 'file') {
        cur.files.push({ file: cells[0], change: cells.slice(1).join(' | ') });
      }
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

function renderHtml(sessionId, entries) {
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  const cards = entries.map((e, i) => {
    const fileRows = e.files.map(f => `
          <tr><td class="path">${escapeHtml(f.file)}</td><td>${escapeHtml(f.change)}</td></tr>`).join('');
    const filesBlock = e.files.length ? `
        <div class="files">
          <div class="files-label">Files touched</div>
          <table><tbody>${fileRows}</tbody></table>
        </div>` : '';
    const notesBlock = e.notes ? `
        <div class="row"><span class="k">Notes</span><span class="v">${escapeHtml(e.notes)}</span></div>` : '';
    return `
      <article class="card">
        <div class="card-head">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <h2>${escapeHtml(e.title)}</h2>
          <span class="badge">${escapeHtml(e.date || '—')}</span>
        </div>
        <div class="card-body">
          <div class="row"><span class="k">What changed</span><span class="v">${escapeHtml(e.whatChanged)}</span></div>
          <div class="row"><span class="k">Verification</span><span class="v ver">${escapeHtml(e.verification)}</span></div>
          ${notesBlock}
          ${filesBlock}
        </div>
      </article>`;
  }).join('\n');

  const empty = `<div class="empty">No PROGRESS.md entries tagged <code>${escapeHtml(sessionId)}</code> yet.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Session ${escapeHtml(sessionId)} — Change Report</title>
<style>
  :root{
    --navy:#0f2942; --navy-2:#1a365d; --blue:#2b6cb0; --blue-l:#3b82f6;
    --ink:#1e293b; --muted:#64748b; --line:#e2e8f0; --bg:#f1f5f9; --card:#ffffff;
    --green:#059669; --green-bg:#ecfdf5;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  header{background:linear-gradient(135deg,var(--navy),var(--blue));color:#fff;padding:38px 40px 30px;}
  header .eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.8;font-weight:600}
  header h1{margin:8px 0 6px;font-size:26px;font-weight:700;letter-spacing:-.01em}
  header .meta{font-size:13px;opacity:.85}
  header .sid{display:inline-block;margin-top:14px;background:rgba(255,255,255,.14);
    border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 12px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:600}
  header .count{margin-left:10px;opacity:.8;font-size:13px}
  main{max-width:980px;margin:0 auto;padding:28px 24px 60px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;
    box-shadow:0 1px 3px rgba(15,41,66,.06);margin-bottom:18px;overflow:hidden}
  .card-head{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--line);
    background:linear-gradient(to bottom,#fafcff,#fff)}
  .card-head .num{font-family:ui-monospace,monospace;font-size:13px;font-weight:700;color:#fff;
    background:var(--blue-l);border-radius:7px;padding:5px 9px;flex:none}
  .card-head h2{flex:1;margin:0;font-size:16px;font-weight:650;color:var(--navy-2);letter-spacing:-.01em}
  .badge{flex:none;font-size:12px;color:var(--muted);background:#f8fafc;border:1px solid var(--line);
    border-radius:999px;padding:3px 11px;font-weight:600}
  .card-body{padding:18px 22px 20px}
  .row{display:flex;gap:16px;padding:7px 0;border-bottom:1px dashed #eef2f7}
  .row:last-child{border-bottom:none}
  .k{flex:none;width:120px;font-size:12px;font-weight:700;color:var(--muted);
    text-transform:uppercase;letter-spacing:.04em;padding-top:2px}
  .v{flex:1;color:var(--ink)}
  .v.ver{color:var(--green);font-weight:550}
  .files{margin-top:14px;background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
  .files-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;
    letter-spacing:.06em;margin-bottom:8px}
  .files table{width:100%;border-collapse:collapse;font-size:13px}
  .files td{padding:6px 8px;vertical-align:top;border-top:1px solid #eef2f7}
  .files tr:first-child td{border-top:none}
  .files td.path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
    color:var(--navy-2);white-space:nowrap;font-weight:600}
  .empty{background:#fff;border:1px dashed var(--line);border-radius:14px;padding:40px;
    text-align:center;color:var(--muted)}
  footer{max-width:980px;margin:0 auto;padding:0 24px 40px;color:var(--muted);font-size:12px}
  code{font-family:ui-monospace,monospace;background:#eef2f7;padding:1px 6px;border-radius:5px;font-size:.92em}
</style>
</head>
<body>
  <header>
    <div class="eyebrow">Colaberry Accelerator · Session Change Report</div>
    <h1>What changed this session</h1>
    <div class="meta">Generated ${escapeHtml(generated)}</div>
    <div><span class="sid">${escapeHtml(sessionId)}</span><span class="count">${entries.length} change${entries.length === 1 ? '' : 's'}</span></div>
  </header>
  <main>
    ${entries.length ? cards : empty}
  </main>
  <footer>
    Sourced from <code>PROGRESS.md</code> entries tagged <code>${escapeHtml(sessionId)}</code>.
    Regenerated after each change per <code>CLAUDE.md</code> → Per-session change report.
  </footer>
</body>
</html>`;
}

function openInBrowser(file) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) {
    console.warn('[changelog] could not auto-open browser:', e.message);
  }
}

function main() {
  const args = process.argv.slice(2);
  const sessionId = args.find(a => !a.startsWith('--'));
  const noOpen = args.includes('--no-open');
  if (!sessionId || !/^CC-\d{8}-[A-Za-z0-9]+$/.test(sessionId)) {
    console.error('Usage: node scripts/generateSessionChangelog.js CC-YYYYMMDD-xxxx [--no-open]');
    process.exit(1);
  }
  if (!fs.existsSync(PROGRESS)) { console.error('PROGRESS.md not found at repo root'); process.exit(1); }

  const md = fs.readFileSync(PROGRESS, 'utf8');
  const all = parseEntries(md);
  const mine = all.filter(e => e.session === sessionId);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `SESSION_${sessionId}.html`);
  fs.writeFileSync(outFile, renderHtml(sessionId, mine), 'utf8');

  console.log(`[changelog] ${mine.length} entr${mine.length === 1 ? 'y' : 'ies'} → ${outFile}`);
  if (!noOpen) openInBrowser(outFile);
}

main();
