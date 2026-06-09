#!/usr/bin/env node
// Post code-review feedback to Kes on PR #3 (existing todo) + create new todo
// for PR #4 (no existing matching todo). Both carry the detailed findings from
// Ali's review pass on 2026-06-09.
//
// PR #3 → BC comment on todo 9946499758 ("Review ProjectDnaWizard.tsx UI with Aleem")
// PR #4 → new todo created in AI Systems list 9946469022, assigned to Kes,
//         due 2026-06-10, carrying the full review findings as the description.
//
// Run: node backend/src/scripts/postKesPrReviewFeedback.js [--dry]
// Env: BASECAMP_ACCESS_TOKEN must be set (resolveable via CCPP fallback).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const { getBasecampToken } = require('./lib/basecampToken');

const DRY = process.argv.includes('--dry');
const ACCOUNT = 3945211;
const BUCKET = 47502609;
const PR3_TODO_ID = 9946499758;
const PR4_LIST_ID = 9946469022;

const KES_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vNTIzMzAxMjc_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--c2f93ef5d96cace935f68234566862b4a9138624';
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const KES_PERSON_ID = 52330127;

function mention(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}
const KES = mention(KES_SGID);
const ALI = mention(ALI_SGID);

const PR3_COMMENT = `<div>${KES} reviewed PR #3 (ProjectDnaWizard). Strong wizard UI work, accessible step indicator, per-step validation, mobile responsive, backend tests included. Below is the code-review feedback before the design-review pass with Aleem. Two are blocking; the rest are quality bar.</div>
<div><br></div>
<div><strong>Blocking before merge</strong></div>
<ol>
<li><strong>Accidental commit of <code>kes-tasks/</code> directory.</strong> 5 files, ~823 lines: three with double-extension <code>.md.md</code> (looks like a <code>mv</code> typo), plus <code>kes-tasks/PROGRESS-kes.md</code> which is a parallel progress file. CLAUDE.md is explicit: PROGRESS.md is the single source of truth, no parallel files. Please <code>git rm -r kes-tasks/</code>, add to <code>.gitignore</code>, force-push the branch. None of the wizard code depends on these — they're orphan briefs.</li>
<li><strong>FK question: is <code>req.participant.sub</code> actually an enrollment UUID?</strong> The seed has <code>enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE</code>. If <code>requireParticipant</code> puts a user/participant id on <code>.sub</code> (which is the usual JWT pattern) instead of enrollment id, every POST will hit a foreign-key violation and return 500. Worth a 30-second dev deploy + one submission to confirm. If it IS a user id and not an enrollment id, the service needs to look up the active enrollment_id for that user first.</li>
</ol>
<div><br></div>
<div><strong>High priority (security + a11y)</strong></div>
<ol>
<li><strong>Internal error messages leak to clients</strong> at <code>participantRoutes.ts</code> lines 159 and 171: <code>res.status(500).json({ error: err.message })</code> sends the raw exception text (FK violation strings, etc.) to the HTTP caller. Should log full error server-side with a correlation id, return a generic message to client. Per CLAUDE.md Security section.</li>
<li><strong>Missing Space-key handler</strong> on <code>role="radio"</code> / <code>role="checkbox"</code> elements (lines 745, 779, 825, 856, 896). WCAG 2.1 AA requires both Enter AND Space to activate. Currently only Enter is handled — Aleem will flag this if you don't fix it first.</li>
</ol>
<div><br></div>
<div><strong>Medium</strong></div>
<ol>
<li><strong>Dynamic <code>await import()</code></strong> in both endpoints — switch to static <code>import</code> at top of <code>participantRoutes.ts</code>. Dynamic imports run on every request and add latency; the rest of the codebase imports at top of file.</li>
<li><strong>No structured logging</strong> in <code>projectDnaService.ts</code> or the routes. Your PR #2 (L3 agent) has perfect JSON log structure — copy that pattern here. CLAUDE.md Observability Framework treats this as a requirement, not a nice-to-have.</li>
<li><strong>PR description undersells scope</strong> — body says "Backend <code>projectDnaService.ts</code> is Week 2 (due 2026-06-20) — tracked separately" but the diff DOES include the model, seed, service, routes, and tests. The PR is full-stack, not UI-only. Worth correcting the description so anyone reviewing later doesn't think they're approving a UI-only change.</li>
</ol>
<div><br></div>
<div><strong>What's working well — keep doing this:</strong></div>
<ul>
<li>5 unit tests covering happy path, idempotency, boundary, get-success, get-null</li>
<li><code>ON CONFLICT (enrollment_id) DO UPDATE SET</code> upsert — correct idempotency pattern</li>
<li>Migration is idempotent (<code>IF NOT EXISTS</code> everywhere)</li>
<li>Per-step validation with Bootstrap <code>is-invalid</code> feedback</li>
<li>Step indicator has proper ARIA (<code>role="progressbar"</code>, <code>aria-valuenow</code>)</li>
<li>Bootstrap 5 only, no Ant Design — matches project rules</li>
<li>Two separate PROGRESS.md entries under different session IDs (backend vs frontend) — correct doctrine usage</li>
</ul>
<div><br></div>
<div>Once the <code>kes-tasks/</code> cleanup + FK confirmation land, this is mergeable. Items 3–7 are quality bar — best to land them before Aleem's design review so he reviews against the final state.</div>
<div><br></div>
<div>${ALI} — PR #2 (L3 + DB pool) is merged. Prod deploy deferred to after-hours per standing rule.</div>`;

