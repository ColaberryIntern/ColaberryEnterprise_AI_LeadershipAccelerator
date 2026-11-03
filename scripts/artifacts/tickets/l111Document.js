/**
 * l111Document — the proof register, the splice, and the self-check for DOC 11.
 *
 * THE HANDBOOK IS HAND-WRITTEN AND ITS PROOF REGISTER IS GENERATED. That split is deliberate.
 * Twenty-three sections of plain-English architecture explanation are prose and should be
 * written by someone; the claim that a capability is *proven* is data, because that is the thing
 * that silently rots the moment a test is deleted or an airing finally happens.
 *
 * So the register is rendered from `l111Data.CLAIMS` and spliced between two markers in the
 * document, and `selfCheck` refuses if what is in the file differs from what the data renders.
 * A hand-edit to the register is therefore a build failure, not a quiet divergence.
 *
 * Check 5 is the one with teeth: UNPROVEN rows must name what would settle them and must NOT
 * name a file, because a filename sitting beside an unproven claim is exactly how an unproven
 * claim gets read as a proven one.
 */
const fs = require('fs');
const path = require('path');
const D = require('./l111Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');
const ABS = path.join(ROOT, D.META.file);

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function readHandbook() {
  if (!fs.existsSync(ABS)) throw new Error(`DOC 11 missing: ${D.META.file}`);
  return fs.readFileSync(ABS, 'utf8');
}

function hasHeading(body, match) {
  return body.split('\n').some((ln) => /^#{1,6}\s/.test(ln) && ln.includes(match));
}

function headingLine(body, match) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i]) && lines[i].includes(match)) return i;
  }
  return -1;
}

/** The register, as Markdown. The single source of every proof claim in the handbook. */
function register() {
  const scale = Object.entries(D.PROOFS)
    .sort((a, b) => b[1].rank - a[1].rank)
    .map(([k, v]) => `| **${v.label}** | ${D.TOTALS.by[k]} | ${cell(v.means)} |`)
    .join('\n');

  const rows = D.CLAIMS
    .slice()
    .sort((a, b) => D.PROOFS[b.proof].rank - D.PROOFS[a.proof].rank || a.id - b.id)
    .map((c) => {
      const anchor = c.proof === 'PRODUCTION' ? `Airing of ${c.when}`
        : (c.where ? `\`${cell(c.where)}\`` : '— nothing to open —');
      const tail = c.settledBy ? ` **Settled by:** ${cell(c.settledBy)}` : '';
      return `| ${c.id} | ${cell(c.claim)} | **${D.PROOFS[c.proof].label}** | ${anchor} | `
        + `${cell(c.evidence)}${tail} |`;
    })
    .join('\n');

  return `${D.MARKERS.begin}

> Generated from \`scripts/artifacts/tickets/l111Data.js\`. **Do not hand-edit this section** —
> change the data module and re-run \`node scripts/artifacts/buildL111Artifacts.js\`. The build
> refuses if the table below and the data module disagree.

L11.1's acceptance criterion is that **every capability claim states whether it is proven by test
or in production.** Two levels are not enough to say that honestly here, and the reason is
measured: DOC 15 counts **1,208 tests across 73 suites, 99.6% of them unit tests**, and catalogs
**four defects a green suite did not catch** — every one a complete, well-tested unit that nothing
called. A unit test mocks its caller, so a missing caller is invisible to it.

| Level | Claims | What it means |
|---|---|---|
${scale}

**${D.TOTALS.by.PRODUCTION} of ${D.TOTALS.claims} claims have actually run in a real airing.
${D.TOTALS.neverRun} have never run at all** — ${D.TOTALS.by.WIRED} wired but unexercised, and
${D.TOTALS.unproven} with no test and no airing.

| # | Capability claim | Proof | Anchor | Evidence |
|---|---|---|---|---|
${rows}

${D.MARKERS.end}`;
}

/** Replace the register section in a handbook body. */
function splice(body) {
  const i = body.indexOf(D.MARKERS.begin);
  const j = body.indexOf(D.MARKERS.end);
  if (i === -1 || j === -1) {
    throw new Error(`DOC 11 is missing the register markers (${D.MARKERS.begin})`);
  }
  if (j < i) throw new Error('DOC 11 register markers are out of order');
  return body.slice(0, i) + register() + body.slice(j + D.MARKERS.end.length);
}

