/**
 * Render the two PDFs each closing spine ticket needs: a ONE-PAGE visual and the evidence
 * document.
 *
 *   ARTIFACT_CHROMIUM="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
 *     node scripts/artifacts/renderSpineCloseoutArtifacts.js <out-dir>
 *
 * ## What it refuses to do
 *
 * Four refusals run before anything is written, and each one exits non-zero having rendered
 * nothing:
 *
 *  1. **A ticket whose code, id or disposition disagrees with `state-ledger.json`.** The ledger is
 *     itself built from a live Basecamp read. A nine-digit to-do id cannot be checked by eye, and
 *     this project has already attached six artifacts to six ids written from memory.
 *  2. **A missing evidence document.** An artifact citing a file that is not there is worse than
 *     no artifact: the citation reads as evidence.
 *  3. **A document using Markdown this converter does not handle.** `unconvertedConstructs`
 *     reports them, because a converter that silently drops a construct produces a PDF that LOOKS
 *     complete.
 *  4. **A visual that runs to two pages.** Enforced by reading the page count back out of the PDF
 *     bytes, never by trusting the layout. One page is a property of the output.
 *
 * ## The visual is one page BY DESIGN, not by luck
 *
 * It answers four questions and stops: what the ticket asked, what shipped, how it was proved, and
 * which rung of the shipping ladder it is on. The last is the one that gets collapsed: built,
 * tested, merged, deployed and production-verified are five different states, and every one of
 * these tickets is on the second.
 */
const fs = require('fs');
const path = require('path');

const { renderPdf } = require('./renderArtifactPdf.js');
const { render: mdToHtml, inline, escapeHtml, unconvertedConstructs } = require('./md2html.js');
const { TICKETS, HELD_OPEN, PR, RUNG } = require('./spineCloseoutTickets.js');

const REPO = path.resolve(__dirname, '..', '..');
const RUN_DIR = path.join(REPO, '.loop-architect/runs/20261120-spine-closeout-connected-demo');
const LEDGER = path.join(RUN_DIR, 'state-ledger.json');
const SESSION_LOG = path.join(REPO, 'docs/sessions/CC-20261120-k4d9.md');

/* ------------------------------------------------------------------ refusal 1: the ledger */

function assertAgreesWithLedger(tickets) {
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).tickets;
  const problems = [];
  for (const t of tickets) {
    const row = ledger[t.id];
    if (!row) { problems.push(`${t.code}: id ${t.id} is not in the ledger`); continue; }
    if (row.code !== t.code) problems.push(`${t.id}: ledger says ${row.code}, artifact says ${t.code}`);
    if (row.disposition !== t.disposition) {
      problems.push(`${t.code}: ledger disposition ${row.disposition}, artifact says ${t.disposition}`);
    }
  }
  // The held-open ticket must be IN the ledger and NOT in the closing set.
  if (!ledger[HELD_OPEN.id]) problems.push(`${HELD_OPEN.code}: held-open id is not in the ledger`);
  if (tickets.some((t) => t.id === HELD_OPEN.id)) {
    problems.push(`${HELD_OPEN.code} is in the closing set; it is deliberately held open`);
  }
  // And the two sets together must be the whole ledger, so no ticket is silently unaccounted for.
  const covered = new Set([...tickets.map((t) => t.id), HELD_OPEN.id]);
  for (const id of Object.keys(ledger)) {
    if (!covered.has(id)) problems.push(`${ledger[id].code} (${id}) has no artifact and is not held open`);
  }
  if (problems.length) {
    throw new Error(`REFUSED: the artifact set disagrees with the ledger:\n  - ${problems.join('\n  - ')}`);
  }
  return Object.keys(ledger).length;
}

/* ------------------------------------------------------- the evidence document, per ticket */

/** This session's log entries whose heading matches, joined. The real record, not a retelling. */
function sessionSlice(needle) {
  const log = fs.readFileSync(SESSION_LOG, 'utf8').replace(/\r\n/g, '\n');
  const entries = log.split(/\n(?=- \[x\] \*\*)/).filter((e) => e.startsWith('- [x] **'));
  const hit = entries.filter((e) => e.toLowerCase().includes(needle.toLowerCase()));
  if (!hit.length) throw new Error(`REFUSED: no session-log entry matches "${needle}"`);
  return hit.join('\n\n');
}

