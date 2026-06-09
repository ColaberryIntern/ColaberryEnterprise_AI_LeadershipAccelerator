#!/usr/bin/env node
// Post "unstall" comments to the 4 gov-bid intern build todos after the
// PR #5 fix that (a) collapsed misnamed requirements.docx into a single
// requirements.md and (b) filled the `git clone None` URL placeholder in
// the intern task prompts.
//
// Idempotent: each comment carries a marker string and re-runs skip todos
// where the marker already exists.
//
// Run: BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/postGovBidBuildsUnstallComments.js
// On VPS: MSSQL creds resolve the token from CCPP Basecamp_AuthInfo.
//
// Session: CC-20260609-k4m2

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { getBasecampToken } = require('./lib/basecampToken');

const ACCOUNT_ID = '3945211';
const PROJECT_ID = '47346103'; // Gov Contracts bucket
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const MARKER = '[unstall-2026-06-09-k4m2]';

const REPO_URL = 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator.git';
const PR_REF = 'PR #5 (commit 96802610)';

const BUILDS = [
  {
    key: 'utd-residential-life',
    todoId: '9967513345',
    intern: 'Omolola',
    title: 'UTD Residential Life',
    projectLine:
      'cloud-based housing-management platform pilot integrating StarRez + Salesforce. Compliance: TX-RAMP, SOC 2 Type II, FERPA. RFP closes 2026-06-30 — time-sensitive.',
  },
  {
    key: 'harris-agenda-meeting',
    todoId: '9967513741',
    intern: 'Samrawit',
    title: 'Harris County Agenda + Meeting Management',
    projectLine:
      'cloud-based meeting/agenda management platform for Harris County staff and elected officials. Tiered subscription model ($50/$100/$200). Compliance: Harris County SQL Server standards, Universal Services Reference Architecture, open meeting laws, role-based access control. Competes with Granicus, BoardDocs, CivicPlus, OpenGov.',
  },
  {
    key: 'tdcj-oig-records',
    todoId: '9967513038',
    intern: 'Obi',
    title: 'TDCJ-OIG Records Management',
    projectLine:
      'cloud-based case management system for law enforcement investigators at the Texas Department of Criminal Justice Office of Inspector General. Per-agency annual subscription. Compliance: CJIS, NIST — data security is the #1 priority. Competes with LexisNexis, Zuercher Technologies, Tyler Technologies.',
  },
  {
    key: 'tdhca-multifamily',
    todoId: '9967512689',
    intern: 'Akiwam',
    title: 'TDHCA Multifamily Management',
    projectLine:
      'cloud-based web application for Texas Department of Housing and Community Affairs (TDHCA) underwriters. Streamlines the multifamily housing application process. Government-funded model (no user subscriptions — value is operational efficiency for TDHCA staff). Compliance: Texas state housing data regulations. Phased MVP rollout: registration → dashboard → roles → notifications → API → e-sign + payments. Competes with eHousingPlus, Yardi, AppFolio.',
  },
];

const H = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)',
  Accept: 'application/json',
  ...extra,
});
async function bcGet(token, p) {
  const r = await fetch(`${API}${p}`, { headers: H(token) });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPost(token, p, body) {
  const r = await fetch(`${API}${p}`, {
    method: 'POST',
    headers: H(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function renderHtml(b) {
  return `<div>
<p>Hey ${b.intern} — sorry about the stall on this ${b.title} build. Your task prompt had <code>git clone None</code> (URL placeholder unfilled) and pointed at <code>requirements.md</code> while the actual file was misnamed <code>.docx</code>. Both fixed today via ${PR_REF}.</p>

<p><strong>REPO:</strong> <a href="${REPO_URL}">${REPO_URL}</a><br>
<strong>BRANCH:</strong> main<br>
<strong>PATH:</strong> <code>gov-bid-builds/${b.key}/requirements.md</code></p>

<p><strong>To unblock:</strong></p>
<pre style="background:#f5f5f5;padding:10px;border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5;overflow-x:auto;">git clone ${REPO_URL}
cd ColaberryEnterprise_AI_LeadershipAccelerator/gov-bid-builds/${b.key}/
cat requirements.md</pre>

<p>The doc is an 11-chapter AI-Project-Architect build guide (v1, Final, 2026-06-05). Covers: Executive Summary → Problem &amp; Market → User Personas → Functional Requirements → AI &amp; Intelligence Architecture → Non-Functional → Technical Architecture &amp; Data Model → Security &amp; Compliance → KPIs → Roadmap → Skills &amp; Tool Integration Guide. Chapter 11 lists which Library assets to install for this build.</p>

<p><strong>Project-specific:</strong> ${b.projectLine}</p>

<p>Resume when you have the file. Post here if anything in the spec needs clarification.</p>

<p>— Ali</p>

<p style="color:#999;font-size:11px;margin-top:16px;">${MARKER}</p>
</div>`;
}

(async () => {
  const token = await getBasecampToken();
  console.log(`[unstall] Token loaded. Posting to ${BUILDS.length} todos. Marker: ${MARKER}\n`);

  const results = [];
  for (const b of BUILDS) {
    console.log(`=== ${b.intern} (${b.title}, todo ${b.todoId}) ===`);

    // Idempotency: skip if marker already present
    const existing = await bcGet(token, `/buckets/${PROJECT_ID}/recordings/${b.todoId}/comments.json`).catch(
      (e) => {
        console.error(`  GET comments failed: ${e.message}`);
        return [];
      },
    );
    if (Array.isArray(existing) && existing.find((c) => (c.content || '').includes(MARKER))) {
      console.log(`  SKIP — marker already present`);
      results.push({ todoId: b.todoId, intern: b.intern, status: 'already_present' });
      continue;
    }

    const html = renderHtml(b);
    try {
      const created = await bcPost(token, `/buckets/${PROJECT_ID}/recordings/${b.todoId}/comments.json`, {
        content: html,
      });
      console.log(`  +comment posted (id=${created.id}) ${created.app_url || ''}`);
      results.push({ todoId: b.todoId, intern: b.intern, commentId: created.id, status: 'posted' });
    } catch (e) {
      console.error(`  FAIL: ${e.message}`);
      results.push({ todoId: b.todoId, intern: b.intern, status: 'error', error: e.message });
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`  ${r.intern.padEnd(10)} todo=${r.todoId} ${r.status}${r.commentId ? ` id=${r.commentId}` : ''}`);
  }
  const failed = results.filter((r) => r.status === 'error');
  if (failed.length) {
    console.error(`\n${failed.length} failed.`);
    process.exit(1);
  }
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
