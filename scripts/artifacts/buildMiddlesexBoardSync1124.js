/**
 * Four one-page visuals for the Middlesex Phase 1 board catch-up of Tue 24 Nov 2026: S0, S1, S2 and
 * Req revisions. Each shows where the ticket sits on the S0-S7 ladder, its own "done when" checked
 * item by item, and the next decision. None of these tickets closes today: each one still has an
 * unmet done-condition, so these are UPDATE visuals, not close-out artifacts.
 *
 *   NODE_PATH=<repo>/node_modules ARTIFACT_CHROMIUM=<msedge.exe> node scripts/artifacts/buildMiddlesexBoardSync1124.js
 *
 * Writes docs/MX_BOARD_SYNC_2026-11-24_<ticket>.html and .pdf (1 page each).
 *
 * Sources, all read 24 Nov 2026: Basecamp list 10443345153 (board dump and each ticket's description
 * and comments), PR https://github.com/colaberry/GlazeOff-AIA-Billing/pull/1 (state, review, checks),
 * its migration 0002_aia_billing_schema.py, the local CI run recorded on the PR (86 passed, 0 skipped),
 * Sai's 23 Nov email, and Gmail searched for Karun, Jamie and Ram since 23 Nov.
 */
const path = require('path');
const fs = require('fs');
const { baseCss, SEV } = require('./artifactTheme');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const PR = 'https://github.com/colaberry/GlazeOff-AIA-Billing/pull/1';

// The ladder. state: done | built | blocked | next | later
const LADDER = [
  ['S0', 'Hosting', '2 checks open', 'built'],
  ['S1', 'GCP + deploy', 'blocked: access', 'blocked'],
  ['S2', 'Schema', 'built in PR 1', 'built'],
  ['S3', 'Load jobs', 'Sat 28 Nov', 'next'],
  ['S4', 'PM entry', 'Sat 28 Nov', 'next'],
  ['S5', 'Finalize + export', 'Thu 3 Dec', 'later'],
  ['S6', 'Identity', 'Thu 3 Dec', 'later'],
  ['S7', 'Dry run', 'Sat 5 Dec', 'later'],
  ['PILOT', 'Two PMs', 'Tue 8 Dec', 'later'],
];
const FILL = { built: '#dbeafe', blocked: '#fde2e1', next: '#fef3c7', later: '#f1f5f9' };
const STROKE = { built: '#1e40af', blocked: SEV.bad, next: SEV.watch, later: '#94a3b8' };

function ladderSvg(focus) {
  const w = 82;
  return `<svg viewBox="0 0 ${LADDER.length * (w + 6) + 4} 96" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, sans-serif">
  ${LADDER.map(([id, name, note, st], i) => {
    const x = 4 + i * (w + 6);
    const on = focus.includes(id);
    return `<rect x="${x}" y="${on ? 4 : 12}" width="${w}" height="${on ? 84 : 70}" rx="8" fill="${FILL[st]}" stroke="${STROKE[st]}" stroke-width="${on ? 3.5 : 1.2}"/>
      <text x="${x + w / 2}" y="${on ? 30 : 34}" text-anchor="middle" font-size="${on ? 15 : 13}" font-weight="700" fill="#1f2937">${id}</text>
      <text x="${x + w / 2}" y="${on ? 50 : 52}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#334155">${name}</text>
      <text x="${x + w / 2}" y="${on ? 68 : 68}" text-anchor="middle" font-size="8.5" fill="${STROKE[st]}">${note}</text>`;
  }).join('')}
</svg>
<div class="legend"><span style="background:${FILL.built};border-color:${STROKE.built}"></span>built or decided, not closed
<span style="background:${FILL.blocked};border-color:${STROKE.blocked}"></span>blocked
<span style="background:${FILL.next};border-color:${STROKE.next}"></span>next
<span style="background:${FILL.later};border-color:${STROKE.later}"></span>later &nbsp;·&nbsp; thick border = this ticket</div>`;
}

const MARK = { yes: ['✓', SEV.ok], no: ['✗', SEV.bad], part: ['◐', SEV.watch] };
function checklist(items) {
  return `<table class="chk"><thead><tr><th style="width:34px"></th><th style="width:44%">Done when (from the ticket)</th><th>Evidence, 24 Nov</th></tr></thead><tbody>
  ${items.map(([m, cond, ev]) => `<tr><td class="mk" style="color:${MARK[m][1]}">${MARK[m][0]}</td><td><b>${cond}</b></td><td>${ev}</td></tr>`).join('')}
  </tbody></table>`;
}

