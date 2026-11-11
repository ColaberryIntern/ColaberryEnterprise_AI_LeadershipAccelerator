/**
 * promptBuilder - the clipboard payload behind every list on the board.
 *
 * The prompt is the whole briefing: there is no second round trip, so these tests pin the
 * facts it must carry, the options it must derive, and what it must refuse to invent.
 * (Ported from the superseded renderNavigator.promptFor tests onto the builder that ships.)
 */

const { buildListPrompt, optionsBlock } = require('../promptBuilder');

const dormantScaffold = {
  key: '9. Ensuring Data Security', name: 'Ensuring Data Security', position: 9,
  total: 39, live: 0, dormant: 39, oldestDue: '2026-07-19',
  generatedShare: 1, humanShare: 0.56,
  lead: { title: 'Limit access to sensitive information', id: '123/456', dueOn: '2026-07-19' },
};

describe('buildListPrompt', () => {
  it('carries the measured facts, not just a command', () => {
    const p = buildListPrompt(dormantScaffold);
    expect(p).toMatch(/LIST: 9\. Ensuring Data Security/);
    expect(p).toMatch(/39 task\(s\) assigned to Ali: 0 live, 39 dormant/);
    expect(p).toMatch(/Phase 9 of a numbered programme/);
    expect(p).toMatch(/Limit access to sensitive information/);
    expect(p).toMatch(/Oldest due date in the list: 2026-07-19/);
  });

  it('flags a mostly machine-generated list as scaffolding', () => {
    expect(buildListPrompt(dormantScaffold)).toMatch(/100% carries a machine-generated signature.*scaffolding/s);
  });

  it('says when the leverage is delegation rather than automation', () => {
    expect(buildListPrompt(dormantScaffold)).toMatch(/56% is marked as needing a person.*delegation/s);
  });

  it('never describes a dismissal as a closure', () => {
    expect(buildListPrompt(dormantScaffold)).toMatch(/Never describe a dismissal as a closure/);
  });

  it('quotes the list name safely inside the commands it hands over', () => {
    const p = buildListPrompt({ ...dormantScaffold, key: 'Say "hi" list' });
    expect(p).toContain('--list "Say \\"hi\\" list"');
  });

  it('adds whole-queue context when totals are known', () => {
    const p = buildListPrompt(dormantScaffold, {
      totals: { tasks: 390, lists: 10, dormant: 100 }, category: { label: 'Gov' },
    });
    expect(p).toMatch(/This list is 10% of that\. It sits under "Gov"/);
  });

  it('omits what it does not know rather than inventing it', () => {
    const bare = buildListPrompt({ key: 'x', name: 'x', total: 1, live: 1, dormant: 0 },
      { totals: { tasks: 0, lists: 0, dormant: 0 } });
    expect(bare).not.toMatch(/SPEARHEAD \(most urgent/);
    expect(bare).not.toMatch(/Phase \d/);
    expect(bare).not.toMatch(/undefined|NaN|Infinity/);
    expect(bare).not.toMatch(/CONTEXT:/);
  });
});

describe('optionsBlock', () => {
  it('offers dismissal only for a list that is dormant AND generated', () => {
    expect(optionsBlock(dormantScaffold)).toMatch(/A\. DISMISS THE LIST/);
    expect(optionsBlock({ ...dormantScaffold, generatedShare: 0.1 })).not.toMatch(/DISMISS THE LIST/);
    expect(optionsBlock({ ...dormantScaffold, generatedShare: 0.1 })).toMatch(/RE-DATE THE LIST/);
  });

  it('splits a list that is partly live', () => {
    expect(optionsBlock({ ...dormantScaffold, live: 9, dormant: 30 })).toMatch(/SPLIT IT\. Work the 9 live/);
  });

  it('always leaves an escape hatch, because counts do not know the business', () => {
    expect(optionsBlock({ key: 'x', total: 0, live: 0, dormant: 0 })).toMatch(/D\. SOMETHING ELSE/);
  });
});
