/**
 * l116Document — DOC 16's self-check, its generated Markdown, and the rendered PDF.
 *
 * THE LOAD-BEARING CHECKS, AND WHY THESE AND NOT OTHERS.
 *
 * 1. REQUIREMENT -> DOCUMENT, NEVER THE REVERSE. The fifteen explanations come from the
 *    bootstrap, and `requiredCount` pins the length as transcribed. A check built by reading the
 *    finished brief would pass by construction.
 *
 * 2. NO INVENTED FIGURE IN A SECTION THAT HAS NO SOURCE. This is the check that earns its keep.
 *    Two required explanations - costs/vendors and the 10,000 Architect goal - are not defined
 *    anywhere in the repository. The failure mode is not that the brief omits them; it is that a
 *    plausible number gets written, Ram repeats it, and nobody can trace it. So those sections
 *    must carry the gap marker AND must contain no currency amount at all.
 *
 *    `$0` is excluded from that ban deliberately. It is the bootstrap's own product term for the
 *    no-cost Colaberry account inside the funnel it defines, so banning it would force the brief
 *    to paraphrase a quoted definition. Every OTHER currency amount fails the build.
 *
 * 3. THE CENTRAL CLAIM IS DERIVED, NOT TYPED. The brief's spine is that the system has never
 *    aired and that a specific number of tickets cannot finish until it does. That number is
 *    computed from l03Data at build time and asserted to appear in the rendered text, so the
 *    brief cannot drift from the board it describes.
 *
 * 4. THE HALF OF THE CRITERION NO DOCUMENT CAN DISCHARGE MUST BE VISIBLE. L11.6 asks for the
 *    brief AND the briefing session. A finished-looking brief with no mention of the session
 *    would read as a finished ticket, so the section is required by name.
 *
 * 5. EVERY CITED PATH EXISTS. A brief for an executive that points at a file which is not there
 *    teaches him the document is unreliable, which costs more than the missing reference.
 *
 * 6. THE FILE ON DISK MUST EQUAL WHAT THE DATA RENDERS. Otherwise a hand-edit could upgrade a
 *    claim quietly, which is the whole reason the prose lives in a data module.
 */
