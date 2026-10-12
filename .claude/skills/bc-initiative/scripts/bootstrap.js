/* Driver: rebuild Colaberry Live tickets in the full contract format. DRY=1 writes nothing. */
const { api, render, GOV, PROJECT, ALI, PIYUSH, SOHAIL, ALEEM, DRY } = require('/tmp/clRebuild.js');
const { F, DONE, OPEN } = require('/tmp/clTickets.js');
const { OPEN2 } = require('/tmp/clTickets2.js');
const { OPEN3 } = require('/tmp/clTickets3.js');

const IDS = { ALI, PIYUSH, SOHAIL, ALEEM };
const GROUPS = [
  '00 - Control, Source of Truth and Governance',
  '01 - External Prerequisites and Accounts',
  '02 - Live Provider Spine',
  '03 - Session, Occurrence and Timeline',
  '04 - Viewer, Companion and Discovery',
  '05 - Studio, Equipment and OBS',
  '06 - AI Avatar and Voice',
  '07 - YouTube and Post Production',
  '08 - Documentation and Enablement',
  '09 - Rehearsal, Launch and Evidence',
];
// Ticket .g indexes into a RELEASE ordering; map it onto the group list above.
const GMAP = { 0: 1, 1: 2, 2: 3, 3: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9 };

const MASTER_INDEX = `
<div><strong>COLABERRY LIVE MASTER INDEX</strong></div>
<div>Read this before working any ticket. It is the entry point a Claude Code session needs; everything else is reachable from here.</div>
<div><br></div>
<div><strong>Mission.</strong> A class airs live inside the Colaberry portal rather than sending students to a meeting tab, with interaction, replay and distribution attached. Hard launch target 31 October 2026.</div>
<div><strong>Repository.</strong> ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator, branch workstream/colaberry-live. There is NO separate Colaberry Live repository and one must not be created.</div>
<div><br></div>
<div><strong>THE ONE RULE THAT MAKES THIS TRACKABLE</strong></div>
<div>Every ticket ends in a REVIEW STATE and STOPS. Claude never closes a ticket. Ali closes it after validating the artifact. The four states are: BLOCKED - ALI DECISION REQUIRED; READY FOR ALI REVIEW - DOCUMENT; READY FOR ALI REVIEW - PR OPEN; READY FOR ALI REVIEW - PROD VERIFIED. If a session finishes early it sets the state and stops rather than silently starting the next ticket. That is the difference between tracking the work and trusting the worker.</div>
<div><br></div>
<div><strong>Documents in this project</strong></div>
<ul>
<li>COLABERRY LIVE MASTER INDEX - this document</li>
<li>READ FIRST - Colaberry Live AI Operating Brief - session start, governance, blockers</li>
<li>Broadcast Architecture and Security Contract - what is built, and the contracts not to break</li>
<li>Current State Migration Ledger - evidence-based status of every phase</li>
</ul>
<div><strong>Artifact folders.</strong> Each ticket names the folder its artifact belongs in. Upload once to that folder and link it; never re-upload the same artifact into a second folder.</div>
<ul>
${Object.values(F).map((x) => `<li>${x}</li>`).join('')}
</ul>
<div><br></div>
<div><strong>Task id scheme.</strong> L1 external prerequisites · L4 viewer and measurement · L5 provider spine · L6 studio · L7 session and timeline · L8 distribution · L9 avatar and voice · L10 rehearsal and launch · L11 documentation. Every ticket lists its Dependencies and what it Blocks, so the order is readable without a Gantt chart.</div>
<div><br></div>
<div><strong>How to choose the next ticket.</strong> Highest priority UNBLOCKED ticket, by: launch blocker, then dependency unlock, then external prerequisite, then provider spine, then testability, then orchestration, then polish. Check Dependencies are closed before starting.</div>
<div><br></div>
<div><strong>Scheduling note.</strong> Studio equipment (L6.1) is dated first despite not being the spine, because hardware has shipping lead time that no later sprint can compress. The provider spine (L5.1 to L5.3) is the critical path for everything software.</div>
<div><br></div>
<div><strong>Current state, stated plainly.</strong> Phases 1 and 2 complete, Phase 3 mostly complete, Phases 4 to 7 not started. BROADCAST_ENABLED is false in every environment. NO BROADCAST HAS EVER AIRED - every capability claim is about code and tests, not a live event.</div>
`;

