#!/usr/bin/env node
/**
 * add_launch_scaffolding.js - close the two gaps every story-build has shipped with.
 *
 * WHY THIS EXISTS
 * ---------------
 * Audited 2026-08-11 across the four Gov Contracts story-builds (VA ERP, Fairfax,
 * Detroit, Selective Service). Every one of them had a PROPOSAL track written to
 * deep-link a live demo at <slug>.colaberry.dev, and every one of those domains
 * was dead. Across 171 story tasks in those four lists there was not a single
 * task that deployed anything, and not one that created a code repository.
 *
 * The generated plan describes what to BUILD. It never describes where the code
 * LIVES or how it gets IN FRONT OF ANYONE. Both were assumed, so both were
 * skipped, and the builds stalled on a missing artifact nobody was assigned.
 * One intern spent 28 days blocked on a demo URL that no task had ever asked
 * anyone to create; another spent three weeks unable to push because no repo
 * existed, and her tooling defaulted to the production platform repo instead.
 *
 * Run this after publish_story_build.js on every new story-build.
 *
 * USAGE
 *   node add_launch_scaffolding.js \
 *     --bucket 47346103 --list 10068242125 \
 *     --builder 33056069 --project "VA ERP Integration" \
 *     --domain va-erp-demo.colaberry.dev --repo ColaberryIntern/va-erp-integration \
 *     --due 2026-08-17 [--dry]
 *
 * Idempotent: re-running skips any task it already created. Requires .bctok
 * (Ali-identity Basecamp token) in this directory, same as publish_story_build.js.
 */

const fs = require('fs');
const path = require('path');

const ALI = 17454835;
const ACCT = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const BC = `https://3.basecampapi.com/${ACCT}`;

function arg(flag, required = true) {
  const i = process.argv.indexOf(flag);
  const v = i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
  if (!v && required) { console.error(`missing required ${flag}`); process.exit(2); }
  return v;
}
const DRY = process.argv.includes('--dry');

const BUCKET = arg('--bucket');
const LIST = arg('--list');
const BUILDER = parseInt(arg('--builder'), 10);
const PROJECT = arg('--project');
const DOMAIN = arg('--domain');
const REPO = arg('--repo');
const DUE = arg('--due', false) || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

function token() {
  const p = path.resolve(__dirname, '.bctok');
  if (!fs.existsSync(p)) { console.error('no .bctok - pull the Ali token first (see SKILL.md step 0)'); process.exit(2); }
  return fs.readFileSync(p, 'utf8').trim().replace(/^Bearer\s+/i, '');
}
const H = { Authorization: 'Bearer ' + token(), 'User-Agent': 'Colaberry story-build scaffolding', Accept: 'application/json', 'Content-Type': 'application/json' };

