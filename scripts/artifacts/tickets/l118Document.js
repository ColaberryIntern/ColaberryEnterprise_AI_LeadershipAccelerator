/**
 * l118Document — the self-check, the ledger PDF and the committed index for L11.8.
 *
 * THE SELF-CHECK IS THE POINT OF THIS FILE. L11.8's acceptance criterion is a count of documents
 * and a promise that unbuilt things are named rather than omitted, and neither is provable by
 * reading the documents approvingly. So every assertion below runs from the requirement toward
 * the file: `l118Data.requires` is transcribed from the bootstrap, and each entry has to be
 * findable in the document that claims to satisfy it.
 *
 * Check 4 is the load-bearing one, and check 6 is the one that would have been wrong if it had
 * been written as a word list — see its comment.
 */
const fs = require('fs');
const path = require('path');
const D = require('./l118Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * DOC 10's row, looked up rather than hardcoded. It is the one row with a history worth telling:
 * it was the program's only document with no ticket, and the prose below reports both the finding
 * and its closure out of the row itself, so neither can drift from the ledger.
 */
const DOC10 = D.LEDGER.find((d) => d.id === 10);
if (!DOC10) throw new Error('l118Document: DOC 10 is missing from the ledger');

/** Read one of the nine, from disk, every time. A cached read could not catch an edit. */
function readDoc(d) {
  const rel = `${D.META.dir}/${d.slug}.md`;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`DOC ${String(d.id).padStart(2, '0')} missing: ${rel}`);
  return { rel, body: fs.readFileSync(abs, 'utf8') };
}