function decision(head, opts) {
  return `<h2>${head}</h2><table class="opts"><tbody>
  ${opts.map(([who, what, rec]) => `<tr${rec ? ' class="rec"' : ''}><td style="width:22%"><b>${who}</b></td><td>${what}</td></tr>`).join('')}
  </tbody></table>`;
}

const TICKETS = {
  S0: {
    title: 'S0. Hosting: decided, not closable yet',
    focus: ['S0'],
    take: 'The decision is made and agreed: GCP project <code>glazeoff-billing</code>, the app on Cloud Run, one Postgres with row-level security. The ticket stays open because two of its three done-conditions, the monthly cost and one timed restore, cannot happen until the database exists on GCP (S1).',
    checks: [
      ['yes', 'The choice is recorded here', 'Ram, 18 Nov: production on GCP, not Render, not Hetzner. Module rules agreed with Sai 23 Nov: aia-billing is a glazeoff.ai module, one database, <code>client_id</code> + RLS, app runs as a non-superuser role.'],
      ['no', '…with the monthly cost', 'Not known. It is now a share of the glazeoff.ai GCP environment, not a separate bill. Readable from the <code>client=&lt;cid&gt; module=aia-billing</code> labels once resources exist.'],
      ['no', 'A restore run once and timed', 'Needs the database on GCP. Blocked on S1 (Ali not yet Editor on <code>glazeoff-billing</code>).'],
    ],
    dec: ['What closes it', [
      ['Karun', 'Add Ali to <code>glazeoff-billing</code> as Editor (adding people needs Owner). Due Mon 23 Nov; no confirmation found in Gmail on 24 Nov.'],
      ['Ali (Claude)', 'Create the database, run and time one restore, read the first week of labelled cost. Then close with both PDFs.', true],
      ['New due', '<b>Tue 1 Dec</b>, with S1. Moved from 18 Nov.'],
    ]],
  },
  S1: {
    title: 'S1. Hosted platform + deploy path: blocked on access',
    focus: ['S1'],
    take: 'The GCP project exists and is linked to billing, and Sai has Editor. Ali does not yet, so nothing can be deployed. A second gap: GitHub Actions has not started a single run in the private colaberry org since at least 2 Nov, so "deploy from a push" has no pipeline to ride on yet. Ram was emailed about it on 23 Nov.',
    checks: [
      ['no', 'A commit pushed to main is serving at a URL', 'No access to <code>glazeoff-billing</code>. Every Actions run ends in <code>startup_failure</code> (org billing or spending limit, most likely).'],
      ['no', 'The database survives a redeploy', 'No database yet.'],
      ['no', 'A restore from backup performed once', 'Same restore as S0. One run satisfies both tickets.'],
    ],
    dec: ['Two unblocks, both outside this tab', [
      ['Karun', 'Ali as Editor on <code>glazeoff-billing</code>, and access to karunswaroop/GlazeOff-Shopdraw.'],
      ['Ram', 'Whoever owns colaberry org billing checks the Actions spending limit or payment method. Until then tests run by hand and are recorded on each PR.'],
      ['New due', '<b>Tue 1 Dec</b>, the same day as the AIX Auth decision. Moved from 21 Nov. S3 and S4 do not wait on it: they are built and tested locally.', true],
    ]],
  },
  S2: {
    title: 'S2. Data model and migrations: built, waiting on merge',
    focus: ['S2'],
    take: 'The schema is built and tested in PR 1: 11 tables, forced row-level security on every one, <code>require()</code> on every route. 86 tests pass locally on Postgres 16 with 0 skipped. It is approved but not merged, and Sai has not reviewed yet. It cannot close at merge either: the ticket also requires both October requisitions to reproduce their printed totals, which needs the requisition loader (next PR, with S3).',
    checks: [
      ['yes', 'Migrations run clean on an empty database', 'Local CI mirror: <code>alembic upgrade head</code> run twice on a fresh Postgres 16; the second run is a no-op.'],
      ['part', 'Multi-tenant from the first migration, Middlesex as tenant one', 'Every table has <code>client_id</code> + forced RLS; cross-client reads, writes and foreign keys are refused in tests. No client name in code. Not yet: Middlesex is not loaded as a client row; that happens with S3.'],
      ['part', 'Retainage varies by contract (5, 7, 10, Fairfield 0)', '<code>contracts.retainage_pct</code> per contract. <b>Gap found:</b> the ticket says stored materials carry a <i>separate</i> retainage percentage; the schema has one. Fix lands in the next migration.'],
      ['no', 'Fairfield REQ 17 and Porsche REQ 12 reproduce to the dollar', 'Needs the requisition loader and G703 math (next PR, after PR 1 merges).'],
    ],
    dec: ['What moves it', [
      ['Ali', 'Merge PR 1 (you are on the bypass list; Sai can still review after).', true],
      ['Ali (Claude)', 'Next PR: requisition load + G703 math + the stored-materials retainage column, proven against both October reqs.'],
      ['New due', '<b>Sat 28 Nov</b>, with S3. Moved from 21 Nov.'],
    ]],
  },
  REV: {
    title: 'Req revisions: the record-keeping half is in the schema',
    focus: ['S2', 'S4', 'S5', 'S7'],
    take: 'What we told Jamie on 17 Nov holds in the database: a submitted requisition is never overwritten. A revision is a new row that points at the one it replaces, and the audit trail cannot be edited. The screen, the export and the real November test come with S4, S5 and S7, so this ticket finishes with the dry run, not tomorrow.',
    checks: [
      ['yes', 'S2: every revision kept (value, who, when), never overwritten', '<code>pay_applications.revision_no</code> + <code>supersedes_id</code>, unique per contract, application and revision; <code>created_by</code> / <code>created_at</code> on every row; <code>audit_events</code> is insert-only for the app. In PR 1, not merged.'],
      ['no', 'S4: edit freely until submitted; after finalize, an edit opens a revision', 'Screen not built. Due Sat 28 Nov.'],
      ['no', 'S5: export uses the latest revision and can show history', 'Not built. Due Thu 3 Dec.'],
      ['no', 'S7: dry run includes one real November change, tied out line by line', 'Needs Jamie\'s November reqs (promised Mon 23 Nov; nothing received as of 24 Nov). Due Sat 5 Dec.'],
    ],
    dec: ['Date', [
      ['New due', '<b>Sat 5 Dec</b>, the S7 dry run, because its last done-condition is the dry run itself. Moved from Wed 25 Nov.', true],
      ['Ask of Jamie', 'Unchanged: one November req that changed after entry. Already part of the November AIA ask.'],
    ]],
  },
};