async function main() {
  console.log(DRY ? '=== DRY RUN ===\n' : '=== LIVE ===\n');
  const proj = await api('GET', `/projects/${PROJECT}.json`);
  const vault = proj.dock.find((d) => d.name === 'vault');
  const todoset = proj.dock.find((d) => d.name === 'todoset');
  console.log(`project: ${proj.name}\n`);

  // 1. trash the old, wrong-format list
  const lists = await api('GET', `/buckets/${PROJECT}/todosets/${todoset.id}/todolists.json`);
  for (const l of lists) {
    console.log(`1. trashing old list: ${l.title}`);
    await api('PUT', `/buckets/${PROJECT}/recordings/${l.id}/status/trashed.json`);
  }

  // 2. artifact folders
  console.log('\n2. artifact folders');
  for (const name of Object.values(F)) {
    await api('POST', `/buckets/${PROJECT}/vaults/${vault.id}/vaults.json`, { title: name });
    console.log(`   ${name}`);
  }

  // 3. master index
  console.log('\n3. master index');
  await api('POST', `/buckets/${PROJECT}/vaults/${vault.id}/documents.json`, {
    title: 'COLABERRY LIVE MASTER INDEX', content: MASTER_INDEX, status: 'active',
  });

  // 4. the list
  console.log('\n4. todolist');
  const list = await api('POST', `/buckets/${PROJECT}/todosets/${todoset.id}/todolists.json`, {
    name: 'Colaberry Live - build to 31 Oct 2026',
    description: 'Every ticket carries objective, context, execution prompt, acceptance criteria, named artifact and a REVIEW STATE. Claude works a ticket to a review state and STOPS; Ali closes it after validating the artifact. Dates are staggered by dependency, not parked on the deadline. Read COLABERRY LIVE MASTER INDEX first.',
  });

  const groupIds = {};
  for (let i = 0; i < GROUPS.length; i += 1) {
    const g = await api('POST', `/buckets/${PROJECT}/todolists/${list.id}/groups.json`, { name: GROUPS[i] });
    groupIds[i] = g.id;
  }

  // 5. tickets
  console.log('\n5. tickets');
  let open = 0, closed = 0;
  const ordered = [...OPEN, ...OPEN2, ...OPEN3].sort((a, b) => a.due.localeCompare(b.due));

  for (const t of ordered) {
    const gi = GMAP[t.g];
    const body = render({ ...t, skill: t.skill, prompt: t.prompt.replace('GOVPREFIX', GOV) });
    const todo = await api('POST', `/buckets/${PROJECT}/todolists/${groupIds[gi]}/todos.json`, {
      content: `${t.id} - ${t.t}`,
      description: body,
      assignee_ids: [IDS[t.who]],
      due_on: t.due,
    });
    open += 1;
    console.log(`   [ ] ${t.due}  ${t.pri}  ${t.id}  ${t.t.slice(0, 58)}`);
  }

  for (const d of DONE) {
    const gi = GMAP[d.g];
    const body = `<div><strong>MIGRATED COMPLETION EVIDENCE</strong></div><div>${d.ev}</div>`
      + `<div><br></div><div>Migrated from the pre-Basecamp build and closed on evidence. A tick in an older plan was never accepted as proof.</div>`;
    const todo = await api('POST', `/buckets/${PROJECT}/todolists/${groupIds[gi]}/todos.json`, {
      content: `${d.id} - ${d.t}`, description: body, assignee_ids: [IDS[d.who]],
    });
    await api('POST', `/buckets/${PROJECT}/todos/${todo.id}/completion.json`, {});
    closed += 1;
    console.log(`   [x] ${d.id}  ${d.t.slice(0, 64)}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`folders: ${Object.keys(F).length}  docs: +1 master index`);
  console.log(`tickets: ${open} open (full contract), ${closed} migrated-closed`);
  console.log(`dates:   ${ordered[0].due} .. ${ordered[ordered.length - 1].due}`);
  console.log(`url:     https://app.basecamp.com/3945211/projects/${PROJECT}`);
}
main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
