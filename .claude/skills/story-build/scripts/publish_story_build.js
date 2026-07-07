#!/usr/bin/env node
// Generalized Story-Driven Build publisher (locked-in process).
// Reads ONE config, gates the generated plan, then publishes a single story-driven
// to-do list to Basecamp: per-release groups, each story a to-do with the AI/Human
// split, assigned to the builder (optionally co-assigned to a marketing specialist),
// plus milestone approval gates for an approver, plus 5 linked Docs & Files.
// Refuses to publish unless all four gates pass. Guards that the token is Ali first.
//
// Usage:  node publish_story_build.js story_configs/<slug>.json
// Needs:  .bctok (Ali Basecamp token) beside this script; <slug>-deep-plan.json (from gen) beside this script.
const fs = require('fs'), path = require('path');
const HERE = __dirname;
const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: node publish_story_build.js <config.json>'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(HERE, `${cfg.slug}-deep-plan.json`), 'utf8'));
const TOK = fs.readFileSync(path.join(HERE, '.bctok'), 'utf8').trim();
const BC = 'https://3.basecampapi.com/3945211';
const H = { Authorization: 'Bearer ' + TOK, 'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)', 'Content-Type': 'application/json' };
const ALI = 17454835;                                   // identity guard: writes must be Ali
const NAME = cfg.short_name || cfg.project_name;
const DEMO = cfg.demo_url || '';
const BUILDER = cfg.builder_id;                          // owns every build task
const APPROVER = cfg.approver_id;                        // owns milestone approvals
const APPROVER_LABEL = cfg.approver_label || 'Approver';
const APPROVER_MODE = cfg.approver_mode || 'per-release';// 'per-release' | 'phase-gates'
const MKT_CO = cfg.marketing_co_assignee_id || null;     // optional co-assignee on marketing tasks
const MKT_LABEL = cfg.marketing_co_label || 'Marketing';

// ---- 4 gates ----
const j = JSON.stringify(plan), t = plan.trace || {};
const nc = (j.match(/bubble|retool|make\.com|zapier|airtable|contentful|no-code|low-code|minimal[ -]code/gi) || []).length;
const code = (j.match(/react|node|express|postgres|docker/gi) || []).length;
const pass = nc === 0 && plan.story_count >= 12 && (plan.releases || []).length >= 3 && t.ok === true && code > 10;
console.log(`[gate] no-code=${nc} stories=${plan.story_count} rel=${(plan.releases||[]).length} trace.ok=${t.ok} code=${code} -> ${pass ? 'PASS' : 'BLOCKED'}`);
if (!pass) { console.error('BLOCKED: re-run the generator; do not hand-fix the plan.'); process.exit(2); }