const PR4_TODO_DESC = `<div>Code-review feedback from Ali's pass on PR #4 (POST /api/v1/leads, ${ALI ? '' : ''}Sai's Cloud Run → enterprise.colaberry.ai service-to-service ingest). PR is structurally sound but does not meet the project's Definition of Done. Address the blocker + 3 high-priority items, then re-request review.</div>
<div><br></div>
<div><strong>Blocking (CLAUDE.md Definition of Done)</strong></div>
<ol>
<li><strong>Zero tests shipped.</strong> 254 lines of new business logic + middleware with no test files. CLAUDE.md Test Strategy Framework requires happy path + failure path + boundary + idempotency tests for every feature. Compare with PR #2 (Anthropic L3) which ships 10 tests across 5 suites — that's the bar. Add at minimum: happy path (201 + new row), idempotency by strapi_lead_id+source (200 + same id), idempotency by email (200 + existing id), Zod validation failure (400), missing/wrong service token (401).</li>
</ol>
<div><br></div>
<div><strong>High priority</strong></div>
<ol>
<li><strong>Token comparison vulnerable to timing attack.</strong> <code>serviceAuthMiddleware.ts</code> line 20 uses <code>token !== env.enterpriseCrmToken</code>. Use <code>crypto.timingSafeEqual</code> with equal-length buffers instead. Standard practice for static-secret auth.</li>
<li><strong>No structured logging anywhere.</strong> CLAUDE.md Observability Framework treats this as required at every external boundary. Add JSON logs at: request start, request end, duration, auth failure, Zod validation failure, dedup hit (with which tier), create success, create failure. Copy the log helper pattern from your <code>anthropicCurriculumImpactAgent.ts</code> in PR #2.</li>
<li><strong>tsc verification gap.</strong> PROGRESS.md entry says "tsc --noEmit not runnable in local Bash env (node not in PATH); passes same structural check as prior PRs" — Definition of Done requires a concrete artifact, not a structural review. Please run <code>docker exec accelerator-backend npx tsc --noEmit</code> and paste the real result in the PROGRESS.md entry.</li>
</ol>
<div><br></div>
<div><strong>Design questions worth a one-line answer</strong></div>
<ol>
<li><strong>Email-dedup silently discards new attribution data.</strong> <code>externalLeadIngestService.ts</code> lines 34–40: if a lead exists by email, the function returns the existing row and throws away the incoming <code>strapi_attribution</code>, UTM updates, and <code>strapi_lead_id</code>. Real scenario: same person fills the training site form a second time from a new UTM campaign — the second-touch attribution is lost. Is this intentional (first-touch wins)? If yes, document it. If no, merge new attribution into the existing row's <code>strapi_attribution</code> JSONB.</li>
<li><strong>Email-dedup matches across all sources.</strong> The email lookup has no <code>source</code> filter — a lead that originally came in from <code>landing_page</code> will be returned as the "duplicate" for a <code>training.colaberry.com</code> POST. Combined with #1, this hides the training-site touch entirely. Intentional?</li>
</ol>
<div><br></div>
<div><strong>Low (style)</strong></div>
<ul>
<li><strong>Hardcoded enum values</strong> at <code>externalLeadIngestService.ts</code> lines 91–99 (<code>form_type: 'training_registration'</code>, <code>lead_source_type: 'warm'</code>, etc.) — pull these to module-top constants or a shared lead-enums file.</li>
<li><strong>Add a one-line comment</strong> explaining why warm-campaign auto-enrollment is skipped (the existing <code>EXTERNAL_SOURCES</code> exclusion in <code>leadService.ts</code> line 41 already handles it correctly, but a comment prevents a future "we forgot to enroll" bug).</li>
</ul>
<div><br></div>
<div><strong>What's good — keep this:</strong></div>
<ul>
<li>Clean route → middleware → controller → service → model layering</li>
<li>DB-level partial unique index + service-level idempotency check (belt + suspenders)</li>
<li>Idempotent migration SQL (<code>IF NOT EXISTS</code> on both column and index)</li>
<li>Zod schema validation at the boundary per Contract Enforcement rules</li>
<li>Rate limiter with sensible 300/min ceiling</li>
<li>Service auth correctly separated from user JWT auth</li>
<li>201 vs 200 distinction lets Sai differentiate create from idempotent retry — thoughtful</li>
<li><code>.env.example</code> updated with provisioning instructions</li>
</ul>
<div><br></div>
<div>Cutover hard deadline is 2026-06-23 (todo 9946500182). Plenty of runway to land the fixes + tests + logging this week. Once those ship, deploy is straightforward — migration + token gen + container restart.</div>
<div><br></div>
<div>Cross-PR pattern note: PR #2 (L3) is the quality standard. Bring this PR and PR #3 up to that bar — real tests, structured logging, error classes, timeouts.</div>`;

