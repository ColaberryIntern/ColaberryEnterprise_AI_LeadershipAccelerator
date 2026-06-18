#!/usr/bin/env node
// sample-basecamp.js — smoke test proving this project now sees what CB System
// sees. Read-only. Run after setup:
//
//   BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/sampleBasecamp.js
//   # or on prod, with CCPP env present, no token needed:
//   node backend/src/scripts/sampleBasecamp.js

const path = require('path');
const bcPath = require('fs').existsSync(path.resolve(__dirname, 'lib/basecampClient.js'))
  ? './lib/basecampClient'
  : './basecampClient';
const {
  whoAmI, listProjects, listTodolists, listTodos, listPeople,
} = require(path.resolve(__dirname, bcPath));

(async () => {
  // 1. Who does this token authenticate as? This IS CB System's identity.
  const me = await whoAmI();
  console.log(`\n[whoAmI] Token authenticates as: ${me.name} <${me.email_address}> (id ${me.id})`);
  console.log('         Every project below is visible because THIS person is a member of it.');

  // 2. The full universe CB System can see.
  const projects = await listProjects();
  console.log(`\n[projects] ${projects.length} visible:`);
  projects.slice(0, 30).forEach((p) => console.log(`  - ${p.id}\t${p.name}`));
  if (projects.length > 30) console.log(`  ... and ${projects.length - 30} more`);

  if (!projects.length) {
    console.log('\nNo projects visible. The token owner is not a member of any project.');
    return;
  }

  // 3. Drill into the first project: its lists, a sample of todos, its people.
  const target = projects[0];
  console.log(`\n[drill] ${target.name} (${target.id})`);

  const lists = await listTodolists(target.id);
  console.log(`  to-do lists: ${lists.length}`);
  if (lists.length) {
    const list = lists[0];
    const todos = await listTodos(target.id, list.id);
    console.log(`  "${list.title}" has ${todos.length} open to-dos${todos.length ? ':' : ''}`);
    todos.slice(0, 5).forEach((t) => console.log(`    - ${t.content}${t.assignees && t.assignees.length ? ` [${t.assignees.map((a) => a.name).join(', ')}]` : ''}`));
  }

  const people = await listPeople(target.id);
  console.log(`  people on project: ${people.length} (${people.slice(0, 5).map((p) => p.name).join(', ')}${people.length > 5 ? ', ...' : ''})`);

  console.log('\nSmoke test passed. This project now sees what CB System sees.\n');
})().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
