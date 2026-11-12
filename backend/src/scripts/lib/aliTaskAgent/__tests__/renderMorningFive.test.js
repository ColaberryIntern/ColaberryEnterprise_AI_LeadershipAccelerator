/**
 * renderMorningFive and the task prompt behind "the one move".
 */
const { renderMorningFive } = require('../renderMorningFive');
const { buildTaskPrompt } = require('../promptBuilder');

const item = (over = {}) => ({
  id: '49506070/10481592064', title: 'Internal debrief of the MAPLOCA call', url: 'https://app.basecamp.com/3945211/buckets/49506070/todos/10481592064',
  path: 'Client delivery / MAPLOCA / 1. RFP Response', dueOn: '2026-11-06', late: 5, score: 75,
  disposition: 'ask', dispositionReason: 'the mirror classifies this as human_required', category: 'human_required',
  isDecision: false, humanOnly: false, summary: 'Ram asked for a debrief.', doneWhen: 'two PDFs on the ticket',
  reasons: [{ pts: 50, why: '5 days overdue' }, { pts: 15, why: 'marked as needing you' }], ...over,
});
const html = (over = {}) => renderMorningFive({
  today: '2026-11-11T13:00:00Z', runId: 'MORNING-FIVE-TEST', picks: [item()],
  move: { kind: 'task', item: item(), rule: 3, why: 'top pick', candidates: [] }, movePrompt: 'PROMPT TEXT',
  counts: { tasks: 515, live: 379, dormant: 136, qualified: 295, claimed: 0 }, ...over,
});

describe('renderMorningFive', () => {
  it('leads with a verdict, then the one move and its prompt, then the five', () => {
    const h = html();
    expect(h.indexOf('The one move today')).toBeLessThan(h.indexOf('The five, most pressing first'));
    expect(h).toContain('PROMPT TEXT');
    expect(h).toMatch(/1 pressing task out of 295 that qualified/);
  });

  it('is email-safe: no script, no CSS variables', () => {
    const h = html();
    expect(h).not.toMatch(/<script/i);
    expect(h).not.toMatch(/var\(--/);
  });

  it('gives every item a Basecamp link and its claim command', () => {
    const h = html();
    expect(h).toContain('href="https://app.basecamp.com/3945211/buckets/49506070/todos/10481592064"');
    expect(h).toContain('/ata-work-task 49506070/10481592064');
  });

  /** The first preview labelled build tasks "Ask Ali one question". */
  it('labels a human_required task "Needs you", and only a real decision "Your decision"', () => {
    expect(html()).toContain('Needs you');
    expect(html()).not.toContain('Your decision');
    expect(html({ picks: [item({ isDecision: true })] })).toContain('Your decision');
  });

  it('says when the ticket states no "Done when" rather than inventing one', () => {
    expect(html({ picks: [item({ doneWhen: null })] })).toContain('not stated in the ticket');
  });

  it('escapes hostile ticket text', () => {
    const h = html({ picks: [item({ title: '<img src=x onerror=alert(1)>', summary: '<script>x()</script>' })] });
    expect(h).not.toContain('<img src=x');
    expect(h).not.toContain('<script>x()');
  });

  it('prints the scoring rules on the page', () => {
    expect(html()).toMatch(/How these were picked/);
    expect(html()).toMatch(/flat \+40/);
  });

  describe('the five lists', () => {
    const list = (over = {}) => ({ key: '1. RFP Response', url: 'https://app.basecamp.com/3945211/buckets/49506070/todolists/111',
      path: 'Client delivery / MAPLOCA', score: 85, total: 12, live: 9, dormant: 3, oldestDue: '2026-10-01',
      reasons: [{ pts: 75, why: 'its most pressing task scores 75' }, { pts: 10, why: '2 more pressing tasks in it' }],
      pressing: [{ id: '49506070/1', title: 'Internal debrief', url: 'https://app.basecamp.com/x', late: 5, score: 75 },
        { id: '49506070/2', title: 'Second', url: null, late: -2, score: 40 }],
      proposal: { label: 'Work the 9 live, re-date the 3 dormant', why: 'the list is mixed' }, ...over });
    const withLists = (lists) => html({ lists, counts: { tasks: 515, live: 379, dormant: 136, qualified: 295, claimed: 0, listsQualified: 40 } });

    it('renders after the five tasks, in the same card shape', () => {
      const h = withLists([list()]);
      expect(h.indexOf('The five, most pressing first')).toBeLessThan(h.indexOf('The five lists, most pressing first'));
      expect(h).toContain('List #1 &middot; score 85');
      expect(h).toContain('1 of the 40 lists with something pressing');
      expect(h).toContain('Why it is here');
    });

    it('links the list, names its lead task, its proposal and its command', () => {
      const h = withLists([list()]);
      expect(h).toContain('href="https://app.basecamp.com/3945211/buckets/49506070/todolists/111"');
      expect(h).toContain('Internal debrief');
      expect(h).toContain('Work the 9 live, re-date the 3 dormant');
      expect(h).toContain('/ata-list &quot;1. RFP Response&quot;');
      expect(h).toMatch(/How the lists were picked/);
    });

    it('escapes hostile list names', () => {
      const h = withLists([list({ key: '<img src=x onerror=alert(1)>' })]);
      expect(h).not.toContain('<img src=x');
    });

    it('omits the section when there are no lists', () => {
      expect(html()).not.toContain('The five lists');
    });
  });

  it('says so plainly when nothing qualified', () => {
    const h = html({ picks: [], move: { kind: 'none', why: 'Nothing qualified as pressing today.', candidates: [] } });
    expect(h).toContain('Nothing qualified as pressing today.');
  });
});

describe('buildTaskPrompt', () => {
  it('leads with the claim command', () => {
    expect(buildTaskPrompt(item(), 'WO').split('\n')[0]).toBe('/ata-work-task 49506070/10481592064');
  });

  it('tells a session to PREPARE a needs-you task, not to decide or finish it', () => {
    const p = buildTaskPrompt(item(), 'WO');
    expect(p).toMatch(/prepare it rather than finish it/);
    expect(p).not.toMatch(/DECISION/);
  });

  it('tells a session NOT to make a decision, only to prepare the memo', () => {
    expect(buildTaskPrompt(item({ isDecision: true }), 'WO')).toMatch(/this is a DECISION, and it is Ali's\. Do not make it/);
  });

  it('tells a session to do ordinary work through to Done when', () => {
    expect(buildTaskPrompt(item({ category: null, disposition: 'act' }), 'WO')).toMatch(/until its "Done when" is true/);
  });

  it('carries the reasons it was chosen', () => {
    expect(buildTaskPrompt(item(), 'WO')).toContain('  - 5 days overdue');
  });
});
