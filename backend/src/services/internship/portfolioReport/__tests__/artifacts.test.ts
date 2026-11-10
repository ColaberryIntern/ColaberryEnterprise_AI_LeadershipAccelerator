import { artifactProgress, artifactUrl, chooseAsks } from '../artifacts';
import { composeInternshipPortfolio } from '../compose';
import { renderInternshipPortfolio } from '../render';
import type { ArtifactCard, PublishedArtifact } from '../types';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

const CARDS: ArtifactCard[] = [
  { card_id: 'c1', week: 1, type: 'deep_dive', title: 'Deep Dive - Business Analyst', kind: 'field_guide' },
  { card_id: 'c2', week: 2, type: 'architect_mindset', title: 'Boundaries Create the Architecture', kind: 'architecture_decision' },
  { card_id: 'c3', week: 3, type: 'deep_dive', title: 'Deep Dive - Project Manager', kind: 'field_guide' },
  { card_id: 'c4', week: 4, type: 'evaluation', title: 'Week 4 Evaluation', kind: 'case_study' },
];
const pub = (over: Partial<PublishedArtifact> = {}): PublishedArtifact => ({
  id: '11111111-2222-4333-8444-555555555555', enrollment_id: 'e1', card_id: 'c1', kind: 'field_guide', title: 'Field Guide', created_at: daysAgo(3), external_url: null, ...over,
});
const report = (over = {}) => composeInternshipPortfolio(collected({ artifacts: [pub()], artifactCards: CARDS, ...over }), { now: NOW });
const card = (over = {}) => report(over).groups[0].interns[0];

describe('artifacts: what should exist by now', () => {
  it('cards before the current training week with nothing published are overdue; the current week is due', () => {
    // fixture: weeks 1 and 2 done, so the current week is 3
    const c = card();
    expect(c.artifacts.currentWeek).toBe(3);
    expect(c.artifacts.overdue).toEqual([{ week: 2, kind: 'architecture_decision', title: 'Boundaries Create the Architecture' }]);
    expect(c.artifacts.dueNow.map((d) => d.week)).toEqual([3]);
  });

  it('overdue artifacts are a status reason and an "up next" item', () => {
    const c = card();
    expect(c.status.reasons).toContain('1 training artifact overdue');
    expect(c.timeline.next.some((n) => n.kind === 'artifact')).toBe(true);
  });

  it('a card they COMPLETED without an artifact is not overdue: it did not require one', () => {
    const c = card({ completedCards: [{ enrollment_id: 'e1', card_id: 'c2' }] });
    expect(c.artifacts.overdue).toEqual([]);
  });

  it('only counts the intern\'s own artifacts', () => {
    const p = artifactProgress(card().training, 'e1', [pub({ enrollment_id: 'someone-else' })], CARDS);
    expect(p.published).toEqual([]);
    expect(p.overdue.map((o) => o.week)).toEqual([1, 2]);
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
    const data = collected({ artifacts: [], artifactCards: CARDS });
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
    const data = collected({ artifactCards: [] });
    data.projects[0].commits = [{ date: daysAgo(9), author: 'kal', message: 'old work' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks[0].key).toBe('blocker_brief');
    expect(c.artifacts.asks[0].prompt).toContain('Project: Console project (repo: https://github.com/x/y)');
    expect(c.artifacts.asks[0].prompt).toContain('"Next thing"');
    expect(c.artifacts.asks[0].nudge).toMatch(/^Hi Kalkidan, could you put together a Blocker Brief for Console project/);
  });

  it('a builder who reported an issue and kept committing is NOT asked for a Blocker Brief (prod: Quincy)', () => {
    const data = collected({ artifactCards: [], emails: [{ email: 'kal@example.com', subject: 'Issues found in the scheduler', snippet: '', received_at: daysAgo(3) }] });
    data.projects[0].commits = [{ date: daysAgo(1), author: 'kal', message: 'fix' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).not.toContain('blocker_brief');
  });

  it('a reported blocker with no build work since IS a Blocker Brief', () => {
    const data = collected({ artifactCards: [], emails: [{ email: 'kal@example.com', subject: 'Unable to push, access denied', snippet: '', received_at: daysAgo(1) }] });
    data.projects[0].commits = [{ date: daysAgo(2), author: 'kal', message: 'wip' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks[0].key).toBe('blocker_brief');
  });

  it('a blocker Ali already answered is not a Blocker Brief (prod: Quincy)', () => {
    const data = collected({
      artifactCards: [],
      emails: [{ email: 'kal@example.com', subject: 'Unable to push, access denied', snippet: '', received_at: daysAgo(1) }],
      replies: [{ email: 'kal@example.com', subject: 'Re: Unable to push', received_at: daysAgo(1) }],
    });
    data.projects[0].commits = [{ date: daysAgo(2), author: 'kal', message: 'wip' }];
    const c = composeInternshipPortfolio(data, { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).not.toContain('blocker_brief');
  });

  it('no published Command Center produces the Command Center ask', () => {
    expect(card({ artifactCards: [] }).artifacts.asks.map((a) => a.key)).toContain('command_center');
  });

  it('a nearly done gov build is asked for a Demo Walkthrough', () => {
    const c = card({
      artifactCards: [],
      govPursuits: [{ key: 'gws:a', title: 'Saratoga', stage: 'in_build', decision: 'x', hasActiveIntern: true, assignedInterns: [{ identityId: 'i', name: 'K', email: 'kal@example.com' }], build: { studentProjectId: 'p-console', pct: 91, verified: 10, total: 11, studentProjectName: 'x' } } as any],
    });
    expect(c.artifacts.asks.map((a) => a.key)).toContain('demo_walkthrough');
  });

  it('someone with no project is asked for a Project Proposal', () => {
    const c = composeInternshipPortfolio(collected({ roster: [rosterRow({ project: null })], projects: [], artifactCards: [] }), { now: NOW }).groups[0].interns[0];
    expect(c.artifacts.asks.map((a) => a.key)).toEqual(['project_proposal']);
  });

  it('never more than three asks', () => {
    const ctx = card({ artifactCards: CARDS });
    expect(chooseAsks(ctx, [{ week: 1, kind: 'x', title: 'a' }]).length).toBeLessThanOrEqual(3);
  });

  it('renders each ask with its prompt and nudge, escaped', () => {
    const data = collected({ artifactCards: [] });
    data.projects[0].next_tasks = [{ story_id: 'S', title: '<b>bold</b> story', due_on: null, status: 'x' }];
    const { html, text } = renderInternshipPortfolio(composeInternshipPortfolio(data, { now: NOW }));
    expect(html).toContain('Ask them for');
    expect(html).toContain('Prompt to give them');
    expect(html).toContain('Matching nudge');
    expect(html).not.toContain('<b>bold</b>');
    expect(text).toContain('ASK: ');
  });
});