const fs = require('fs');
const path = require('path');
const D = require('./l116Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Any currency amount EXCEPT the bootstrap's literal `$0` term. Checked against the gap
 * sections only - the rest of the brief is free to quote a real figure if one ever exists.
 */
const CURRENCY = /(?:\$|USD\s|EUR\s|£)\s?\d|\b\d[\d,.]*\s?(?:dollars|USD)\b/i;
const MIN_BODY = 200;

function stripAllowedZero(text) {
  return text.replace(/\$0\b/g, '');
}

function vendorTable() {
  const head = '| Vendor | What it buys | Where it shows in the system |\n|---|---|---|';
  const rows = D.VENDORS.map((v) => `| **${v.name}** | ${v.role} | \`${v.where}\` |`);
  return [head, ...rows].join('\n');
}

/** Section body with the vendor-table token resolved. */
function bodyFor(key) {
  return D.SECTIONS[key].replace('VENDOR_TABLE', vendorTable());
}

function markdown() {
  const L = [];
  L.push(`# ${D.META.title}`);
  L.push('');
  L.push(`**Written for ${D.META.audience}.** ${D.META.doc}, ticket ${D.META.ticket}. `
    + `Generated from \`scripts/artifacts/tickets/l116Data.js\` on ${D.META.built} — `
    + 'do not hand-edit, the build compares this file against the data.');
  L.push('');
  L.push('> The question this brief answers, in the words of the document that commissioned it:');
  L.push('>');
  L.push(`> *"${D.AUDIENCE_QUESTION}"*`);
  L.push('');
  L.push('## Read this first');
  L.push('');
  L.push('Colaberry Live is **built and has not yet aired.** Everything below that describes '
    + 'the system working describes it working under test. That is not a hedge — it is the '
    + 'single most useful fact in this document, and the section on risk explains what it has '
    + 'already cost. Where this brief cannot source something, it says so instead of '
    + 'estimating.');
  L.push('');
  L.push(`## Still owed: the briefing session`);
  L.push('');
  L.push(`${D.BRIEFING.owed} ${D.BRIEFING.why} Owner: **${D.BRIEFING.owner}**. `
    + 'This document does not complete the ticket on its own.');
  L.push('');
  L.push('---');
  L.push('');

  D.REQUIRES.forEach((r) => {
    L.push(`## ${r.match}`);
    L.push('');
    L.push(bodyFor(r.key));
    L.push('');
  });

  L.push('---');
  L.push('');
  L.push('## What this brief could not source');
  L.push('');
  D.GAPS.forEach((g) => {
    const req = D.REQUIRES.find((r) => r.key === g.key);
    L.push(`- **${req.match}** — ${D.GAP_MARKER}. Settled by: ${g.settledBy}`);
  });
  L.push('');
  L.push(`*State claims checked on ${D.META.stateCheckedOn}. An airing is an event version `
    + 'control cannot show, so the absence of a record is reported as what was checked rather '
    + 'than as proof that nothing aired.*');
  L.push('');
  return L.join('\n');
}

function selfCheck() {
  // STRUCTURE IS VALIDATED BEFORE ANYTHING IS RENDERED, DELIBERATELY. An earlier version called
  // markdown() on the first line, and malformed data then died inside the renderer with "cannot
  // read properties of undefined" — the build stopped, but it stopped without saying what was
  // wrong. The guards below are the thing that should speak, so nothing renders until the shape
  // is known to be sound.

  // 1. THE CONTRACT, AS TRANSCRIBED.
  if (D.REQUIRES.length !== D.requiredCount) {
    throw new Error(`${D.REQUIRES.length} requirements, the bootstrap bullet list has `
      + `${D.requiredCount}. A dropped bullet must fail the build, not shrink the contract.`);
  }
  const keys = D.REQUIRES.map((r) => r.key);
  if (new Set(keys).size !== keys.length) throw new Error('duplicate requirement key');

  // 2. REQUIREMENT -> SECTION, AND NO ORPHANS THE OTHER WAY.
  keys.forEach((k) => {
    if (!D.SECTIONS[k]) throw new Error(`requirement "${k}" has no section`);
  });
  Object.keys(D.SECTIONS).forEach((k) => {
    if (!keys.includes(k)) {
      throw new Error(`section "${k}" answers no requirement, so the contract and the document `
        + 'have come apart');
    }
  });

  // 3. EVERY REQUIRED EXPLANATION IS SUBSTANTIVE. Rendering is safe from here on.
  const md = markdown();
  D.REQUIRES.forEach((r) => {
    if (!md.includes(`## ${r.match}`)) {
      throw new Error(`bootstrap bullet "${r.bullet}" has no heading in the document`);
    }
    if (!r.bullet || !r.bullet.trim()) throw new Error(`requirement ${r.key} lost its source text`);
    const body = bodyFor(r.key);
    if (body.length < MIN_BODY) {
      throw new Error(`section "${r.match}" is ${body.length} characters, under the `
        + `${MIN_BODY} minimum — a required explanation thinned to a placeholder still reads as `
        + 'answered');
    }
  });

  // 4. THE GAP SECTIONS: MARKED, AND FREE OF ANY INVENTED FIGURE.
  if (!D.GAPS.length) {
    throw new Error('no gaps declared. Two required explanations are not defined in this '
      + 'repository; declaring none means the brief is claiming to have sourced them.');
  }
  D.GAPS.forEach((g) => {
    if (!keys.includes(g.key)) throw new Error(`gap "${g.key}" is not a required explanation`);
    if (!g.settledBy || g.settledBy.length < 40) {
      throw new Error(`gap "${g.key}" does not say who or what would settle it`);
    }
    const body = bodyFor(g.key);
    if (!body.includes(D.GAP_MARKER)) {
      throw new Error(`section "${g.key}" is a declared gap but does not carry the marker `
        + `"${D.GAP_MARKER}", so a reader cannot tell it is unsourced`);
    }
    const hit = stripAllowedZero(body).match(CURRENCY);
    if (hit) {
      throw new Error(`section "${g.key}" contains the currency amount "${hit[0]}" but has no `
        + 'source in this repository. An invented figure in a brief for an executive is the one '
        + 'failure that propagates — he would repeat it.');
    }
  });

  // 5. THE CENTRAL CLAIM IS THE BOARD'S OWN NUMBER, NOT A TYPED ONE.
  const L03 = require('./l03Data');
  const airing = (L03.TICKETS || []).filter((t) => t.cls === 'airing').length;
  if (airing !== D.DERIVED.airingBlocked) {
    throw new Error(`derived airing count ${D.DERIVED.airingBlocked} disagrees with l03Data `
      + `(${airing})`);
  }
  if (airing === 0) {
    throw new Error('the board shows no tickets blocked on a real airing, which would make the '
      + 'risk section wrong — check l03Data rather than deleting the claim');
  }
  if (!md.includes(`${airing} of the ${D.DERIVED.openTickets} open`)) {
    throw new Error('the rendered brief does not state the derived airing-blocked count, so its '
      + 'central claim is no longer tied to the board');
  }

  // 6. THE HALF OF THE CRITERION NO DOCUMENT CAN DISCHARGE.
  if (!md.includes('Still owed: the briefing session')) {
    throw new Error('the brief does not say the briefing session is still owed. A complete-'
      + 'looking brief with no such note reads as a completed ticket.');
  }

  // 7. THE AUDIENCE QUESTION, VERBATIM FROM THE BOOTSTRAP.
  if (!md.includes(D.AUDIENCE_QUESTION)) {
    throw new Error('the bootstrap\'s own statement of what Ram needs to know is missing');
  }

  // 8. EVERY CITED PATH EXISTS. A dead reference teaches the reader to distrust the document.
  D.CITED.forEach((p) => {
    if (!fs.existsSync(path.join(ROOT, p))) {
      throw new Error(`cited path does not exist: ${p}`);
    }
  });
  D.VENDORS.forEach((v) => {
    if (!fs.existsSync(path.join(ROOT, v.where))) {
      throw new Error(`vendor ${v.name} cites a path that does not exist: ${v.where}`);
    }
  });

  // 9. THE TOKEN MUST BE RESOLVED. An unsubstituted token ships as literal noise.
  if (md.includes('VENDOR_TABLE')) throw new Error('the vendor-table token was not substituted');
  if (!md.includes('| Vendor | What it buys |')) throw new Error('the vendor table is missing');

  // 10. GENERATED, NOT HAND-WRITTEN.
  const onDisk = path.join(ROOT, D.META.file);
  if (fs.existsSync(onDisk)) {
    const actual = fs.readFileSync(onDisk, 'utf8').replace(/\r\n/g, '\n');
    if (actual.trim() !== md.trim()) {
      throw new Error(`${D.META.file} differs from what l116Data.js renders. The document is `
        + 'generated; edit the data module, not the file.');
    }
  }

  return {
    requirements: D.REQUIRES.length,
    gaps: D.GAPS.length,
    vendors: D.VENDORS.length,
    citedPaths: D.CITED.length,
    airingBlocked: airing,
    bytes: Buffer.byteLength(md, 'utf8'),
  };
}

function html() {
  const sec = D.REQUIRES.map((r) => {
    const body = esc(bodyFor(r.key))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>');
    return `<h2>${esc(r.match)}</h2><p>${body}</p>`;
  }).join('\n');

  const gaps = D.GAPS.map((g) => {
    const req = D.REQUIRES.find((r) => r.key === g.key);
    return `<li><strong>${esc(req.match)}</strong> — ${esc(D.GAP_MARKER)}. `
      + `Settled by: ${esc(g.settledBy)}</li>`;
  }).join('');

  const body = `
    <h1>${esc(D.META.title)}</h1>
    <p class="meta">Written for ${esc(D.META.audience)} · ${esc(D.META.doc)} · ticket
      ${esc(D.META.ticket)} · ${esc(D.META.built)}</p>
    <blockquote>${esc(D.AUDIENCE_QUESTION)}</blockquote>
    <div class="callout"><strong>Colaberry Live is built and has not yet aired.</strong>
      Everything below that describes the system working describes it working under test.
      ${D.DERIVED.airingBlocked} of the ${D.DERIVED.openTickets} open tickets cannot finish
      until a real class airs.</div>
    <div class="callout"><strong>Still owed:</strong> ${esc(D.BRIEFING.owed)}
      Owner: ${esc(D.BRIEFING.owner)}.</div>
    ${sec}
    <h2>What this brief could not source</h2>
    <ul>${gaps}</ul>
    <p class="meta">State claims checked on ${esc(D.META.stateCheckedOn)}.</p>`;

  const css = `${baseCss}
    blockquote{border-left:4px solid ${TOKENS.accent};margin:0 0 18px;padding:8px 16px;
      background:#f6f8fb;font-style:italic}
    .callout{border:1px solid ${TOKENS.border};border-left:4px solid ${TOKENS.accent};
      background:#fbfcfe;padding:12px 16px;margin:0 0 18px;border-radius:4px}
    .meta{color:${TOKENS.muted};font-size:12px}
    table{border-collapse:collapse;width:100%;margin:12px 0}
    th,td{border:1px solid ${TOKENS.border};padding:6px 8px;text-align:left;font-size:12px}
    code{background:#f3f5f9;padding:1px 4px;border-radius:3px;font-size:12px}
    h2{margin-top:22px}`;

  return htmlDoc({ title: D.META.title, css, body });
}

function write() {
  const out = path.join(ROOT, D.META.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${markdown()}\n`, 'utf8');
  return out;
}

module.exports = { markdown, selfCheck, html, write, vendorTable };
