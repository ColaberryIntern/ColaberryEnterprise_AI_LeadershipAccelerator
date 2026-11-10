import { composeInternshipPortfolio } from '../compose';
import { repairArtifactText } from '../collect';
import { renderInternshipPortfolio } from '../render';
import { buildSidecar, serializeSidecar, sidecarProblems, snapshotOf } from '../sidecar/build';
import { classifyArtifact } from '../sidecar/classify';
import { cachedChatClient, requestKey, type ModelCache } from '../sidecar/store';
import { REQUIRED_INTERN_KEYS, type PreviousSnapshot, type Sidecar } from '../sidecar/types';
import type { CollectedPortfolio, PublishedArtifact } from '../types';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

const art = (over: Partial<PublishedArtifact> = {}): PublishedArtifact => ({
  id: '11111111-2222-4333-8444-555555555555', enrollment_id: 'e1', card_id: 'c1', kind: 'build_artifact', title: 'brief.pdf',
  created_at: daysAgo(3), external_url: null, repo_path: 'artifacts/week-03/brief.pdf', commit_sha: 'abc1234def', upload_name: null, ...over,
});
const richData = (): CollectedPortfolio => {
  const d = collected({
    artifacts: [
      art(),
      art({ id: '22222222-2222-4333-8444-555555555555', title: 'write-access-test.txt', repo_path: 'artifacts/week-01/write-access-test.txt', created_at: daysAgo(20) }),
      art({ id: '33333333-2222-4333-8444-555555555555', title: 'architecture.pdf', repo_path: 'docs/architecture.pdf', created_at: daysAgo(1) }),
    ],
    emails: [{ email: 'kal@example.com', subject: 'Can you review my plan?', snippet: 'Is the scope right for week 4?', received_at: daysAgo(2) }],
    lastOutbound: [{ email: 'kal@example.com', sent_at: daysAgo(5), subject: 'Your build', body_text: 'Please push STORY-2 this week.', body_truncated: false, from_address: 'ali@colaberry.com' }],
  });
  d.projects[0].commits = [{ sha: 'a1', date: daysAgo(1), author: 'kal', message: 'STORY-1: build it' }, { sha: 'a2', date: daysAgo(3), author: 'kal', message: 'wip' }];
  return d;
};
const build = (data: CollectedPortfolio, now = NOW, previous: PreviousSnapshot | null = null): { s: Sidecar; html: string } => {
  const report = composeInternshipPortfolio(data, { now });
  return { s: buildSidecar(report, { reportDate: '2026-11-09', previous, lastOutbound: data.lastOutbound ?? [] }), html: renderInternshipPortfolio(report).html };
};