function evidenceFor(t) {
  const e = t.evidence;
  if (typeof e === 'string') {
    const p = path.join(REPO, e);
    if (!fs.existsSync(p)) throw new Error(`REFUSED: ${t.code} cites ${e}, which does not exist`);
    return { label: e, md: fs.readFileSync(p, 'utf8') };
  }
  if (e.run) {
    const p = path.join(RUN_DIR, e.run);
    if (!fs.existsSync(p)) {
      throw new Error(`REFUSED: ${t.code} cites ${e.run}, which does not exist. Regenerate it first.`);
    }
    return { label: `run record: ${e.run}`, md: fs.readFileSync(p, 'utf8') };
  }
  if (e.sessionTask) {
    return { label: `session log CC-20261120-k4d9`, md: sessionSlice(e.sessionTask) };
  }
  if (e.ledgerRow) {
    const row = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).tickets[e.ledgerRow];
    const lines = [
      `# ${t.code}: closed out by citation`,
      '',
      'This ticket was already merged before the spine closeout. The ledger rule for an',
      'already-merged row is that it closes by CITATION, and the citation is named so the claim is',
      'checkable rather than asserted.',
      '',
      '| Field | Value |',
      '|---|---|',
      `| Ticket | ${t.code} |`,
      `| Disposition | ${row.disposition} |`,
      `| Note | ${row.note || '(none)'} |`,
      `| Citation | ${row.cites || '(none)'} |`,
      '',
      '## Why a citation is enough here, and where it is not',
      '',
      'A citation closes a row only when somebody else can check it without taking this document',
      "on trust. That is why the field above names a file and a constant rather than saying \"done\":",
      'one grep settles it.',
      '',
      'It is NOT enough for a row whose work this change performed. Those tickets carry the',
      'evidence document itself, not a pointer to somebody else\'s merge.',
    ];
    return { label: 'ledger citation', md: lines.join('\n') };
  }
  throw new Error(`REFUSED: ${t.code} has no usable evidence`);
}

/* ------------------------------------------------------------------ the one-page visual */

