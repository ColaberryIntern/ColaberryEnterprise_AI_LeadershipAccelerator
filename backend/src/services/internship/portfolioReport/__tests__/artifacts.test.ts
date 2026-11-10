import { artifactUrl, chooseAsks, publishedArtifacts } from '../artifacts';
import { composeInternshipPortfolio } from '../compose';
import { renderInternshipPortfolio } from '../render';
import type { PublishedArtifact } from '../types';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

const pub = (over: Partial<PublishedArtifact> = {}): PublishedArtifact => ({
  id: '11111111-2222-4333-8444-555555555555', enrollment_id: 'e1', card_id: 'c1', kind: 'field_guide', title: 'Field Guide', created_at: daysAgo(3), external_url: null, ...over,
});
const report = (over = {}) => composeInternshipPortfolio(collected({ artifacts: [pub()], ...over }), { now: NOW });
const card = (over = {}) => report(over).groups[0].interns[0];

describe('artifacts: only what they actually produced (Ali, 9 Nov: "not placeholders")', () => {
  it('lists the intern\'s own artifacts newest first, and nothing else', () => {
    const p = publishedArtifacts('e1', [
      pub({ id: 'a', title: 'Older', created_at: daysAgo(5) }),
      pub({ id: 'b', title: 'Newer', created_at: daysAgo(1) }),
      pub({ id: 'c', enrollment_id: 'someone-else' }),
    ]);
    expect(p.map((x) => x.title)).toEqual(['Newer', 'Older']);
  });

  it('nothing published means an empty list: no overdue, no due-this-week, no template items', () => {
    const c = card({ artifacts: [] });
    expect(c.artifacts.published).toEqual([]);
    expect(Object.keys(c.artifacts).sort()).toEqual(['asks', 'published']);
    const { html } = renderInternshipPortfolio(report({ artifacts: [] }));
    expect(html).toContain('Nothing published yet.');
    expect(html).not.toMatch(/Overdue, week|Due this week|training artifacts? overdue|more in their portfolio/);
  });

  it('artifacts never become a status reason or an "up next" item', () => {
    const c = card({ artifacts: [] });
    expect(c.status.reasons.join(' ')).not.toMatch(/artifact/);
    expect(c.timeline.next.some((n) => n.kind === 'artifact')).toBe(false);
  });

  it('every published artifact is a link, with no "+N more" cut-off', () => {
    const many = Array.from({ length: 14 }, (_, i) => pub({ id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, title: `A${i}` }));
    const { html } = renderInternshipPortfolio(report({ artifacts: many }));
    expect(html).toContain('Artifacts they published (14)');
    for (const a of many) expect(html).toContain(`/admin/internship/artifact/${a.id}" target="_blank"`);
  });
});

describe('artifacts: links', () => {
  it('a Claude Studio artifact opens its own claude.ai page; everything else opens the admin viewer', () => {
    expect(artifactUrl({ id: 'x', external_url: 'https://claude.ai/artifact/abc' })).toBe('https://claude.ai/artifact/abc');
    expect(artifactUrl({ id: 'x', external_url: null })).toBe('https://enterprise.colaberry.ai/admin/internship/artifact/x');
    expect(artifactUrl({ id: 'x', external_url: 'javascript:alert(1)' })).toBe('https://enterprise.colaberry.ai/admin/internship/artifact/x');
  });

  it('published artifacts appear on the timeline as chips that open in a new tab', () => {
    const { html } = renderInternshipPortfolio(report());
    expect(html).toContain('href="https://enterprise.colaberry.ai/admin/internship/artifact/11111111-2222-4333-8444-555555555555" target="_blank"');
  });

  it('a published Command Center is a button; a missing one says so', () => {
    const data = collected({ artifacts: [] });
    data.projects[0].command_center_url = 'https://x.github.io/cc/';
    const withCc = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW })).html;
    expect(withCc).toContain('href="https://x.github.io/cc/" target="_blank"');
    expect(withCc).toContain('Open Command Center');
    expect(renderInternshipPortfolio(report()).html).toContain('No Command Center published');
  });

  it('a non-https Command Center value is never turned into a link', () => {
    const data = collected();
    data.projects[0].command_center_url = 'javascript:alert(1)';
    const html = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW })).html;
    expect(html).not.toContain('javascript:alert');
  });
});