/** A heading requirement is satisfied only by a heading, not by a mention in prose. */
function hasHeading(body, match) {
  return body.split('\n').some((ln) => /^#{1,6}\s/.test(ln) && ln.includes(match));
}

/**
 * Text requirements match case-insensitively, and that is deliberate rather than lax.
 *
 * The first run of this check failed on `one-thumb`, which DOC 04 carries as "One-thumb
 * interaction" at the head of a table cell. The requirement is that the bootstrap's concept be
 * NAMED in the document; prose capitalization is not part of the contract, and the alternative —
 * editing the requirement string to match the document's casing — would make the contract a copy
 * of the thing it checks, which is the circularity this whole module is built to avoid.
 *
 * Identifiers still match exactly in practice (`replay_ready` contains no capitals to lose), so
 * nothing in the lifecycle or access-mode contract is weakened by this. Whether each entry is
 * still load-bearing is settled by the mutation record, not by this comment.
 */
function hasText(body, match) {
  return body.toLowerCase().includes(match.toLowerCase());
}

function selfCheck() {
  const ids = D.LEDGER.map((d) => d.id);

  // 1. EIGHTEEN DOCUMENTS, 0 THROUGH 17, EACH EXACTLY ONCE.
  for (let i = 0; i <= 17; i += 1) {
    const n = ids.filter((x) => x === i).length;
    if (n !== 1) throw new Error(`DOC ${i} appears ${n} times in the ledger, expected once`);
  }
  if (ids.length !== 18) throw new Error(`ledger holds ${ids.length} documents, expected 18`);

  // 2. THE LEDGER'S STATE MUST MATCH THE DISK. A row saying WRITTEN with no file on disk is the
  //    exact failure this whole module exists to prevent.
  D.LEDGER.forEach((d) => {
    if (d.state === 'WRITTEN') {
      if (!d.file) throw new Error(`DOC ${d.id} is WRITTEN with no file named`);
      if (!fs.existsSync(path.join(ROOT, d.file))) {
        throw new Error(`DOC ${d.id} is WRITTEN but ${d.file} is not on disk`);
      }
    } else if (d.file) {
      throw new Error(`DOC ${d.id} is ${d.state} but names a file: ${d.file}`);
    }
  });

  // 3. THE CONTRACT MUST NOT HAVE SHRUNK since it was transcribed from the bootstrap.
  D.WRITTEN.forEach((d) => {
    if (d.requires.length !== d.requiredCount) {
      throw new Error(`DOC ${d.id}: ${d.requires.length} requirements, ${d.requiredCount} declared`);
    }
  });

  // 4. THE LOAD-BEARING CHECK. Every requirement the bootstrap names has to be findable in the
  //    document that claims to satisfy it — headings as headings, contract values as text.
  const missing = [];
  D.WRITTEN.forEach((d) => {
    const { rel, body } = readDoc(d);
    d.requires.forEach((r) => {
      const ok = r.kind === 'heading' ? hasHeading(body, r.match) : hasText(body, r.match);
      if (!ok) missing.push(`${rel}: ${r.kind} "${r.match}"`);
    });
  });
  if (missing.length) {
    throw new Error(`${missing.length} bootstrap requirement(s) not found in the documents:\n  `
      + missing.join('\n  '));
  }

  // 5. THE TICKET'S OWN CRITERION: unbuilt things named explicitly rather than omitted. Each of
  //    the nine declares the section that does it, and that section has to exist.
  D.WRITTEN.forEach((d) => {
    const { rel, body } = readDoc(d);
    if (!d.gapsHeading) throw new Error(`DOC ${d.id} declares no gapsHeading`);
    if (!hasHeading(body, d.gapsHeading)) {
      throw new Error(`DOC ${d.id} (${rel}) has no "${d.gapsHeading}" section — the ticket's `
        + 'criterion is that unbuilt things are named, not omitted');
    }
  });

  // 6. A COVERAGE GAP MUST SAY WHICH REQUIREMENT IT LEAVES UNCOVERED.
  //    Written as an explicit `gapSource` field rather than by grepping `note` for words like
  //    "no ticket" or "§17". A hand-written word list over prose passes any row that happens to
  //    use the vocabulary and fails one that says the right thing in other words — which is how
  //    the equivalent check on L0.4 was wrong the first time it was written.
  D.LEDGER.forEach((d) => {
    if (!d.ticket && !d.gapSource) {
      throw new Error(`DOC ${d.id} has no ticket and no gapSource naming what requires it`);
    }
    // DOC 10 WAS this program's coverage gap, and that is history rather than a current state.
    // The guard below only fires on a row that still HAS a `wasGap` record, so deleting the
    // record outright would pass silently and erase the finding. Pinning the one row that is
    // known to have been a gap is what makes the history undeletable.
    if (d.id === 10 && !d.wasGap) {
      throw new Error('DOC 10 was this program\'s only document with no ticket, found 2026-11-03 '
        + 'and closed by L0.5. Its wasGap record is the evidence that happened and must not be '
        + 'removed just because the row now looks clean.');
    }
    // A gap that was closed must say WHEN it was found, when it was closed and by what. Without
    // this, `wasGap` can be deleted in one edit and the ledger silently reports a program that
    // never had a coverage gap - the exact revision this row exists to prevent.
    if (d.wasGap) {
      ['foundOn', 'closedOn', 'closedBy', 'source', 'howFound'].forEach((k) => {
        if (!d.wasGap[k]) throw new Error(`DOC ${d.id} was a gap but its record has no ${k}`);
      });
      if (!d.ticket) {
        throw new Error(`DOC ${d.id} carries a closed-gap record but still has no ticket`);
      }
      if (!new RegExp(`\\b${d.wasGap.closedBy}\\b`).test(d.note)) {
        throw new Error(`DOC ${d.id} was closed by ${d.wasGap.closedBy}, which its note does not name`);
      }
    }
    if (d.ticket && d.gapSource) {
      throw new Error(`DOC ${d.id} has ticket ${d.ticket} and a gapSource; gapSource is only `
        + 'meaningful on a document nothing is tracking');
    }
  });

  // 7. THE NINE MUST BE NAVIGABLE FROM DOC 00, which is the document every AI-executable todo
  //    links to. A set of documents that do not reference their own entry point is a pile.
  D.WRITTEN.filter((d) => d.id !== 0).forEach((d) => {
    const { rel, body } = readDoc(d);
    if (!body.includes('DOC 00')) throw new Error(`${rel} never points back at DOC 00`);
  });

  // 8b. THE DISK MUST NOT HOLD A DOCUMENT THE LEDGER HAS NEVER HEARD OF.
  //     Added 2026-11-03 while landing DOC 11, which exposed the gap: checks 2 and 4 both run
  //     ledger -> disk, so a new document could appear in this folder and the ledger would stay
  //     silently stale. An index that is only correct about the files it already knew about is
  //     the drift this module exists to prevent, so the check now runs in both directions.
  const dir = path.join(ROOT, D.META.dir);
  const onDisk = fs.readdirSync(dir).filter((f) => /^DOC_\d\d.*\.md$/.test(f));
  const ledgered = new Set(D.LEDGER.filter((d) => d.file).map((d) => path.basename(d.file)));
  const unledgered = onDisk.filter((f) => !ledgered.has(f));
  if (unledgered.length) {
    throw new Error(`${D.META.dir} holds document(s) the ledger does not know about: `
      + `${unledgered.join(', ')}. Add a LEDGER row, or the index is wrong the moment it is read.`);
  }

  // 9. AND DOC 00'S INDEX MUST NAME ALL EIGHTEEN, including the ones that do not exist yet —
  //    that is the half of the index that tells a future session what is missing.
  const brief = readDoc(D.WRITTEN.find((d) => d.id === 0)).body;
  const absent = D.LEDGER.filter((d) => !brief.includes(`**${String(d.id).padStart(2, '0')}**`));
  if (absent.length) {
    throw new Error(`DOC 00's index omits: ${absent.map((d) => d.id).join(', ')}`);
  }

  return true;
}

const ST = {
  WRITTEN: { color: TOKENS.SEV.ok, label: 'In the repo' },
  NOT_WRITTEN: { color: TOKENS.SEV.watch, label: 'Not written' },
  BLOCKED: { color: TOKENS.MUTED, label: 'Blocked' },
};

function build() {
  const rows = D.LEDGER.map((d) => {
    const s = ST[d.state];
    return `<tr>
      <td class="num">${String(d.id).padStart(2, '0')}</td>
      <td><strong>${esc(d.title)}</strong></td>
      <td>${d.ticket ? esc(d.ticket) : '<span class="gap">none</span>'}</td>
      <td class="st" style="color:${s.color}">${esc(s.label)}</td>
      <td class="file">${d.file ? `<code>${esc(d.file)}</code>` : '—'}</td>
      <td class="note">${esc(d.note)}</td>
    </tr>`;
  }).join('\n');

  const contract = D.WRITTEN.map((d) => `<tr>
      <td class="num">${String(d.id).padStart(2, '0')}</td>
      <td>${esc(d.title)}</td>
      <td class="num">${d.requires.length}</td>
      <td class="note">${esc(d.source)}</td>
      <td class="note">${esc(d.gapsHeading)}</td>
    </tr>`).join('\n');

  const body = `
<h1>Colaberry Live — the eighteen required project documents</h1>
<p class="sub">L11.8 · built ${esc(D.META.built)} · generated from
<code>scripts/artifacts/tickets/l118Data.js</code></p>

<p><strong>${D.TOTALS.written} of ${D.TOTALS.required} written</strong>, ${D.TOTALS.thisPass} of
them in this pass. ${D.TOTALS.noTicket === 0
    ? `${D.TOTALS.gapsClosed} required document had no Basecamp ticket at all, and now has one.`
    : `${D.TOTALS.noTicket} required document has no Basecamp ticket at all.`}</p>

<table>
  <thead><tr><th>DOC</th><th>Title</th><th>Ticket</th><th>State</th><th>File</th><th>Note</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<h2>The coverage contract for the nine written here</h2>
<p class="sub">Each requirement is transcribed from the bootstrap and checked against the file on
disk. The check runs requirement&nbsp;&rarr;&nbsp;file, never the reverse.</p>
<table>
  <thead><tr><th>DOC</th><th>Title</th><th>Reqs</th><th>Transcribed from</th><th>Names its gaps in</th></tr></thead>
  <tbody>${contract}</tbody>
</table>
<p class="sub">${D.TOTALS.requirements} requirements in all, ${D.TOTALS.headings} of them required
to be navigable sections.</p>
`;

  return htmlDoc({
    title: 'Colaberry Live — required project documents',
    css: `${baseCss()}
      td.num, th { text-align: left; }
      td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
      td.file code { font-size: 10px; }
      td.note { font-size: 10px; line-height: 1.35; }
      td.st { font-weight: 600; white-space: nowrap; }
      .gap { color: #b3261e; font-weight: 700; }
      .sub { color: #6b7280; font-size: 11px; }`,
    body,
  });
}

/** The committed index. Regenerated, never hand-edited. */
function markdown() {
  const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');
  const pad = (n) => String(n).padStart(2, '0');

  const ledger = D.LEDGER.map((d) => `| ${pad(d.id)} | ${cell(d.title)} | `
    + `${d.ticket ? cell(d.ticket) : '**none**'} | ${cell(ST[d.state].label)} | `
    + `${d.file ? `\`${cell(d.file)}\`` : '—'} | ${cell(d.note)} |`).join('\n');

  const contract = D.WRITTEN.map((d) => `| ${pad(d.id)} | ${cell(d.title)} | `
    + `${d.requires.length} | ${cell(d.source)} | ${cell(d.gapsHeading)} |`).join('\n');

  return `# Colaberry Live — project documents

Generated from \`scripts/artifacts/tickets/l118Data.js\`. **Do not hand-edit** — rebuild with
\`node scripts/artifacts/buildL118Artifacts.js\`, which checks every row below against the disk
before it writes anything.

Bootstrap §3.1 and §17 require **${D.TOTALS.required} documents**, DOC 00 through DOC 17.
**${D.TOTALS.written} are written**, ${D.TOTALS.thisPass} of them under L11.8 on ${D.META.built}.

**Start at [DOC 00](${D.WRITTEN[0].slug}.md).** Every AI-executable todo links to it, and it carries
the source-of-truth hierarchy, the ticket-selection rule and the current blockers.

## The eighteen

| DOC | Title | Ticket | State | File | Note |
|---|---|---|---|---|---|
${ledger}

## The coverage contract

Every requirement below is transcribed from the bootstrap — the document that *defines* the
deliverable — and checked against the file on disk. The check runs requirement → file, in that
direction only: a checker built by reading the documents would pass by construction.

| DOC | Title | Reqs | Transcribed from | Names its gaps in |
|---|---|---|---|---|
${contract}

${D.TOTALS.requirements} requirements in all, ${D.TOTALS.headings} of them required to be navigable
sections rather than mentions in prose.

## The gap this pass found, and how it was closed

**DOC 10 had no ticket.** Bootstrap §17 requires a report named *COLABERRY LIVE — CURRENT BUILD
MIGRATION REPORT* with six named sections, and names \`docs/colaberry-live/\` as its repository
home. No todo on board ${D.META.board} covered it. It was found on ${DOC10.wasGap.foundOn} ${DOC10.wasGap.howFound}.

**Closed ${DOC10.wasGap.closedOn} by ${DOC10.wasGap.closedBy}**, which created the ticket and
wrote the document at [\`${DOC10.file}\`](${DOC10.file.replace('docs/colaberry-live/', '')}).
The finding is kept in this ledger rather than erased: a ledger that quietly reports a clean state
cannot be used to tell a gap that never existed from one that was fixed.

That is the fifth such gap on this program. The other four are definition-of-done conditions 17, 18,
19 and 40, recorded in [DOC 00](${D.WRITTEN[0].slug}.md) and in
[\`../COLABERRY_LIVE_TRACEABILITY_MATRIX.md\`](../COLABERRY_LIVE_TRACEABILITY_MATRIX.md).
`;
}

module.exports = { selfCheck, build, markdown };