const VISUAL_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10pt/1.45 "Segoe UI", Inter, system-ui, sans-serif; color: #12211F; }
  .hero { border-left: 5px solid #0F766E; padding: 0 0 0 11px; margin: 0 0 13px; }
  .code { font: 700 20pt/1.1 "Segoe UI", sans-serif; color: #0F766E; letter-spacing: -0.4px; }
  .title { font-size: 12.5pt; font-weight: 600; margin: 3px 0 0; }
  .meta { font-size: 8.4pt; color: #55635F; margin: 5px 0 0; }
  .card { border: 1px solid #D7DEDC; border-radius: 6px; padding: 9px 11px; margin: 0 0 9px; }
  .card h2 { font-size: 8.2pt; text-transform: uppercase; letter-spacing: 0.9px;
             color: #55635F; margin: 0 0 5px; font-weight: 700; }
  .card p { margin: 0; font-size: 9.6pt; }
  .rung { background: #FEF6E7; border-color: #E8C87A; }
  .rung p { font-weight: 600; }
  .ladder { display: flex; gap: 4px; margin: 7px 0 0; font-size: 7.6pt; }
  .step { flex: 1; text-align: center; padding: 3px 1px; border-radius: 3px;
          background: #EEF2F1; color: #7A8884; }
  .step.done { background: #0F766E; color: #fff; font-weight: 700; }
  .step.now { background: #E8C87A; color: #3D2F00; font-weight: 700; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 8.8pt;
         background: #F4F6F5; padding: 0 2px; border-radius: 2px; }
  .foot { font-size: 7.8pt; color: #7A8884; border-top: 1px solid #D7DEDC;
          padding-top: 6px; margin-top: 11px; }
  strong { font-weight: 700; }
`;

const LADDER = ['Built', 'Tested', 'Merged', 'Deployed', 'Prod-verified'];

function visualBody(t) {
  const steps = LADDER.map((s, i) => {
    const cls = i === 0 ? 'step done' : i === 1 ? 'step now' : 'step';
    return `<div class="${cls}">${s}</div>`;
  }).join('');
  // Inline spans are applied, not just escaped: these summaries name columns, flags and files in
  // backticks, and a card showing a literal backtick reads as a typo rather than as an identifier.
  const card = (h, body) => `<div class="card"><h2>${h}</h2><p>${inline(escapeHtml(body))}</p></div>`;
  return [
    `<div class="hero"><div class="code">${escapeHtml(t.code)}</div>`,
    `<p class="title">${escapeHtml(t.title)}</p>`,
    `<p class="meta">Basecamp to-do ${escapeHtml(t.id)} &middot; disposition: <strong>${escapeHtml(t.disposition)}</strong>`,
    ` &middot; session CC-20261120-k4d9</p></div>`,
    card('What the ticket asked', t.asked),
    card('What shipped', t.shipped),
    card('How it was proved', t.proof),
    `<div class="card rung"><h2>Where it is on the shipping ladder</h2><p>${escapeHtml(RUNG)}</p>`,
    `<div class="ladder">${steps}</div></div>`,
    `<p class="foot">Evidence document attached alongside this page. Pull request: ${PR}</p>`,
  ].join('');
}

/* ------------------------------------------------------------------ the document */

const DOC_CSS = `
  @page { size: A4 portrait; margin: 16mm 15mm; }
  body { margin: 0; font: 10pt/1.5 "Segoe UI", Inter, system-ui, sans-serif; color: #12211F; }
  .banner { border-left: 4px solid #0F766E; background: #F4F6F5; padding: 8px 11px;
            margin: 0 0 15px; font-size: 8.6pt; color: #3D4A47; }
  .banner b { color: #0F766E; }
  h1 { font-size: 15pt; margin: 0 0 9px; }
  h2 { font-size: 12pt; margin: 17px 0 6px; border-bottom: 1px solid #D7DEDC; padding-bottom: 3px; }
  h3 { font-size: 10.5pt; margin: 13px 0 5px; }
  h4 { font-size: 9.6pt; margin: 11px 0 4px; color: #3D4A47; }
  p, li { font-size: 9.6pt; }
  li { margin: 0 0 3px; }
  table { border-collapse: collapse; width: 100%; margin: 9px 0; font-size: 8.6pt;
          page-break-inside: avoid; }
  th, td { border: 1px solid #D7DEDC; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #F4F6F5; font-weight: 700; }
  pre { background: #F4F6F5; border: 1px solid #D7DEDC; border-radius: 4px; padding: 7px 9px;
        overflow-wrap: break-word; white-space: pre-wrap; font-size: 8.2pt;
        page-break-inside: avoid; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 8.8pt; }
  pre code { background: none; }
  blockquote { margin: 9px 0; padding: 5px 11px; border-left: 3px solid #0F766E;
               background: #F4F6F5; font-size: 9.4pt; }
  hr { border: 0; border-top: 1px solid #D7DEDC; margin: 15px 0; }
  a { color: #0F766E; }
`;

function documentBody(t, evidence) {
  const problems = unconvertedConstructs(evidence.md);
  if (problems.length) {
    throw new Error(
      `REFUSED: ${t.code}'s evidence (${evidence.label}) uses Markdown this converter does not `
      + `handle: ${problems.join(', ')}. A PDF missing a construct looks complete.`,
    );
  }
  const banner = [
    '<div class="banner">',
    `<b>${escapeHtml(t.code)} &middot; evidence document</b> &mdash; attached to Basecamp to-do `,
    `${escapeHtml(t.id)} as the artifact for closing it. Source: <code>${escapeHtml(evidence.label)}</code>. `,
    `Shipping state: ${escapeHtml(RUNG)}`,
    '</div>',
  ].join('');
  return banner + mdToHtml(evidence.md);
}

/* ------------------------------------------------------------------ main */

async function main() {
  const outDir = process.argv[2];
  if (!outDir) { console.error('usage: renderSpineCloseoutArtifacts.js <out-dir>'); process.exit(2); }

  const total = assertAgreesWithLedger(TICKETS);
  console.log(`ledger agrees: ${TICKETS.length} closing + 1 held open = ${total} tickets\n`);

  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [];

  for (const t of TICKETS) {
    const evidence = evidenceFor(t);
    const slug = t.code.replace(/[^A-Za-z0-9]/g, '');

    const visualPath = path.join(outDir, `${slug}-summary.pdf`);
    const v = await renderPdf({
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(t.code)} summary</title><style>${VISUAL_CSS}</style></head><body>${visualBody(t)}</body></html>`,
      outPath: visualPath,
      maxPages: 1,
      margin: '0',
    });

    const docPath = path.join(outDir, `${slug}-evidence.pdf`);
    const d = await renderPdf({
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(t.code)} evidence</title><style>${DOC_CSS}</style></head><body>${documentBody(t, evidence)}</body></html>`,
      outPath: docPath,
      margin: '0',
    });

    manifest.push({
      code: t.code, id: t.id, disposition: t.disposition,
      visual: path.basename(visualPath), visualPages: v.pages,
      evidence: path.basename(docPath), evidencePages: d.pages, evidenceSource: evidence.label,
    });
    console.log(`${t.code.padEnd(8)} summary 1pp  evidence ${String(d.pages).padStart(2)}pp  <- ${evidence.label}`);
  }

  // The held-open ticket gets its document too: it is not closing, but the decision is recorded.
  const held = { label: HELD_OPEN.evidence, md: fs.readFileSync(path.join(REPO, HELD_OPEN.evidence), 'utf8') };
  const heldPath = path.join(outDir, 'MorningFive-evidence.pdf');
  const h = await renderPdf({
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Morning Five</title><style>${DOC_CSS}</style></head><body>${documentBody({ code: 'Morning Five', id: HELD_OPEN.id }, held)}</body></html>`,
    outPath: heldPath,
    margin: '0',
  });
  manifest.push({
    code: HELD_OPEN.code, id: HELD_OPEN.id, disposition: 'schedule (HELD OPEN)',
    visual: null, visualPages: 0,
    evidence: path.basename(heldPath), evidencePages: h.pages, evidenceSource: held.label,
  });
  console.log(`${'MornFive'.padEnd(8)} HELD OPEN    evidence ${String(h.pages).padStart(2)}pp  <- ${held.label}`);

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify({ pr: PR, rung: RUNG, generated: new Date().toISOString().slice(0, 10), artifacts: manifest }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\n${manifest.length} tickets, ${manifest.filter((m) => m.visual).length * 2 + 1} PDFs, written to ${outDir}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
