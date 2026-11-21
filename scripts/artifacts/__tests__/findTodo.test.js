// T03: the attach tool must resolve a ticket by code whether it is open or already completed.
// Run: node --test scripts/artifacts/__tests__/
const test = require('node:test');
const assert = require('node:assert/strict');
const { listTicketTodos, resolveTicket } = require('../attachArtifactToTicket');

// A fake `listAll`: Basecamp lists open to-dos at todos.json and completed ones only at todos.json?completed=true.
function fakeList({ groups = [{ id: 1 }], open = {}, done = {} } = {}) {
  const calls = [];
  const list = async (p) => {
    calls.push(p);
    if (p.endsWith('/groups.json')) return groups;
    const g = Number(p.match(/todolists\/(\d+)\/todos/)[1]);
    return (p.includes('completed=true') ? done[g] : open[g]) || [];
  };
  return { list, calls };
}

test('an OPEN ticket resolves by code (unchanged behavior)', async () => {
  const { list } = fakeList({ open: { 1: [{ id: 11, title: 'CP6.1 inbox' }] } });
  assert.equal(await resolveTicket({ ticketCode: 'CP6.1' }, list), 11);
});

test('a COMPLETED ticket resolves by code (the bug: it used to match 0)', async () => {
  const { list, calls } = fakeList({ done: { 1: [{ id: 22, title: 'CP5.5 ship' }] } });
  assert.equal(await resolveTicket({ ticketCode: 'CP5.5', ticketId: 22 }, list), 22);
  assert.ok(calls.some((p) => p.endsWith('/todolists/1/todos.json?completed=true')));
});

test('both listings are read for every group, and an id seen twice counts once', async () => {
  const t = { id: 33, title: 'CP8.1 states' };
  const { list, calls } = fakeList({ groups: [{ id: 1 }, { id: 2 }], open: { 2: [t] }, done: { 2: [t] } });
  const all = await listTicketTodos(list);
  assert.deepEqual(all.map((x) => x.id), [33]);
  assert.equal(calls.filter((p) => p.includes('/todos.json')).length, 4);
});

test('a list with no groups falls back to the list itself, open and completed', async () => {
  const { list, calls } = fakeList({ groups: [], done: { 10406233777: [{ id: 44, title: 'AF3.2 x' }] } });
  assert.equal(await resolveTicket({ ticketCode: 'AF3.2' }, list), 44);
  assert.ok(calls.includes('/buckets/7463955/todolists/10406233777/todos.json?completed=true'));
});

test('a missing code is a clear error, not a guess', async () => {
  const { list } = fakeList({ open: { 1: [{ id: 11, title: 'CP6.1 inbox' }] } });
  await assert.rejects(resolveTicket({ ticketCode: 'CP9.9' }, list), /CP9\.9 matched 0 tickets, expected exactly 1/);
});

test('a spec id that disagrees with the resolved ticket is refused', async () => {
  const { list } = fakeList({ done: { 1: [{ id: 22, title: 'CP5.5 ship' }] } });
  await assert.rejects(resolveTicket({ ticketCode: 'CP5.5', ticketId: 99 }, list), /resolves to 22 but the spec says 99/);
});
