/**
 * Post a corrected-scope comment on the six ungrouped Agent Factory tickets that STAY OPEN
 * after the 28 Nov audit.
 *
 * These tickets are between 3 and 24 days old and several of them describe the system as it
 * was rather than as it is. A ticket whose premise has drifted wastes the next reader's time
 * in exactly the way the eight closed today did, so each one gets the re-measurement rather
 * than being left to go stale again.
 *
 * It COMMENTS ONLY. Nothing here completes, re-dates or re-scopes a ticket, because none of
 * these is finished and the scope changes below are observations, not decisions.
 *
 *   DRY (default)  docker exec -w /app accelerator-backend node /tmp/commentKeepers.js
 *   APPLY          ... node /tmp/commentKeepers.js --apply
 */
'use strict';

const ACCOUNT = '3945211';
const BUCKET = Number(process.env.BUCKET || 7463955);
const API = `https://3.basecampapi.com/${ACCOUNT}/buckets/${BUCKET}`;
// Generic client name: never a personal address in a request to an outside service.
const UA = 'Colaberry AI Ops';
const APPLY = process.argv.includes('--apply');
/** Written into every comment so a second run is visible as a duplicate rather than silent. */
const MARK = 'AUDIT RE-VERIFICATION, 28 Nov 2026';

let TOKEN = null;
async function tok() {
  if (!TOKEN) TOKEN = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  return TOKEN;
}
async function api(method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${await tok()}`,
      'User-Agent': UA,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const P = (s) => `<div>${s}</div>`;
const BR = '<div><br></div>';
const head = (verdict) => P(`<strong>${MARK}.</strong> ${verdict}`);

const KEEPERS = [
  {
    code: 'AF12.6',
    id: 10476528230,
    body: [
      head('Re-checked against origin/main. The defect stands, unchanged, and the scope is exactly as written.'),
      BR,
      P('<strong>MEASURED.</strong> nginx/ on main holds eleven files and every one of them is the CONTAINER layer. There is no file named advisor, growth-landjet, opportunity-pulse or refactored, no sites-available or sites-enabled file anywhere in the tree, and no installer: nothing in the repo writes, syncs or checks the host /etc/nginx.'),
      BR,
      P('<strong>THE REPO STILL DOCUMENTS THE GAP RATHER THAN CLOSING IT.</strong> nginx/nginx.conf:207-209 carries the two-layer note, and nginx/hire-refactored.conf:5-9 says in its own words that the host file "is not in this repository, like the www.refactored.ai one". So the 2 Nov upload-limit fix still lives only on the host and a rebuild still reverts it.'),
      BR,
      P('<strong>NOT RE-CHECKED:</strong> what those host files currently contain. That is host state rather than code, and this pass read only git.'),
    ].join(''),
  },
  {
    code: 'AF12.9',
    id: 10477835251,
    body: [
      head('Re-checked. The defect stands, and the question this ticket said to answer BEFORE building anything is now answered: it is a mechanism nobody triggers, in every case, not a surface with no writer.'),
      BR,
      P('<strong>MEASURED IN PRODUCTION, 28 Nov.</strong> project_artifacts 4 rows, newest 22 May. artifacts 0. showcase_artifacts 0. story_artifact_verifications 0. Unchanged since this ticket was written.'),
      BR,
      P('<strong>EVERY WRITE PATH, AND WHY EACH IS DARK.</strong> project_artifacts has a live writer reached from requirements generation, which is what produced the four rows, and it writes a generated SRS rather than a builder document. A second project_artifacts writer sits behind POST /api/portal/project/compile with zero frontend callers. artifacts and showcase_artifacts both have scaffold and draft routes with zero frontend callers. So four surfaces, four real writers, no caller.'),
      BR,
      P('<strong>THE ONE THAT MATTERS.</strong> story_artifact_verifications is fed by the one mechanism that genuinely reads a builder own repo tree and records what was handed over, and it rides the existing push webhook rather than needing a new trigger. It is switched OFF: the mode defaults to off and STORY_ARTIFACT_VERIFICATION appears in no committed deploy config. That is a much smaller next step than this ticket assumed.'),
      BR,
      P('<strong>AND THE STORE WAS NEVER THE RIGHT ONE.</strong> runtime_portfolio_artifacts holds 1,018 rows across 65 projects. project_artifacts holding four does not mean students produce nothing; it means the registry points at the wrong table. An admin route added since this ticket says so in its own comment.'),
      BR,
      P('<strong>NOT DONE HERE.</strong> Turning that flag on is a production environment change, which is escalate-tier under CLAUDE.md. It is a recommendation, not something this audit did.'),
    ].join(''),
  },
  {
    code: 'AF12.11',
    id: 10486568419,
    body: [
      head('Re-checked from both ends. The defect stands and is WORSE than this ticket states.'),
      BR,
      P('<strong>PRODUCTION, 28 Nov.</strong> agent_domain_build_authorizations holds 0 rows. Unchanged.'),
      BR,
      P('<strong>ONE CORRECTION TO THE TICKET.</strong> The path is backend/src/routes/admin/agentDomainRoutes.ts, not backend/src/routes/agentDomainRoutes.ts. Everything else in the ticket holds: twelve route registrations, all router.get, zero POST, PUT, PATCH or DELETE, and no router.all or nested use that could smuggle one in. The two authorization routes say in their own comment that they are the gate only live caller.'),
      BR,
      P('<strong>STRONGER THAN THE TICKET CLAIMED.</strong> There is no INSERT INTO agent_domain_build_authorizations anywhere in the repository, and no Sequelize model for the table at all. BuildAuthorization.ts is the unrelated gov one, on table build_authorizations. So the grant has no write path rather than merely no endpoint, and building a button would not be enough.'),
      BR,
      P('<strong>AND IT IS STILL NOT ENFORCED.</strong> assertAgentDomainBuildAuthorized has exactly one caller in the whole repo, inside its own module, which catches the refusal and turns it into a JSON field. Nothing that performs or starts a build consults it. The frontend can display the count and cannot create one.'),
    ].join(''),
  },
  {
    code: 'AF12.14',
    id: 10497487838,
    body: [
      head('Re-checked. The defect stands, and something has changed around it that does not fix it but should be on the record.'),
      BR,
      P('<strong>THE GUARD IS UNCHANGED.</strong> agentChangeRequestService.ts:447-448 still loads the caller domains and throws DomainNotYoursError on anything else, and it survived a 25 Nov edit to that same file. There is exactly one row-creating call for agent_domain_change_requests in the repo, downstream of that guard: no admin route, no file-on-behalf route, no bulk path, no seed, no raw INSERT.'),
      BR,
      P('<strong>PRODUCTION AGREES.</strong> Seven change requests exist and every one was filed by the owner of the domain it targets. Zero cross-domain, which is what you would expect when the only path forbids it.'),
      BR,
      P('<strong>WHAT IS NEW SINCE THIS TICKET.</strong> POST /api/admin/agent-domain/bug-report now exists, has no ownership check of any kind, and is reachable by builders because it is classified on the dashboard section. It is genuinely cross-domain. It does NOT satisfy this ticket: it writes marketing_bug_reports, so the filing never appears in the target domain owner queue; it has no status and no decider, so there is nothing to approve or decline; and it emails a global list, so the target domain owner is never computed and never notified. The filer is recorded as a reporter, not as a proposer.'),
      BR,
      P('<strong>SO THE SHAPE OF THE REMAINING WORK HAS NARROWED.</strong> A channel exists. What is missing is that it routes to an owner and carries a decision, with the proposer kept distinct from the decider.'),
    ].join(''),
  },
  {
    code: 'Standup write-on-load',
    id: 10543479882,
    body: [
      head('Re-checked against origin/main. The defect stands, unchanged, line for line.'),
      BR,
      P('<strong>MEASURED.</strong> WorkforceOSPage.tsx:67-72 still fires POST /api/admin/workforce/meeting/daily inside the same Promise.all as its four reads, and :78 still calls load() from a mount effect. The code self-description at :48-50 is still there, and it is still accurate: only the timeline poll was isolated from load(), never the mount.'),
      BR,
      P('<strong>THE BUTTON IS NOT A SEPARATE PATH.</strong> The Run standup button at :100 calls the same load(), so the explicit route and the accidental one are the same function.'),
      BR,
      P('<strong>NO TEST GUARDS IT, AND THE EXISTING TEST ACCEPTS IT.</strong> The smoke test mocks api.post to always resolve, and its only POST assertion pins that the 45-second poll adds no SECOND standup. That treats the write on mount as the baseline rather than as the defect, so the suite would stay green through any fix and through any regression.'),
    ].join(''),
  },
  {
    code: 'Step 0.1',
    id: 10544865001,
    body: [
      head('Re-checked. HALF of this ticket is done and half is not, so the scope is now narrower than when it was written.'),
      BR,
      P('<strong>DONE.</strong> The second half, five builders repos missing the ladder stories, shipped: PR #4409 delivers the published plan to a builder repo without waiting for them to press Sync, merged 25 Nov and confirmed in the image production is running.'),
      BR,
      P('<strong>NOT DONE, AND THIS IS THE WHOLE OF WHAT REMAINS.</strong> builderPathApi.ts still exports exactly two things: fetchBuilderPathBoard, a GET, and errorMessage, a string helper. No frontend file anywhere reaches POST /api/admin/agent-domain-candidates-mine, and the two sibling PATCH writes are equally unreachable. agent_domain_candidates still holds 0 rows across all ten domains, measured 28 Nov.'),
      BR,
      P('<strong>THE BACKEND IS NOT THE PROBLEM.</strong> The write is live and correctly gated: it sits behind the dashboard section every builder holds, and it refuses a domain the caller does not build. It simply has no caller.'),
      BR,
      P('<strong>SO THIS IS A DECISION, NOT A DIAGNOSIS.</strong> Build the propose-a-candidate control on the Builder Path page, or seed each domain list once by script and let the ladder run from there. Until one of those happens, step 0.1 cannot start for any builder, which makes this the single most blocking item on the list.'),
    ].join(''),
  },
];

async function main() {
  console.log(APPLY ? '[keepers] APPLYING' : '[keepers] DRY RUN - nothing will be written');
  let posted = 0;
  let skipped = 0;

  for (const k of KEEPERS) {
    const todo = await api('GET', `/todos/${k.id}.json`);
    if (todo.completed) {
      console.log(`\n${k.code}: todo is COMPLETED, refusing to comment on a closed ticket`);
      skipped += 1;
      continue;
    }
    // A second run must not post the same note twice.
    const comments = await api('GET', `/recordings/${k.id}/comments.json`);
    if (comments.some((c) => String(c.content || '').includes(MARK))) {
      console.log(`\n${k.code}: re-verification note already present, skipping`);
      skipped += 1;
      continue;
    }
    console.log(`\n${k.code} (todo ${k.id}) - ${k.body.length} chars, ${comments.length} existing comment(s)`);
    if (!APPLY) continue;
    await api('POST', `/recordings/${k.id}/comments.json`, { content: k.body });
    console.log('  posted');
    posted += 1;
  }

  console.log(`\n[keepers] ${APPLY ? 'posted' : 'would post'} ${APPLY ? posted : KEEPERS.length - skipped}, skipped ${skipped}`);
}
main().catch((e) => { console.error('[keepers] FAILED: ' + e.message); process.exitCode = 1; });
