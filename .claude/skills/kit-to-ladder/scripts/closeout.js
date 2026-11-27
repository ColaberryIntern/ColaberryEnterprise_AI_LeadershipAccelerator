#!/usr/bin/env node
/**
 * Close one ladder ticket the way Ali's rules require, in one command, so no run improvises it.
 *
 *   1. Render the ticket's two HTML pages to PDF: a one-page VISUAL and a DOCUMENT
 *      (scripts/artifacts/renderArtifactPdf.js measures the page count; a visual over one page fails).
 *   2. Post both PDFs on the ticket, visual first, and file them in the build's ticket-artifacts
 *      folder (scripts/artifacts/attachArtifactToTicket.js: idempotent, checks the preview rendered).
 *   3. Post the TAKEAWAY comment with both HTML files attached (Ali, 2026-11-05: "add the html to the
 *      ticket ... along with the pdf's"). Idempotent by a marker.
 *   4. Close through ~/.claude/hooks/bc-close.js, the only sanctioned close (2 PDFs, once per task,
 *      at most 3 times per list). Dry run first; a refusal stops here and the ticket stays open.
 *
 * Rules quoted: "Every ticket should have at least 2 visual artifacts before it is closed" (10-22),
 * "Artifacts should not be .md files. They should be pdfs" (11-10).
 *
 * Runs locally from inside a checkout of this repo. Basecamp writes happen in the production backend
 * container, which holds the live token; nothing secret is read or printed here.
 *
 * Usage:
 *   node closeout.js --code VS1.3 --list <todolistId> --vault <build folder id> --artifacts "<sub-folder title>" \
 *     --visual <visual.html> --doc <document.html> --takeaway "<one line>" [--bucket 7463955] [--dry]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOST = process.env.PROD_SSH || 'root@95.216.199.47';
const CONTAINER = process.env.PROD_CONTAINER || 'accelerator-backend';
const CLOSE = path.join(os.homedir(), '.claude', 'hooks', 'bc-close.js');

/** Parse and check the arguments. Pure; throws with the first problem. */
function parseArgs(argv) {
  const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const a = { code: opt('--code'), list: opt('--list'), vault: opt('--vault'), artifacts: opt('--artifacts'), visual: opt('--visual'), doc: opt('--doc'),
    takeaway: opt('--takeaway'), bucket: opt('--bucket') || '7463955', dry: argv.includes('--dry') };
  if (!/^[A-Z]{1,4}\d+(\.\d+)?$/.test(a.code || '')) throw new Error('--code must look like VS1.3');
  for (const k of ['list', 'vault', 'bucket']) if (!/^\d+$/.test(a[k] || '')) throw new Error(`--${k} must be a number`);
  if (!a.artifacts || /["`$\\]/.test(a.artifacts)) throw new Error('--artifacts must be the sub-folder title');
  for (const k of ['visual', 'doc']) if (!a[k] || !/\.html?$/i.test(a[k]) || !fs.existsSync(a[k])) throw new Error(`--${k} must be an existing .html file`);
  if (path.resolve(a.visual) === path.resolve(a.doc)) throw new Error('the visual and the document must be two different pages');
  if (!a.takeaway || a.takeaway.length < 10) throw new Error('--takeaway must say the result in one line');
  return a;
}

/** The container script that posts the TAKEAWAY comment with the HTML pages attached. */
const TAKEAWAY_JS = `
const fs = require('fs');
const S = JSON.parse(fs.readFileSync(process.env.SPEC, 'utf8'));
const API = 'https://3.basecampapi.com/3945211/buckets/' + S.bucket;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
(async () => {
  const tok = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  const H = { Authorization: 'Bearer ' + tok, 'User-Agent': 'Colaberry AI Ops' };
  const call = async (m, u, body, h = {}) => { const r = await fetch(u, { method: m, headers: { ...H, ...h }, body, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(m + ' ' + r.status); return r.status === 204 ? {} : r.json(); };
  const me = await call('GET', 'https://3.basecampapi.com/3945211/my/profile.json');
  if (me.id !== 17454835) throw new Error('not acting as Ali');
  const mark = '[closeout:' + S.code + ']';
  const cs = await call('GET', API + '/recordings/' + S.todo + '/comments.json');
  if (cs.some((c) => String(c.content).includes(mark))) { console.log('TAKEAWAY already posted'); return; }
  if (S.dry) { console.log('[DRY] would post TAKEAWAY with ' + S.files.length + ' HTML files'); return; }
  let atts = '';
  for (const f of S.files) {
    const a = await call('POST', 'https://3.basecampapi.com/3945211/attachments.json?name=' + encodeURIComponent(f.name), fs.readFileSync(f.path), { 'Content-Type': 'text/html' });
    atts += '<div><bc-attachment sgid="' + a.attachable_sgid + '" caption="' + esc(f.caption) + '"></bc-attachment></div>';
  }
  const c = await call('POST', API + '/recordings/' + S.todo + '/comments.json', JSON.stringify({ content: '<div><strong>TAKEAWAY:</strong> ' + esc(S.takeaway) + '</div><div><br></div>' + atts + '<div>' + mark + '</div>' }), { 'Content-Type': 'application/json' });
  const back = await call('GET', API + '/comments/' + c.id + '.json');
  if (!String(back.content).includes(mark)) throw new Error('TAKEAWAY did not read back');
  console.log('TAKEAWAY posted ' + back.app_url);
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });`;

/** Run a command; throw with its output if it fails. */
function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', timeout: 240000, windowsHide: true });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(-3).join(' ')} failed:\n${out.slice(-1500)}`);
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const repo = run('git', ['rev-parse', '--show-toplevel']).trim();
  const art = path.join(repo, 'scripts', 'artifacts');
  if (!fs.existsSync(path.join(art, 'renderArtifactPdf.js'))) throw new Error('run this from inside a checkout of the repo (scripts/artifacts is missing)');
  if (!fs.existsSync(CLOSE)) throw new Error('the Basecamp close gate (~/.claude/hooks/bc-close.js) is not installed on this computer');

  // 1. Render. Playwright's own browser is often not downloaded on Ali's machines; Edge always is.
  if (!process.env.ARTIFACT_CHROMIUM) {
    const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
    if (edge) process.env.ARTIFACT_CHROMIUM = edge;
  }
  const work =fs.mkdtempSync(path.join(os.tmpdir(), `closeout-${a.code}-`));
  const { renderPdf } = require(path.join(art, 'renderArtifactPdf.js'));
  const vPdf = path.join(work, `${a.code}-visual.pdf`), dPdf = path.join(work, `${a.code}-document.pdf`);
  await renderPdf({ html: fs.readFileSync(a.visual, 'utf8'), outPath: vPdf, maxPages: 1 });
  await renderPdf({ html: fs.readFileSync(a.doc, 'utf8'), outPath: dPdf });
  console.log('1/4 rendered', path.basename(vPdf), path.basename(dPdf));

  // 2. Ship everything to the container in one folder.
  const rdir = `/tmp/closeout-${a.code.replace('.', '-')}`;
  fs.copyFileSync(a.visual, path.join(work, `${a.code}-visual.html`));
  fs.copyFileSync(a.doc, path.join(work, `${a.code}-document.html`));
  fs.copyFileSync(path.join(art, 'attachArtifactToTicket.js'), path.join(work, 'attach.js'));
  fs.copyFileSync(CLOSE, path.join(work, 'bc-close.js'));
  fs.writeFileSync(path.join(work, 'takeaway.js'), TAKEAWAY_JS);
  fs.writeFileSync(path.join(work, 'attach.json'), JSON.stringify({ ticketCode: a.code, folderTitle: a.artifacts, posts: [
    { file: `${rdir}/${a.code}-visual.pdf`, filename: `${a.code}-visual.pdf`, caption: `${a.code} visual`, comment: `<div><strong>${a.code} visual</strong></div>` },
    { file: `${rdir}/${a.code}-document.pdf`, filename: `${a.code}-document.pdf`, caption: `${a.code} document`, comment: `<div><strong>${a.code} document</strong></div>` },
  ] }));
  run('ssh', ['-o', 'BatchMode=yes', HOST, `rm -rf ${rdir} && mkdir -p ${rdir}`]);
  run('scp', ['-q', '-o', 'BatchMode=yes', ...fs.readdirSync(work).map((f) => path.join(work, f)), `${HOST}:${rdir}/`]);
  run('ssh', ['-o', 'BatchMode=yes', HOST, `docker exec ${CONTAINER} rm -rf ${rdir} && docker cp ${rdir} ${CONTAINER}:${rdir}`]);
  const env = (extra) => ['docker', 'exec', '-e', `BUCKET=${a.bucket}`, '-e', `LIST=${a.list}`, '-e', `PARENT_VAULT=${a.vault}`, ...(a.dry ? ['-e', 'DRY=1'] : []), ...extra];

  // 3. Attach the PDFs (visual first). The script resolves the ticket by its code and refuses a mismatch.
  const attached = run('ssh', ['-o', 'BatchMode=yes', HOST, ...env(['-e', `SPEC=${rdir}/attach.json`, CONTAINER, 'node', `${rdir}/attach.js`])]);
  const todo = (attached.match(/\/todos\/(\d+)/) || [])[1];
  if (!todo) throw new Error('could not confirm which ticket the PDFs went to:\n' + attached.slice(-800));
  console.log(a.dry ? '2/4 [dry] ticket found by its code:' : '2/4 PDFs on the ticket', todo);

  fs.writeFileSync(path.join(work, 'takeaway.json'), JSON.stringify({ bucket: a.bucket, todo, code: a.code, takeaway: a.takeaway, dry: a.dry, files: [
    { path: `${rdir}/${a.code}-visual.html`, name: `${a.code}-visual.html`, caption: `${a.code} visual (HTML)` },
    { path: `${rdir}/${a.code}-document.html`, name: `${a.code}-document.html`, caption: `${a.code} document (HTML)` } ] }));
  run('scp', ['-q', '-o', 'BatchMode=yes', path.join(work, 'takeaway.json'), `${HOST}:${rdir}/`]);
  run('ssh', ['-o', 'BatchMode=yes', HOST, `docker cp ${rdir}/takeaway.json ${CONTAINER}:${rdir}/takeaway.json`]);
  const said = run('ssh', ['-o', 'BatchMode=yes', HOST, ...env(['-e', `SPEC=${rdir}/takeaway.json`, CONTAINER, 'node', `${rdir}/takeaway.js`])]);
  console.log('3/4', (said.split('\n').filter((l) => /TAKEAWAY/.test(l)).pop() || said.trim().split('\n').pop()).trim());

  // 4. Close only through the gate. Its dry run must pass first.
  // The gate exits non-zero when it refuses; keep its words either way.
  const gate = (dry) => { try { return run('ssh', ['-o', 'BatchMode=yes', HOST, 'docker', 'exec', CONTAINER, 'node', `${rdir}/bc-close.js`, todo, '--bucket', a.bucket, ...(dry ? ['--dry'] : [])]); } catch (e) { return e.message; } };
  const verdict = gate(true);
  // A re-run after the ticket closed is finished work, not a failure.
  if (/already completed: true/i.test(verdict)) { console.log('4/4 already closed', `https://app.basecamp.com/3945211/buckets/${a.bucket}/todos/${todo}`); return; }
  // In a dry run nothing was attached, so the gate counting too few PDFs is the expected answer.
  if (a.dry) { console.log('4/4 [dry] gate reached:', (verdict.match(/REFUSED: [^\n]*|ALLOWED[^\n]*|would close[^\n]*/i) || ['(no verdict line)'])[0]); return; }
  if (/REFUSED|failed:/.test(verdict)) throw new Error('the close gate refused, so the ticket stays open:\n' + verdict.slice(-800));
  const closed = gate(false);
  if (/REFUSED|failed:/.test(closed)) throw new Error('the close gate refused:\n' + closed.slice(-800));
  console.log('4/4 closed', `https://app.basecamp.com/3945211/buckets/${a.bucket}/todos/${todo}`);
}

/** Remove the staging copies on the host and in the container (they hold the ticket's pages). */
function cleanup(code) {
  const rdir = `/tmp/closeout-${String(code).replace('.', '-')}`;
  if (!/^\/tmp\/closeout-[A-Z]{1,4}\d+(-\d+)?$/.test(rdir)) return;
  spawnSync('ssh', ['-o', 'BatchMode=yes', HOST, `rm -rf ${rdir}; docker exec ${CONTAINER} rm -rf ${rdir}`], { timeout: 60000, windowsHide: true });
}

if (require.main === module) {
  const code = (() => { const i = process.argv.indexOf('--code'); return i >= 0 ? process.argv[i + 1] : ''; })();
  main().then(() => cleanup(code), (e) => { cleanup(code); console.error('FAILED', e.message); process.exit(1); });
}
module.exports = { parseArgs, TAKEAWAY_JS };