describe('sidecar: every JSON number is the number the HTML renders', () => {
  it('for one intern: build %, stories, training, gate, counts and all seven tiles', () => {
    const { s, html } = build(richData());
    const i = s.interns[0];
    expect(html).toContain(`<strong>${i.percent_built}%</strong> built (${i.stories_verified}/${i.stories_total})`);
    expect(html).toContain(`training ${i.training.weeks_completed}/${i.training.weeks_total} weeks`);
    expect(html).toContain(`weeks 1-3 gate ${i.training.gate_done}/3`);
    expect(html).toContain(`day ${i.day}<`);
    // The story line is printed in the HTML; its numbers are the counts object.
    expect(html).toContain(i.story);
    expect(i.story).toContain(`${i.counts.verified} verified, ${i.counts.commits} commit`);
    expect(i.story).toContain(`${i.counts.asks} ask (${i.counts.blockers} blocker`);
    expect(i.story).toContain(`last build work ${i.days_since_build_work}d ago`);
    // The story omits zero training days; the JSON still carries the 0 (a real count, not missing).
    if (i.counts.training_days) expect(i.story).toContain(`training on ${i.counts.training_days} day`);
    else expect(i.story).not.toContain('training on');
    expect(i.counts.training_days).toBe(0);
    expect(html).toContain(`Artifacts they made (${i.artifacts_raw_count}`);
    const tile = (label: string): string => (new RegExp(`font-weight:700;color:#1a365d">([^<]*)</div><div style="font-size:11px;color:#64748b">${label}<`).exec(html) ?? [])[1];
    expect(tile('Interns')).toBe(String(s.counts.interns));
    expect(tile('On track')).toBe(String(s.counts.on_track));
    expect(tile('Need attention')).toBe(String(s.counts.need_attention));
    expect(tile('Stalled')).toBe(String(s.counts.stalled));
    expect(tile('Weeks 1-3 cleared')).toBe(String(s.counts.weeks_1_3_cleared));
    expect(tile('No project')).toBe(String(s.counts.no_project));
    expect(tile('Replies you owe')).toBe(String(s.counts.replies_owed));
  });

  it('a tile the HTML shows as "-" is null, never 0', () => {
    const d = richData();
    d.counts = { interns: 1 };
    const { s } = build(d);
    expect(s.counts.weeks_1_3_cleared).toBeNull();
    expect(s.counts.no_project).toBeNull();
  });

  it('most_urgent is the HTML "Most urgent" item and overflow is every item behind its "+N"', () => {
    const d = richData();
    d.projects[0].overdue = 4;
    d.projects[0].overdue_tasks = [{ story_id: 'S7', title: 'Old A', due_on: '2026-10-01' }, { story_id: 'S8', title: 'Old B', due_on: '2026-10-02' }];
    const report = composeInternshipPortfolio(d, { now: NOW });
    const s = buildSidecar(report, { reportDate: '2026-11-09', previous: null, lastOutbound: [] });
    const t = report.groups[0].interns[0].timeline;
    expect(s.interns[0].most_urgent).toEqual({ kind: t.next[0].kind, label: t.next[0].label, detail: t.next[0].detail });
    expect(s.interns[0].most_urgent_overflow).toHaveLength(t.next.length - 1);
    expect(renderInternshipPortfolio(report).html).toContain(`+${t.next.length - 1}</span>`);
  });
});

describe('sidecar: contract', () => {
  it('parses, carries every required key on every intern, and no base64', () => {
    const d = richData();
    d.roster = [rosterRow(), rosterRow({ enrollment_id: 'e2', name: 'Megan Doe', email: 'megan@example.com', project: null, day: 50 })];
    const text = serializeSidecar(build(d).s);
    expect(sidecarProblems(text)).toEqual([]);
    const parsed = JSON.parse(text) as Sidecar;
    expect(parsed.interns).toHaveLength(2);
    for (const i of parsed.interns) for (const k of REQUIRED_INTERN_KEYS) expect(i).toHaveProperty(k);
  });

  it('sidecarProblems names what is missing', () => {
    const s = build(richData()).s;
    delete (s.interns[0] as Partial<typeof s.interns[0]>).triage;
    expect(sidecarProblems(serializeSidecar(s))).toEqual(['interns[0] (e1) missing triage']);
    expect(sidecarProblems('{not json')[0]).toMatch(/does not parse/);
    expect(sidecarProblems('{"x":"data:image/png;base64,AAAA"}')).toContain('contains inline base64 data');
  });
});

describe('sidecar: real artifacts vs test files', () => {
  it('artifacts_real_count is lower than the raw count and never counts a test_or_scratch file', () => {
    const i = build(richData()).s.interns[0];
    expect(i.artifacts_raw_count).toBe(3);
    expect(i.artifacts_real_count).toBe(2);
    expect(i.artifacts.find((a) => a.title === 'write-access-test.txt')?.classification).toBe('test_or_scratch');
    expect(i.artifacts_real_count).toBe(i.artifacts.filter((a) => a.classification !== 'test_or_scratch').length);
  });

  it('classifies by path and filename', () => {
    const c = (repoPath: string | null, uploadName: string | null = null, kind = 'build_artifact', source: 'repo' | 'upload' | 'link' = 'repo') => classifyArtifact({ kind, source, repoPath, uploadName, title: '' });
    expect(c('artifacts/week-02/skill-guide.pdf')).toBe('training_upload');
    expect(c('docs/architecture.pdf')).toBe('project_artifact');
    expect(c(null, 'deck.pptx', 'build_artifact', 'upload')).toBe('training_upload');
    expect(c(null, null, 'claude_studio', 'link')).toBe('studio_artifact');
    for (const n of ['write-access-test.txt', 'test.pdf', 'scratch.md', 'untitled.docx', 'hello-world.md', 'upload_test.csv']) expect(c(`artifacts/week-01/${n}`)).toBe('test_or_scratch');
    for (const n of ['test-plan.pdf', 'unit-test-results.csv', 'latest.pdf', 'contest-entry.pdf']) expect(c(`docs/${n}`)).toBe('project_artifact');
  });
});