function page(t) {
  return `
  <h1>${t.title}</h1>
  <div class="meta">Middlesex Glass · AIA billing Phase 1 · board catch-up, Tue 24 Nov 2026 · PR: ${PR}</div>
  <div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">${t.take}</div></div>
  <h2>Where this sits on the way to the 8 Dec pilot</h2>
  ${ladderSvg(t.focus)}
  <h2>Done-when, checked</h2>
  ${checklist(t.checks)}
  ${decision(t.dec[0], t.dec[1])}
  <p class="meta">Not closed: at least one done-condition above is unmet. Closing takes the one-page visual and the completion document, both on this ticket.</p>`;
}

(async () => {
  const css = baseCss() + `
    .legend { font-size: 8pt; color: #475569; margin: 2px 0 6px; }
    .legend span { display:inline-block; width:12px; height:10px; border:1.5px solid; border-radius:2px; margin:0 4px 0 10px; vertical-align:-1px; }
    table td, table th { font-size: 8.8pt; padding: 5px 7px; vertical-align: top; }
    .chk td.mk { font-size: 15pt; font-weight: 700; text-align: center; line-height: 1; }
    .opts tr.rec td { background: #fef3c7; }
    .takeaway .headline { font-size: 11pt; font-weight: 600; }`;
  const out = [];
  for (const [key, t] of Object.entries(TICKETS)) {
    const stem = `MX_BOARD_SYNC_2026-11-24_${key}`;
    const html = htmlDoc({ title: t.title, css, body: page(t) });
    fs.writeFileSync(path.join(DOCS, `${stem}.html`), html);
    const r = await renderPdf({ html, outPath: path.join(DOCS, `${stem}.pdf`), maxPages: 1, margin: '11mm' });
    out.push({ key, ...r });
  }
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