async function get(u) { const r = await fetch(u.startsWith('http') ? u : BC + u, { headers: H }); return r.ok ? r.json() : null; }
async function post(u, body) {
  if (DRY) { console.log('[dry] POST', u, JSON.stringify(body).slice(0, 120)); return { id: 'dry', app_url: '(dry run)' }; }
  const r = await fetch(u.startsWith('http') ? u : BC + u, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${u} -> ${r.status} ${await r.text()}`);
  return r.json();
}

const HU = '\u{1F9D1}'; // human task marker, matches publish_story_build.js

const REPO_TASK = {
  title: `${HU} Create the code repository and push the first commit`,
  body: () => `<div>Before any story work lands, this build needs a repository of its own that Colaberry owns.</div>
<div><br></div>
<div><strong>Repository:</strong> <code>${REPO}</code></div>
<div><br></div>
<div><strong>Steps</strong></div>
<ul>
<li>Confirm you can push to it. If you have no write access, say so on this ticket immediately rather than working around it. That is a one-line fix, not a reason to stall.</li>
<li>Point your local checkout at it and push your existing history: <code>git remote set-url origin https://github.com/${REPO}.git</code> then <code>git push -u origin main</code>.</li>
<li>Commit early and often from here. Work that exists only on your laptop does not exist.</li>
</ul>
<div><br></div>
<div><strong>Never push this build to the production platform repository.</strong> If a tool or an agent session points itself there, stop and flag it. A bid build and the live product do not share a repository.</div>
<div><br></div>
<div><strong>Done when</strong> your history is pushed and you have posted the repo URL and latest commit SHA here.</div>`,
};

const DEPLOY_TASK = {
  title: `${HU} Deploy the working demo to ${DOMAIN}`,
  body: () => `<div>The proposal for ${PROJECT} deep-links a live pilot at <strong>${DOMAIN}</strong>. Until that URL resolves, the proposal cannot honestly cite it, and the whole track stays blocked on an artifact that does not exist.</div>
<div><br></div>
<div><strong>Do not work around this by citing a URL that is not up.</strong> An unreachable citation in a proposal document is a false claim.</div>
<div><br></div>
<div><strong>Steps</strong></div>
<ul>
<li>Confirm you have a host to deploy to and can add a DNS record. If not, say so here immediately.</li>
<li>Containerise the build so it starts from a clean checkout with one command.</li>
<li>Deploy, and point <strong>${DOMAIN}</strong> at it.</li>
<li>Serve over HTTPS with a valid certificate. A browser warning on a demo you are asking someone to click is worse than no demo.</li>
<li><strong>Seed synthetic data only.</strong> No real people, no real records. A public demo with real personal data is a breach, not a demo.</li>
<li>Smoke check from outside our network: the domain resolves, the page loads, the main flow works.</li>
</ul>
<div><br></div>
<div><strong>Done when</strong> ${DOMAIN} loads over HTTPS from a machine outside our network, the primary walkthrough works end to end, and you have posted the live URL plus a screenshot here.</div>`,
};

(async () => {
  const me = await get('/my/profile.json');
  if (!me || me.id !== ALI) { console.error(`HALT: token identity is ${me && me.id}, not Ali (${ALI}). Refusing to write.`); process.exit(3); }
  console.log(`identity ok: ${me.name}`);

  const groups = (await get(`/buckets/${BUCKET}/todolists/${LIST}/groups.json`)) || [];
  if (!Array.isArray(groups) || !groups.length) { console.error('no release groups on that list - is it a story-build list?'); process.exit(2); }

  const byIndex = groups
    .map((g) => ({ g, n: (String(g.title || '').match(/^\s*[RP](\d+)/i) || [])[1] }))
    .filter((x) => x.n !== undefined)
    .sort((a, b) => parseInt(a.n, 10) - parseInt(b.n, 10));

  const first = byIndex.length ? byIndex[0].g : groups[0];
  // Launch = the group literally named Launch, else the highest-numbered release.
  const launch = groups.find((g) => /launch/i.test(g.title || '')) || (byIndex.length ? byIndex[byIndex.length - 1].g : groups[groups.length - 1]);
  console.log(`repo task  -> "${first.title}"`);
  console.log(`deploy task-> "${launch.title}"`);

  for (const [group, task] of [[first, REPO_TASK], [launch, DEPLOY_TASK]]) {
    const existing = await get(`/buckets/${BUCKET}/todolists/${group.id}/todos.json`);
    const marker = task.title.replace(HU, '').trim().split(' ').slice(0, 4).join(' ');
    if (Array.isArray(existing) && existing.some((t) => (t.content || '').includes(marker))) {
      console.log(`SKIP (already present): ${task.title}`);
      continue;
    }
    const t = await post(`/buckets/${BUCKET}/todolists/${group.id}/todos.json`, {
      content: task.title,
      description: task.body(),
      due_on: DUE,
      assignee_ids: [BUILDER],
      notify: false,
    });
    console.log(`CREATED ${task.title}\n        ${t.app_url}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
