#!/usr/bin/env node
// moveIntelGeneratorsToAliPersonal.js
//
// Basecamp 3's API has no cross-project move for a to-do list, so this rebuilds
// "Intelligence Generators (9) - BUILD" inside Ali Personal and then trashes the
// original. Safe to do here because the list carries 34 todos, 1 comment and a
// single assignee (Ali), so almost no history is at stake - that one comment is
// carried across verbatim rather than dropped.
//
// Order matters: build everything, verify the copy matches the source, and only
// then trash the original. A failure part-way leaves the source untouched.
//
//   node moveIntelGeneratorsToAliPersonal.js [--dry]

const fs = require('fs');

const ACCT = '3945211';
const SRC_BUCKET = 24865175;
const SRC_LIST = 10119444702;
const DEST_BUCKET = 7463955;          // Ali Personal
const DEST_TODOSET = 1041287213;
const ALI = 17454835;
const DRY = process.argv.includes('--dry');

const TOKEN = fs.readFileSync('/tmp/ali.tok', 'utf8').trim();
const H = { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'Colaberry (ali@colaberry.com)', Accept: 'application/json', 'Content-Type': 'application/json' };
const api = (p) => `https://3.basecampapi.com/${ACCT}${p}`;

async function get(p) { const r = await fetch(api(p), { headers: H }); return r.ok ? r.json() : null; }
async function post(p, body) {
  if (DRY) { console.log('  [dry] POST ' + p); return { id: 'dry', app_url: '(dry)' }; }
  const r = await fetch(api(p), { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  const me = await get('/my/profile.json');
  if (!me || me.id !== ALI) throw new Error(`HALT: token identity is ${me && me.id}, not Ali`);
  console.log('identity ok: ' + me.name);

  // ---- read the source ----------------------------------------------------
  const src = await get(`/buckets/${SRC_BUCKET}/todolists/${SRC_LIST}.json`);
  const groups = (await get(`/buckets/${SRC_BUCKET}/todolists/${SRC_LIST}/groups.json`)) || [];
  const plan = [];
  let srcTasks = 0, srcDone = 0;
  for (const grp of groups) {
    const open = (await get(`/buckets/${SRC_BUCKET}/todolists/${grp.id}/todos.json`)) || [];
    const closed = (await get(`/buckets/${SRC_BUCKET}/todolists/${grp.id}/todos.json?completed=true`)) || [];
    const todos = [...open, ...closed].sort((a, b) => (a.position || 0) - (b.position || 0));
    srcTasks += todos.length;
    srcDone += todos.filter((t) => t.completed).length;
    const carried = [];
    for (const t of todos) {
      let comments = [];
      if (t.comments_count > 0) comments = (await get(`/buckets/${SRC_BUCKET}/recordings/${t.id}/comments.json`)) || [];
      carried.push({ t, comments });
    }
    plan.push({ group: grp, todos: carried });
  }
  console.log(`source: ${groups.length} groups, ${srcTasks} todos (${srcDone} done)`);

  // ---- build the copy -----------------------------------------------------
  const banner = `<div><strong>Moved from the Internship / Apprenticeship project on 2026-08-12.</strong> This is Ali's own build, not an intern's, so it belongs here rather than on the internship board where it read as a stalled unowned project.</div>
<div><br></div>`;
  const newList = await post(`/buckets/${DEST_BUCKET}/todosets/${DEST_TODOSET}/todolists.json`, {
    name: src.name,
    description: banner + (src.description || ''),
  });
  console.log('created list: ' + newList.app_url);

  let madeTasks = 0, madeDone = 0, madeComments = 0;
  for (const { group, todos } of plan) {
    const g = await post(`/buckets/${DEST_BUCKET}/todolists/${newList.id}/groups.json`, { name: group.title });
    for (const { t, comments } of todos) {
      const body = {
        content: t.content,
        description: t.description || '',
        assignee_ids: [ALI],
        notify: false,
      };
      if (t.due_on) body.due_on = t.due_on;
      if (t.starts_on) body.starts_on = t.starts_on;
      const nt = await post(`/buckets/${DEST_BUCKET}/todolists/${g.id}/todos.json`, body);
      madeTasks++;
      for (const c of comments) {
        await post(`/buckets/${DEST_BUCKET}/recordings/${nt.id}/comments.json`, {
          content: `<div><em>Carried over from the original list, posted by ${c.creator && c.creator.name} on ${String(c.created_at).slice(0, 10)}:</em></div>${c.content}`,
        });
        madeComments++;
      }
      if (t.completed && !DRY) {
        const r = await fetch(api(`/buckets/${DEST_BUCKET}/todos/${nt.id}/completion.json`), { method: 'POST', headers: H });
        if (r.ok) madeDone++;
      }
    }
    console.log(`  ${group.title}: ${todos.length} todos`);
  }
  console.log(`copy: ${madeTasks} todos (${madeDone} completed), ${madeComments} comments carried`);

  // ---- verify BEFORE destroying anything ---------------------------------
  if (!DRY) {
    if (madeTasks !== srcTasks || madeDone !== srcDone) {
      console.error(`HALT: copy does not match source (${madeTasks}/${srcTasks} todos, ${madeDone}/${srcDone} done). Original left untouched.`);
      console.error('New list: ' + newList.app_url);
      process.exit(4);
    }
    await post(`/buckets/${SRC_BUCKET}/recordings/${SRC_LIST}/comments.json`, {
      content: `<div><strong>Moved to Ali Personal and trashed here.</strong> This was Ali's own build sitting on the internship board, where it read as a stalled unowned intern project. It now lives at <a href="${newList.app_url}">${newList.app_url}</a> with all ${srcTasks} todos and their completion state intact.</div>`,
    }).catch(() => {});
    const tr = await fetch(api(`/buckets/${SRC_BUCKET}/recordings/${SRC_LIST}/status/trashed.json`), { method: 'PUT', headers: H });
    console.log('original trashed: ' + (tr.ok ? 'yes' : 'FAILED ' + tr.status + ' (new list still valid)'));
  }
  console.log('\nNEW LIST: ' + newList.app_url);
})().catch((e) => { console.error(e.message); process.exit(1); });