const PR4_TODO_TITLE = 'PR #4 review feedback: /api/v1/leads — add tests + logging + timing-safe token compare before merge';

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
    console.log(`Would POST comment to todo ${PR3_TODO_ID} (PR #3 review):`);
    console.log(`  ${PR3_COMMENT.length} chars`);
    console.log(`Would CREATE todo in list ${PR4_LIST_ID} (PR #4 follow-up):`);
    console.log(`  title: ${PR4_TODO_TITLE}`);
    console.log(`  description: ${PR4_TODO_DESC.length} chars`);
    console.log(`  assignee: Kes (${KES_PERSON_ID})`);
    console.log(`  due_on: 2026-06-10`);
    return;
  }

  // PR #3 — post comment on existing review todo
  const pr3Resp = await axios.post(
    `https://3.basecampapi.com/${ACCOUNT}/buckets/${BUCKET}/recordings/${PR3_TODO_ID}/comments.json`,
    { content: PR3_COMMENT },
    { headers: HEADERS },
  );
  console.log(`PR #3 comment posted: ${pr3Resp.data.app_url}`);

  // PR #4 — create a new follow-up todo
  const pr4Resp = await axios.post(
    `https://3.basecampapi.com/${ACCOUNT}/buckets/${BUCKET}/todolists/${PR4_LIST_ID}/todos.json`,
    {
      content: PR4_TODO_TITLE,
      description: PR4_TODO_DESC,
      assignee_ids: [KES_PERSON_ID],
      notify: true,
      due_on: '2026-06-10',
    },
    { headers: HEADERS },
  );
  console.log(`PR #4 todo created: ${pr4Resp.data.app_url}`);
})().catch((e) => {
  console.error('FAIL:', e.response?.data || e.message);
  process.exit(1);
});
