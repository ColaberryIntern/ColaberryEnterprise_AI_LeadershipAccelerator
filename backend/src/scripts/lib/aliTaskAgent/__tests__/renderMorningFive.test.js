/**
 * renderMorningFive (the ten, ranked by impact) and the task prompt a Copy button carries.
 */
const { renderMorningFive } = require('../renderMorningFive');
const { buildTaskPrompt } = require('../promptBuilder');

const task = (over = {}) => ({
  id: '49506070/10481592064', title: 'Internal debrief of the MAPLOCA call', url: 'https://app.basecamp.com/3945211/buckets/49506070/todos/10481592064',
  path: 'Client delivery / MAPLOCA / 1. RFP Response', dueOn: '2026-11-06', late: 5, score: 75,
  disposition: 'ask', dispositionReason: 'the mirror classifies this as human_required', category: 'human_required',
  isDecision: false, humanOnly: false, summary: 'Ram asked for a debrief.', doneWhen: 'two PDFs on the ticket',
  reasons: [{ pts: 50, why: '5 days overdue' }, { pts: 15, why: 'marked as needing you' }], ...over,
});

/** A feed item as morningFeed builds it, plus the copy link ataMorningFive attaches. */
const feedItem = (over = {}) => ({
  rank: 1, golden: false, kind: 'task', id: '49506070/1', title: 'Internal debrief', url: 'https://app.basecamp.com/3945211/buckets/49506070/todos/1',
  path: 'Client delivery / MAPLOCA / 1. RFP Response', score: 75, when: '5d overdue', late: 5, tag: 'Needs you',
  facts: [['Due', '2026-11-06'], ['The ticket says', 'Ram asked for a debrief.']],
  reasons: [{ pts: 50, why: '5 days overdue' }, { pts: -25, why: 'machine-generated scaffolding' }],
  copyText: '/ata-work-task 49506070/1\n\nPROMPT BODY', copyHref: 'https://enterprise.colaberry.ai/bt-k7q2xm4p/#c=AAA', ...over,
});
const listItem = (over = {}) => feedItem({ kind: 'list', id: '7463955/10406233956', title: '06 - Owner Decisions and Blockers',
  url: 'https://app.basecamp.com/3945211/buckets/7463955/todolists/10406233956', path: 'Decisions and approvals / Ali Personal',
  tag: '5 pressing', copyHref: 'https://enterprise.colaberry.ai/bt-k7q2xm4p/#c=BBB', ...over });

const html = (over = {}) => renderMorningFive({
  today: '2026-11-12T13:00:00Z', runId: 'MORNING-FIVE-TEST',
  items: [listItem({ rank: 1, golden: true, score: 90 }), feedItem({ rank: 2 })],
  tourHref: 'https://enterprise.colaberry.ai/bt-k7q2xm4p/#t=TTT',
  counts: { tasks: 515, live: 379, dormant: 136, qualified: 295, claimed: 0, listsQualified: 94 }, ...over,
});

describe('renderMorningFive', () => {
  it('leads with the verdict and the guided tour button, before any card', () => {
    const h = html();
    expect(h).toMatch(/The one move: 06 - Owner Decisions and Blockers \(list\)/);
    expect(h.indexOf('Start the guided tour')).toBeLessThan(h.indexOf('#1 &middot; impact'));
    expect(h).toContain('href="https://enterprise.colaberry.ai/bt-k7q2xm4p/#t=TTT"');
  });

  /** Ali, 2026-11-12: "I don't need to see any prompts." */
  it('shows no prompt text, only buttons', () => {
    const h = html();
    expect(h).not.toContain('PROMPT BODY');
    expect(h).not.toMatch(/Paste this into Claude Code/);
    expect(h.match(/Copy for Claude Code<\/a>/g)).toHaveLength(2);
  });

  it('gives every card an Open-in-Basecamp link and its own copy link', () => {
    const h = html();
    expect(h).toContain('href="https://app.basecamp.com/3945211/buckets/7463955/todolists/10406233956"');
    expect(h).toContain('href="https://enterprise.colaberry.ai/bt-k7q2xm4p/#c=AAA"');
    expect(h).toContain('href="https://enterprise.colaberry.ai/bt-k7q2xm4p/#c=BBB"');
  });

  it('turns Mandrill click tracking off on copy and tour links only', () => {
    const h = html();
    expect(h.match(/mc:disable-tracking/g)).toHaveLength(3); // 2 copy + 1 tour
    expect(h).not.toMatch(/todolists\/10406233956"\s+mc:disable-tracking/);
  });

  it('tells lists from tasks by colour AND icon', () => {
    const h = html();
    expect(h).toContain('\u{1F4CB} List');
    expect(h).toContain('\u{1F4CC} Task');
    expect(h).toContain('#7C3AED'); // list bar
    expect(h).toContain('#2563EB'); // task bar
  });

  it('frames only #1 in gold, as the one move', () => {
    const h = html();
    expect(h.match(/The one move today &middot; most impactful/g)).toHaveLength(1);
    expect(h.match(/border:3px solid #C9971C/g)).toHaveLength(1);
  });

  it('is email-safe: no script, no CSS variables', () => {
    const h = html();
    expect(h).not.toMatch(/<script/i);
    expect(h).not.toMatch(/var\(--/);
  });

  it('escapes hostile ticket text', () => {
    const h = html({ items: [feedItem({ golden: true, title: '<img src=x onerror=alert(1)>', facts: [['Done when', '<script>x()</script>']] })] });
    expect(h).not.toContain('<img src=x');
    expect(h).not.toContain('<script>x()');
  });

  /** Live render 2026-11-12: "Ali — claim your systems" would have made the preflight refuse the send. */
  it('never emits an em-dash, even from ticket text', () => {
    const h = html({ items: [feedItem({ golden: true, title: 'Ali — claim your systems', facts: [['Done when', 'a—b']] })] });
    expect(h).not.toMatch(/—/);
    expect(h).toContain('Ali - claim your systems');
  });

  it('prints the ranking rules and the live-check result', () => {
    const h = html({ verify: { deadLists: 12, deadTodos: 0, unchecked: 0 } });
    expect(h).toMatch(/How these were ranked/);
    expect(h).toMatch(/a tie goes to the list/);
    expect(h).toMatch(/12 lists that the mirror still shows as open were trashed/);
  });

  it('says so plainly when nothing qualified, with no tour button', () => {
    const h = html({ items: [] });
    expect(h).toContain('Nothing qualified as pressing today.');
    expect(h).not.toContain('Start the guided tour');
  });
});

describe('buildTaskPrompt', () => {
  it('leads with the claim command', () => {
    expect(buildTaskPrompt(task(), 'WO').split('\n')[0]).toBe('/ata-work-task 49506070/10481592064');
  });

  it('tells a session to PREPARE a needs-you task, not to decide or finish it', () => {
    const p = buildTaskPrompt(task(), 'WO');
    expect(p).toMatch(/prepare it rather than finish it/);
    expect(p).not.toMatch(/DECISION/);
  });

  it('tells a session NOT to make a decision, only to prepare the memo', () => {
    expect(buildTaskPrompt(task({ isDecision: true }), 'WO')).toMatch(/this is a DECISION, and it is Ali's\. Do not make it/);
  });

  it('tells a session to do ordinary work through to Done when', () => {
    expect(buildTaskPrompt(task({ category: null, disposition: 'act' }), 'WO')).toMatch(/until its "Done when" is true/);
  });

  it('carries the reasons it was chosen', () => {
    expect(buildTaskPrompt(task(), 'WO')).toContain('  - 5 days overdue');
  });
});