describe('sidecar: byte-identical on unchanged data', () => {
  it('two runs a minute apart produce the same JSON except generated_at', () => {
    const a = serializeSidecar(build(richData(), NOW).s);
    const b = serializeSidecar(build(richData(), new Date(NOW.getTime() + 60000)).s);
    expect(a).not.toBe(b);
    const strip = (t: string): string => t.replace(/"generated_at": "[^"]+"/, '"generated_at": "X"');
    expect(strip(a)).toBe(strip(b));
  });
});

describe('sidecar: triage', () => {
  it('day 50 with no project and a productive builder quiet 5 days get DIFFERENT tiers', () => {
    const noProject = build(collected({ roster: [rosterRow({ project: null, day: 50 })], projects: [] })).s.interns[0];
    expect(noProject.triage).toEqual({ tier: 'no_project_at_day_N', reason: 'Day 50 of the internship with no project.' });
    const d = collected();
    d.projects[0].commits = [{ sha: 'a', date: daysAgo(5), author: 'kal', message: 'big feature' }];
    d.projects[0].recently_verified = [{ story_id: 'S1', title: 'One', verified_at: daysAgo(6) }];
    const quiet = build(d).s.interns[0];
    expect(quiet.triage).toEqual({ tier: 'quiet', reason: 'No commit or verified story in 5 days.' });
  });

  it('never_started_building, blocked_waiting_on_ali, overdue_backlog, on_track', () => {
    const never = collected();
    never.roster = [rosterRow({ project: { ...rosterRow().project, tasks_complete: 0 } })];
    never.projects[0].commits = [];
    expect(build(never).s.interns[0].triage.tier).toBe('never_started_building');
    const blocked = richData();
    expect(build(blocked).s.interns[0].triage.tier).toBe('blocked_waiting_on_ali');
    const overdue = collected();
    overdue.projects[0].overdue = 3;
    expect(build(overdue).s.interns[0].triage).toEqual({ tier: 'overdue_backlog', reason: '3 tasks are past their due date.' });
    expect(build(collected()).s.interns[0].triage.tier).toBe('on_track');
  });
});

describe('sidecar: pacing', () => {
  it('has a denominator, and says whether it paced on the cohort schedule or the day count', () => {
    const byDay = build(collected()).s.interns[0].pacing;
    expect(byDay).toEqual({ day: 49, program_day_total: 84, program_day_total_basis: '12 published training weeks x 7 days', expected_training_week: 6, expected_basis: 'day_count', actual_training_week: 2, weeks_behind: 4 });
    const cohort = collected({ roster: [rosterRow({ training: { ...rosterRow().training, pace: { weeks_completed: 2, scheduled_week: 3, delta: -1, band: 'amber' }, pace_unavailable: null } })] });
    expect(build(cohort).s.interns[0].pacing).toEqual(expect.objectContaining({ expected_training_week: 3, expected_basis: 'cohort_schedule', weeks_behind: 1 }));
    const unknown = collected({ roster: [rosterRow({ day: null })] });
    expect(build(unknown).s.interns[0].pacing).toEqual(expect.objectContaining({ day: null, expected_training_week: null, weeks_behind: null }));
  });
});