function selfCheck() {
  // 1. CLAIM IDS ARE 1..N, EACH ONCE. A duplicated id makes the register ambiguous about which
  //    row a reader is looking at, and a gap usually means a claim was deleted rather than
  //    downgraded — which is the one edit this register exists to make visible.
  const ids = D.CLAIMS.map((c) => c.id);
  for (let n = 1; n <= D.CLAIMS.length; n += 1) {
    const hits = ids.filter((x) => x === n).length;
    if (hits !== 1) throw new Error(`claim id ${n} appears ${hits} times, expected once`);
  }

  // 2. EVERY CLAIM CARRIES A DEFINED PROOF LEVEL AND REAL EVIDENCE.
  D.CLAIMS.forEach((c) => {
    if (!D.PROOFS[c.proof]) throw new Error(`claim ${c.id} has undefined proof level "${c.proof}"`);
    if (!c.claim || !c.claim.trim()) throw new Error(`claim ${c.id} has no claim text`);
    if (!c.evidence || !c.evidence.trim()) throw new Error(`claim ${c.id} has no evidence`);
  });

  // 3. A PRODUCTION CLAIM NEEDS A DATE. Without one it is a memory, not evidence.
  D.CLAIMS.filter((c) => c.proof === 'PRODUCTION').forEach((c) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.when || '')) {
      throw new Error(`claim ${c.id} is PRODUCTION but names no airing date (when: ${c.when})`);
    }
  });

  // 4. A TEST OR WIRED CLAIM NEEDS A FILE. "Tested" with nothing to open is the claim this
  //    register exists to stop.
  D.CLAIMS.filter((c) => c.proof === 'TEST' || c.proof === 'WIRED').forEach((c) => {
    if (!c.where || !c.where.trim()) {
      throw new Error(`claim ${c.id} is ${c.proof} but names no file`);
    }
  });

  // 5. THE ONE WITH TEETH. An unproven claim must say what would settle it, and must NOT name a
  //    file — a filename beside an unproven claim is how it gets read as a proven one.
  D.CLAIMS.forEach((c) => {
    if (c.proof === 'UNPROVEN') {
      if (!c.settledBy || !c.settledBy.trim()) {
        throw new Error(`claim ${c.id} is UNPROVEN with no settledBy`);
      }
      if (c.where) {
        throw new Error(`claim ${c.id} is UNPROVEN but names a file (${c.where}); that reads as `
          + 'proof. Change the level or drop the file.');
      }
    } else if (c.settledBy) {
      throw new Error(`claim ${c.id} is ${c.proof} and carries settledBy; it is only meaningful `
        + 'on a claim nothing has proven');
    }
  });

  const body = readHandbook();

  // 6. ALL 23 REQUIRED SECTIONS, AS NAVIGABLE HEADINGS.
  const missing = D.SECTIONS.filter((s) => !hasHeading(body, s));
  if (missing.length) {
    throw new Error(`DOC 11 is missing ${missing.length} required section(s): ${missing.join('; ')}`);
  }

  // 7. PLAIN ENGLISH FIRST, THEN TECHNICAL DEPTH — the bootstrap says so explicitly, and the
  //    ordering is the part a reader actually depends on.
  const plain = headingLine(body, D.PLAIN_ENGLISH_HEADING);
  if (plain === -1) throw new Error(`DOC 11 has no "${D.PLAIN_ENGLISH_HEADING}" section`);
  const firstTechnical = Math.min(...D.SECTIONS.map((s) => headingLine(body, s)));
  if (plain > firstTechnical) {
    throw new Error('DOC 11 puts technical depth before plain English; the bootstrap requires '
      + 'the system explained in plain English first');
  }

  // 8. THE REGISTER IN THE FILE MUST BE WHAT THE DATA RENDERS. A hand-edit is a build failure,
  //    not a quiet divergence.
  const i = body.indexOf(D.MARKERS.begin);
  const j = body.indexOf(D.MARKERS.end);
  if (i === -1 || j === -1) throw new Error('DOC 11 is missing the register markers');
  const inFile = body.slice(i, j + D.MARKERS.end.length);
  if (inFile !== register()) {
    throw new Error('DOC 11\'s proof register does not match the data module. Re-run the builder; '
      + 'if you edited the table by hand, move the change into l111Data.js.');
  }

  // 9. NAVIGABILITY, the same contract the other nine documents carry.
  if (!body.includes('DOC 00')) throw new Error('DOC 11 never points back at DOC 00');

  return true;
}

function build() {
  const scale = Object.entries(D.PROOFS)
    .sort((a, b) => b[1].rank - a[1].rank)
    .map(([k, v]) => `<tr><td class="lv">${esc(v.label)}</td><td class="num">${D.TOTALS.by[k]}</td>`
      + `<td class="note">${esc(v.means)}</td></tr>`)
    .join('\n');

  const rows = D.CLAIMS
    .slice()
    .sort((a, b) => D.PROOFS[b.proof].rank - D.PROOFS[a.proof].rank || a.id - b.id)
    .map((c) => {
      const anchor = c.proof === 'PRODUCTION' ? `Airing of ${c.when}`
        : (c.where || '— nothing to open —');
      const tail = c.settledBy ? ` <em>Settled by: ${esc(c.settledBy)}</em>` : '';
      return `<tr>
        <td class="num">${c.id}</td>
        <td><strong>${esc(c.claim)}</strong></td>
        <td class="lv">${esc(D.PROOFS[c.proof].label)}</td>
        <td class="file">${esc(anchor)}</td>
        <td class="note">${esc(c.evidence)}${tail}</td>
      </tr>`;
    })
    .join('\n');

  const body = `
<h1>DOC 11 — capability proof register</h1>
<p class="sub">${esc(D.META.ticket)} · ${esc(D.META.built)} · generated from
<code>l111Data.js</code> · evidence base: ${esc(D.META.evidenceBase)}</p>

<p><strong>${D.TOTALS.by.PRODUCTION} of ${D.TOTALS.claims} capability claims have actually run in
a real airing. ${D.TOTALS.neverRun} have never run at all.</strong></p>

<table>
  <thead><tr><th>Level</th><th>Claims</th><th>What it means</th></tr></thead>
  <tbody>${scale}</tbody>
</table>

<h2>The register</h2>
<table>
  <thead><tr><th>#</th><th>Capability claim</th><th>Proof</th><th>Anchor</th><th>Evidence</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
`;

  return htmlDoc({
    title: 'DOC 11 — capability proof register',
    css: `${baseCss()}
      td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
      td.lv { font-weight: 600; white-space: nowrap; font-size: 10px; }
      td.file { font-size: 9px; font-family: ui-monospace, monospace; }
      td.note { font-size: 9.5px; line-height: 1.35; }
      .sub { color: ${TOKENS.MUTED}; font-size: 10px; line-height: 1.4; }`,
    body,
  });
}

module.exports = { register, splice, selfCheck, build };
