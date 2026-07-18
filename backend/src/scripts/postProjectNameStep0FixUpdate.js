#!/usr/bin/env node
// Post a status update to BC #9946499505 (GitHub integration connect-flow /
// wizard-resume-on-reload) covering the step-0 project-name-persistence
// follow-on fix merged 2026-07-18. Ticket stays OPEN — deploy + live
// click-through verification are still outstanding.
//
// Run: node backend/src/scripts/postProjectNameStep0FixUpdate.js [--dry]
// Env: BASECAMP_ACCESS_TOKEN must be set (resolveable via CCPP fallback).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const { getBasecampToken } = require('./lib/basecampToken');

const DRY = process.argv.includes('--dry');
const ACCOUNT = 3945211;
const BUCKET = 47502609;
const TODO_ID = 9946499505;

const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
function mention(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}
const ALI = mention(ALI_SGID);

const COMMENT = `<div><strong>Status: still open.</strong> Landed one more fix under this ticket (PR #343, merged to staging), but the flow has never been click-tested live — deploy + verification are still outstanding.</div>
<div><br></div>
<div><strong>What shipped just now</strong></div>
<div>Follow-up gap found in the 2026-07-17 wizard-resume-on-reload fix: that fix resumes the wizard at step 1 for a "name-only" project, but no project row was ever actually created at step 0 (naming) — so a reload during step 0 still lost the name and reset to step 0, silently defeating that exact resume path. Added <code>PATCH /api/portal/project/name</code> (Zod-validated, get-or-creates the project) and wired the wizard to call it before advancing past step 0. New test suite (<code>projectRoutes.test.ts</code>) — 6/6 passing (happy path, DB-failure path, input boundaries, idempotency). Both backend and frontend <code>tsc --noEmit</code> clean. Merged to <code>staging</code>.</div>
<div><br></div>
<div><strong>Still outstanding before this ticket can close</strong></div>
<ol>
<li>Deploy <code>staging</code> to production — nothing in this ticket's scope has been deployed yet.</li>
<li>Real browser click-through against the deployed environment: connect GitHub → repo picker → "connected" badge, and resume-on-reload at every wizard step (including the step-0 case fixed today). This requires GitHub's registered OAuth callback URL, which only resolves against a real deployed environment.</li>
<li>Confirm GitHub's own Authorized OAuth Apps page shows real usage after a live connect (it previously showed "Never used" because no real API call had ever fired through the app).</li>
</ol>
<div><br></div>
<div>${ALI} — flagging for a deploy decision + the live verification pass whenever it fits.</div>`;

(async () => {
  if (!process.env.BASECAMP_ACCESS_TOKEN) {
    process.env.BASECAMP_ACCESS_TOKEN = await getBasecampToken();
  }
  const HEADERS = {
    Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
    'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
    'Content-Type': 'application/json',
  };

  if (DRY) {
    console.log('--- DRY RUN ---');
    console.log(`Would POST comment to todo ${TODO_ID}:`);
    console.log(`  ${COMMENT.length} chars`);
    return;
  }

  const resp = await axios.post(
    `https://3.basecampapi.com/${ACCOUNT}/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`,
    { content: COMMENT },
    { headers: HEADERS },
  );
  console.log(`Comment posted: ${resp.data.app_url}`);
})().catch((e) => {
  console.error('FAIL:', e.response?.data || e.message);
  process.exit(1);
});