describe('sidecar: last_ask and open questions', () => {
  it('the latest outbound message, satisfied by the first commit / story / reply after it', () => {
    const la = build(richData()).s.interns[0].last_ask!;
    expect(la).toEqual(expect.objectContaining({ subject: 'Your build', body_text: 'Please push STORY-2 this week.', from: 'ali@colaberry.com', satisfied: true, satisfied_by: 'commit' }));
  });

  it('nothing after it: false inside the data window, null (unknown) outside it', () => {
    const d = richData();
    d.projects[0].commits = [];
    d.emails = [];
    d.lastOutbound = [{ ...d.lastOutbound![0], sent_at: daysAgo(2) }];
    expect(build(d).s.interns[0].last_ask?.satisfied).toBe(false);
    d.lastOutbound = [{ ...d.lastOutbound[0], sent_at: daysAgo(40) }];
    expect(build(d).s.interns[0].last_ask?.satisfied).toBeNull();
    expect(build(collected()).s.interns[0].last_ask).toBeNull();
  });

  it('open questions are their unanswered question/blocker emails, verbatim', () => {
    const q = build(richData()).s.interns[0].open_questions;
    expect(q).toEqual([{ received_at: daysAgo(2), subject: 'Can you review my plan?', text: 'Is the scope right for week 4?', kind: 'question' }]);
  });
});

describe('sidecar: delta against the previous report', () => {
  it('null with no previous report; differences when there is one', () => {
    expect(build(richData()).s.interns[0].delta).toBeNull();
    const prevRun = build(richData(), new Date(NOW.getTime() - 2 * 86400000)).s;
    const prev = snapshotOf({ ...prevRun, report_date: '2026-11-07' });
    prev.interns[0].stories_verified = 0;
    prev.interns[0].days_since_build_work = 6;
    prev.interns[0].tier = 'quiet';
    const d = build(richData(), NOW, prev).s.interns[0].delta!;
    expect(d.previous_report_date).toBe('2026-11-07');
    expect(d.verified_since_last).toBe(1);
    expect(d.days_quiet_change).toBe(1 - 6);
    expect(d.commits_since_last).toBe(1);
    expect(d.artifacts_since_last).toBe(1);
    expect(d.tier_changed_from).toBe('quiet');
  });

  it('commits_since_last is null when the previous report is older than the commit window', () => {
    const prevRun = build(richData(), new Date(NOW.getTime() - 30 * 86400000)).s;
    const d = build(richData(), NOW, snapshotOf(prevRun)).s.interns[0].delta!;
    expect(d.commits_since_last).toBeNull();
    expect(d.artifacts_since_last).not.toBeNull();
  });
});

describe('sidecar: the double-encoded filename is repaired for the HTML and the JSON alike', () => {
  it('"Build Day Lab â€” ..." reads as an em-dash in the JSON and as "-" in the HTML', () => {
    const damaged = Buffer.from('Build Day Lab — Your First AI Workflow.pdf', 'utf8').toString('latin1');
    const a = repairArtifactText(art({ title: `Build Your First AI Workflow — ${damaged}`, upload_name: damaged, repo_path: null, commit_sha: null }));
    const { s, html } = build(collected({ artifacts: [a] }));
    expect(s.interns[0].artifacts[0].title).toBe('Build Your First AI Workflow — Build Day Lab — Your First AI Workflow.pdf');
    expect(html).toContain('Build Day Lab - Your First AI Workflow.pdf');
    expect(html).not.toMatch(/â|\u0080|\u0094/);
  });
});

describe('model cache: the same request always gets the same reply', () => {
  it('answers a repeat request from the cache without calling the model', async () => {
    const store = new Map<string, unknown>();
    const cache: ModelCache = { get: async (k) => store.get(k), put: async (k, _m, r) => { store.set(k, r); } };
    let calls = 0;
    const inner = { chat: { completions: { create: async () => { calls += 1; return { choices: [{ message: { content: `reply ${calls}` } }] }; } } } };
    const c = cachedChatClient(inner, cache);
    const req = { model: 'm', messages: [{ role: 'user', content: 'hi' }] };
    const a = await c.chat.completions.create(req);
    const b = await c.chat.completions.create({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(calls).toBe(1);
    expect(b).toEqual(a);
    expect(requestKey(req)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a broken cache degrades to the live model, never fails', async () => {
    const cache: ModelCache = { get: async () => { throw new Error('db down'); }, put: async () => { throw new Error('db down'); } };
    const inner = { chat: { completions: { create: async () => ({ ok: 1 }) } } };
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(cachedChatClient(inner, cache).chat.completions.create({ model: 'm' })).resolves.toEqual({ ok: 1 });
    log.mockRestore();
  });
});