// ---- classification + rendering ----
const HUMAN = ["decide","decision","approve","approval","sign off","sign-off","signoff","stakeholder","interview","credential","api key","budget","hire","legal","compliance","contract","kickoff","kick-off","gather requirement","select a vendor","choose a vendor","provide access"];
const classify = s => { const x = `${s.title||''} ${s.narrative||''} ${s.build||''}`.toLowerCase(); return HUMAN.some(g => x.includes(g)) ? 'human' : 'ai'; };
const MKTG = /(content|social|post|campaign|email|brand|prompt|audience|engagement|personaliz|segment|template|publish|market|schedul|caption|hashtag|creative|copy|newsletter)/i;
const isMktg = s => !!MKT_CO && MKTG.test(`${s.title||''} ${s.narrative||''} ${s.build||''}`);
const AI = '🤖', HU = '🧑';           // robot / person
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function mdHtml(md){const o=[];for(const line of String(md||'').split('\n')){const l=line.replace(/\s+$/,'');if(!l){o.push('<br>');continue;}const m=l.match(/^(#{1,4})\s+(.*)/);if(m){o.push(`<h${Math.min(m[1].length,3)}>${esc(m[2])}</h${Math.min(m[1].length,3)}>`);continue;}const ls=l.replace(/^\s+/,'');if(ls.startsWith('- ')||ls.startsWith('* ')){o.push(`<li>${esc(ls.slice(2))}</li>`);continue;}o.push(`<div>${esc(l).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</div>`);}return o.join('');}
const sliceStr = sl => !sl ? '' : (typeof sl === 'object' ? [sl.command, sl.event, sl.read_model].filter(Boolean).join(' -> ') : String(sl));
function gherkin(acc){const it=(acc||[]).map(a=>{const sh=a.trust?'🛡 ':'';const c=[];if(a.given)c.push(`<em>Given</em> ${esc(a.given)}`);if(a.when)c.push(`<em>When</em> ${esc(a.when)}`);c.push(`<em>Then</em> ${esc(a.then)}`);return `<li>${sh}<strong>${esc(a.scenario)}</strong> - ${c.join('; ')}</li>`;});return it.length?`<ul>${it.join('')}</ul>`:'';}
function storyHtml(s, docLinks, kind, mktg) {
  const emoji = kind === 'ai' ? AI : HU, tag = kind === 'ai' ? '[AI]' : '[Human]';
  const kl = kind === 'ai' ? 'AI-buildable: the AI drafts it (Claude Code), you review and approve' : 'Human task: you own this one';
  const rows = [`<div><strong>${emoji} ${tag}</strong> ${kl}${mktg ? ` &nbsp; <strong>[${esc(MKT_LABEL)}]</strong> co-assigned (accounts, prompts, content)` : ''}</div>`,
    `<div><strong>Story:</strong> ${esc(s.narrative)}</div>`,
    `<div><strong>Fulfills:</strong> ${(s.fulfills||[]).map(f=>`<code>${esc(f)}</code>`).join(' ')||'-'} &nbsp;·&nbsp; <strong>Owner agent:</strong> ${esc(s.owner_agent||'-')}</div>`];
  const sl = sliceStr(s.slice); if (sl) rows.push(`<div><strong>Slice:</strong> <code>${esc(sl)}</code></div>`);
  rows.push('<div><strong>Acceptance (Gherkin = demo script + loop stop):</strong></div>', gherkin(s.acceptance));
  if (s.build) rows.push(`<div><strong>Build (Claude Code):</strong> ${esc(s.build)}</div>`);
  if (s.vibe) rows.push(`<div><strong>Vibe-code it:</strong> <em>${esc(s.vibe)}</em></div>`);
  if (s.trust) rows.push(`<div><strong>Trust (TBI):</strong> ${esc(s.trust)} &nbsp; <strong>Loop stop:</strong> all acceptance scenarios pass.</div>`);
  if (docLinks) rows.push(docLinks);
  return rows.join('');
}
function weekdays(a,b){const o=[];let d=new Date(a+'T00:00:00Z');const e=new Date(b+'T00:00:00Z');while(d<=e){const w=d.getUTCDay();if(w>=1&&w<=5)o.push(d.toISOString().slice(0,10));d=new Date(d.getTime()+86400000);}return o;}
const DAYS = weekdays(cfg.start_date, cfg.end_date);
const spread = k => k <= 0 ? [] : (k === 1 ? [DAYS[DAYS.length-1]] : Array.from({length:k},(_,i)=>DAYS[Math.min(DAYS.length-1,Math.round(i*(DAYS.length-1)/(k-1)))]));
async function req(method, url, body) { const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error(`${method} ${r.status} ${(await r.text()).slice(0,180)}`); return r.status === 204 ? {} : r.json(); }
const post = (url, body) => req('POST', url, body);

async function resolveTarget() {
  const tgt = cfg.target || {};
  if (tgt.mode === 'create') {
    const p = await post(`${BC}/projects.json`, { name: cfg.project_name, description: cfg.project_description || `${NAME} - story-driven build.` });
    const dock = p.dock || [];
    const todoset = (dock.find(d => d.name === 'todoset') || {}).id;
    const vault = (dock.find(d => d.name === 'vault') || {}).id;
    if (Array.isArray(tgt.grant_ids) && tgt.grant_ids.length) await req('PUT', `${BC}/projects/${p.id}/people/users.json`, { grant: tgt.grant_ids });
    console.log('CREATED project', p.app_url);
    return { bucket: p.id, todoset, vault, url: p.app_url };
  }
  return { bucket: tgt.bucket, todoset: tgt.todoset, vault: tgt.vault, url: tgt.url || `${BC}/projects/${tgt.bucket}` };
}

(async () => {
  // identity guard -- never write as anyone but Ali
  const me = await req('GET', `${BC}/my/profile.json`);
  if (me.id !== ALI) { console.error(`HALT: token identity is ${me.id} (${me.name}), not Ali (${ALI}). Refusing to write.`); process.exit(3); }

  const { bucket, todoset, vault, url } = await resolveTarget();
  const releases = plan.releases || [];
  // The list description must explain the project to a reader with ZERO context:
  // what it is (the idea verbatim), what we are building, how the list works, and
  // where the detail lives -- never just process shorthand.
  const builderLabel = cfg.builder_label || 'The assigned builder';
  const approverLine = APPROVER_MODE === 'per-release'
    ? `${esc(APPROVER_LABEL)} approves every milestone (one gate per release) before the team moves on.`
    : `${esc(APPROVER_LABEL)} approves at four high-level phase gates before the team moves to the next phase.`;
  const mktLine = MKT_CO ? `<li><strong>Marketing:</strong> ${esc(MKT_LABEL)} advises on accounts, prompts, and content direction.</li>` : '';
  const ov = [
    `<div><strong>What this is.</strong> ${esc(cfg.idea)}</div>`,
    `<div><strong>What we are actually building.</strong> A real, working web application built with Claude Code (React front end, Node/Express API, PostgreSQL, containerized with Docker), deployed to a live demo${DEMO ? ' at ' + esc(DEMO) : ''}. Not slides, not a mockup: a running product built from the stories below.</div>`,
    `<div><strong>How this list works.</strong> Every item is a user story - a small, demoable slice of the product with plain-English acceptance criteria (the "done when"). Stories are grouped into releases, from R0 (a thin end-to-end walking skeleton) through launch; each release is something you can watch run. Work top to bottom.</div>`,
    `<ul><li><strong>${AI} [AI]</strong> tasks are AI-buildable: Claude Code drafts them, the owner reviews and approves.</li>`,
    `<li><strong>${HU} [Human]</strong> tasks need a person: a decision, a credential, an account, or a judgment call.</li>`,
    `<li><strong>Builder:</strong> ${builderLabel} owns and builds every task.</li>`,
    `<li><strong>Approvals:</strong> ${approverLine}</li>${mktLine}</ul>`,
    `<div><strong>Where the detail lives.</strong> Every task links the five project documents in Docs & Files (Requirements, Architecture and Agent Map, Trust/TBI Primer, Build Guide, Traceability Matrix), so anyone on any machine can pick up a task and know exactly what to build and how it fits. A task is <strong>done</strong> when its acceptance criteria pass and the feature runs in the deployed demo.</div>`,
  ].join('');
  const list = await post(`${BC}/buckets/${bucket}/todosets/${todoset}/todolists.json`, { name: cfg.list_name, description: ov });
  console.log('LIST', list.app_url);

  const docUrls = [];
  for (const [title, key] of [['Requirements','requirements'],['Architecture & Agent Map','architecture'],['Trust (TBI) Primer','tbi_primer'],['Build Guide','build_guide'],['Traceability Matrix','rtm']]) {
    if (!plan[key]) continue;
    const d = await post(`${BC}/buckets/${bucket}/vaults/${vault}/documents.json`, { title: `${NAME} - ${title}`, content: mdHtml(plan[key]), status: 'active' });
    docUrls.push([`${NAME} - ${title}`, d.app_url]);
  }
  const docLinks = docUrls.length ? `<div><strong>📎 Project documents:</strong></div><ul>${docUrls.map(([t2,u])=>`<li><a href="${u}">${esc(t2)}</a></li>`).join('')}</ul>` : '';

  const idx = {}; for (const s of (plan.stories||[])) idx[s.id] = s;
  const ordered = []; for (const r of releases) for (const sid of (r.stories||[])) if (idx[sid]) ordered.push(sid);
  const dues = spread(ordered.length), dueOf = {}; ordered.forEach((sid,i)=>dueOf[sid]=dues[i]);

  let created = 0, ai = 0, hu = 0, mkt = 0; const relEnd = {};
  for (const r of releases) {
    const g = await post(`${BC}/buckets/${bucket}/todolists/${list.id}/groups.json`, { name: `${(r.key||'').toUpperCase()} - ${r.name||''}` });
    for (const sid of (r.stories||[])) {
      const s = idx[sid]; if (!s) continue;
      const kind = classify(s), mktg = isMktg(s); if (kind === 'ai') ai++; else hu++; if (mktg) mkt++;
      relEnd[r.key] = dueOf[sid] || relEnd[r.key];
      const content = (`${kind==='ai'?AI:HU} ${sid} - ${s.title||''}${s.owner_agent?'  ['+s.owner_agent+']':''}`).slice(0, 230);
      const assignees = mktg ? [BUILDER, MKT_CO] : [BUILDER];
      await post(`${BC}/buckets/${bucket}/todolists/${g.id}/todos.json`, { content, description: storyHtml(s, docLinks, kind, mktg), due_on: dueOf[sid], assignee_ids: assignees });
      created++;
    }
  }

  // ---- approver gates ----
  const ag = await post(`${BC}/buckets/${bucket}/todolists/${list.id}/groups.json`, { name: `MILESTONE APPROVALS - ${APPROVER_LABEL}` });
  let gates = 0;
  if (APPROVER_MODE === 'per-release') {
    for (const r of releases) {
      const key = (r.key||'').toUpperCase();
      const desc = `<div><strong>Milestone approval gate for ${esc(APPROVER_LABEL)}.</strong> Review the ${key} demo and approve before the team proceeds.</div>${r.goal?`<div><strong>Goal:</strong> ${esc(r.goal)}</div>`:''}${r.demo?`<div><strong>Demo:</strong> ${esc(r.demo)}</div>`:''}<div><strong>Approve when:</strong> the milestone demo runs, the direction fits the vision, and the trust controls hold. Comment "approved" and check the box.</div>${docLinks}`;
      await post(`${BC}/buckets/${bucket}/todolists/${ag.id}/todos.json`, { content: `${HU} ${APPROVER_LABEL} approves milestone ${key}: ${r.name||''}`.slice(0,230), description: desc, due_on: relEnd[r.key] || DAYS[DAYS.length-1], assignee_ids: [APPROVER] });
      gates++;
    }
  } else { // phase-gates: 4 consolidated gates across the window
    const n = releases.length, per = Math.ceil(n / 4);
    const gd = spread(4).length === 4 ? spread(4) : [DAYS[0], DAYS[Math.floor(DAYS.length/3)], DAYS[Math.floor(2*DAYS.length/3)], DAYS[DAYS.length-1]];
    const labels = ['Foundation', 'Core + reliability', 'Data, polish + hardening', 'Launch readiness + go-live'];
    for (let ph = 0; ph < 4; ph++) {
      const rel = releases.slice(ph*per, (ph+1)*per); if (!rel.length) continue;
      const cover = rel.map(r => `${(r.key||'').toUpperCase()} ${r.name||''}`).join('; ');
      const desc = `<div><strong>High-level approval gate for ${esc(APPROVER_LABEL)}.</strong> Review the phase demo and approve so the team proceeds. You do not need to read every task; the builder owns the detail.</div><div><strong>Covers:</strong> ${esc(cover)}</div><div><strong>Approve when:</strong> the phase demo runs and you are satisfied with direction, quality, and trust controls. Comment "approved" and check the box.</div>${docLinks}`;
      await post(`${BC}/buckets/${bucket}/todolists/${ag.id}/todos.json`, { content: `${HU} Approve Phase ${ph+1} (${labels[ph]}): ${rel.map(r=>(r.key||'').toUpperCase()).join(', ')}`.slice(0,230), description: desc, due_on: gd[ph], assignee_ids: [APPROVER] });
      gates++;
    }
  }

  console.log(`DONE list=${list.id} groups=${releases.length + 1} stories=${created} ai=${ai} human=${hu}${MKT_CO?` marketing(co)=${mkt}`:''} ${APPROVER_LABEL}_gates=${gates} docs=${docUrls.length}`);
  fs.writeFileSync(path.join(HERE, `${cfg.slug}-published.json`), JSON.stringify({ projectUrl: url, listId: list.id, listUrl: list.app_url, created, ai, hu, mkt, gates, docs: docUrls }, null, 2));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