describe('artifacts: what to ask for, with prompt and nudge', () => {
  it('a stuck builder is asked for a Blocker Brief first, and the prompt names their project and next story', () => {
    const data = collected();
    data.projects[0].commits = [{ date: daysAgo(9), author: 'kal', message: 'old work' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks[0].key).toBe('blocker_brief');
    expect(c.artifacts.asks[0].prompt).toContain('Project: Console project (repo: https://github.com/x/y)');
    expect(c.artifacts.asks[0].prompt).toContain('"Next thing"');
    expect(c.artifacts.asks[0].nudge).toMatch(/^Hi Kalkidan, could you put together a Blocker Brief for Console project/);
  });

  it('a builder who reported an issue and kept committing is NOT asked for a Blocker Brief (prod: Quincy)', () => {
    const data = collected({ emails: [{ email: 'kal@example.com', subject: 'Issues found in the scheduler', snippet: '', received_at: daysAgo(3) }] });
    data.projects[0].commits = [{ date: daysAgo(1), author: 'kal', message: 'fix' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).not.toContain('blocker_brief');
  });

  it('a reported blocker with no build work since IS a Blocker Brief', () => {
    const data = collected({ emails: [{ email: 'kal@example.com', subject: 'Unable to push, access denied', snippet: '', received_at: daysAgo(1) }] });
    data.projects[0].commits = [{ date: daysAgo(2), author: 'kal', message: 'wip' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks[0].key).toBe('blocker_brief');
  });

  it('a blocker Ali already answered is not a Blocker Brief (prod: Quincy)', () => {
    const data = collected({
      emails: [{ email: 'kal@example.com', subject: 'Unable to push, access denied', snippet: '', received_at: daysAgo(1) }],
      replies: [{ email: 'kal@example.com', subject: 'Re: Unable to push', received_at: daysAgo(1) }],
    });
    data.projects[0].commits = [{ date: daysAgo(2), author: 'kal', message: 'wip' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).not.toContain('blocker_brief');
  });

  it('no published Command Center produces the Command Center ask', () => {
    expect(card().artifacts.asks.map((a) => a.key)).toContain('command_center');
  });

  it('a nearly done gov build is asked for a Demo Walkthrough', () => {
    const c = card({
      govPursuits: [{ key: 'gws:a', title: 'Saratoga', stage: 'in_build', decision: 'x', hasActiveIntern: true, assignedInterns: [{ identityId: 'i', name: 'K', email: 'kal@example.com' }], build: { studentProjectId: 'p-console', pct: 91, verified: 10, total: 11, studentProjectName: 'x' } } as any],
    });
    expect(c.artifacts.asks.map((a) => a.key)).toContain('demo_walkthrough');
  });

  it('someone with no project is asked for a Project Proposal', () => {
    const c = composeInternshipPortfolio(collected({ roster: [rosterRow({ project: null })], projects: [] }), { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).toEqual(['project_proposal']);
  });

  it('never more than three asks', () => {
    const data = collected();
    data.projects[0].commits = [{ date: daysAgo(9), author: 'kal', message: 'old work' }];
    const ctx = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(chooseAsks(ctx).length).toBeLessThanOrEqual(3);
    expect(chooseAsks(ctx).map((a) => a.key)).not.toContain('overdue_training');
  });

  it('renders each ask with its prompt and nudge, escaped', () => {
    const data = collected();
    data.projects[0].next_tasks = [{ story_id: 'S', title: '<b>bold</b> story', due_on: null, status: 'x' }];
    const { html, text } = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW }));
    expect(html).toContain('Ask them for');
    expect(html).toContain('Prompt to give them');
    expect(html).toContain('Matching nudge');
    expect(html).not.toContain('<b>bold</b>');
    expect(text).toContain('ASK: ');
  });
});
