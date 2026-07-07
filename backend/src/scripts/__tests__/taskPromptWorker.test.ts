/* Task Prompt Worker — pure-logic unit tests (classify + prompt build + render). */
const { classifyWorkable } = require('../lib/taskPromptWorker/classifyWorkable');
const { buildPrompt, slugify } = require('../lib/taskPromptWorker/promptBuilder');
const { renderDigest } = require('../lib/taskPromptWorker/renderPromptDigest');

describe('classifyWorkable', () => {
  const codeTitles = [
    'Set up daily automated dashboard update',
    'Implement escalation rules in dashboard',
    'Integrate curriculum % tracking',
    'Build human eval set - small set of lessons with human-graded quality labels',
    'Add chapter-output quality checks (confidence scoring)',
    'Develop a Mixture-of-Experts (MOE) on chapter generation to keep chapters on-topic',
    '[Ali] Refactor JD parser to two-stage: all_role_requirements + ai_skills_top_10',
  ];
  const notCodeTitles = [
    'Approve sales materials for Founding Cohort',
    "[Ali] Read Ram's 3 content management white papers and reply with feedback",
    'Draft Skilljar progress sync architecture spec',
    'Review dashboard accuracy with Ali',
  ];

  it.each(codeTitles)('classifies "%s" as code', (t) => {
    expect(classifyWorkable({ title: t, description: '' })).toBe('code');
  });
  it.each(notCodeTitles)('classifies "%s" as not-code', (t) => {
    expect(classifyWorkable({ title: t, description: '' })).not.toBe('code');
  });

  it('honors the HUMAN TASK marker in the description even with a code-ish title', () => {
    expect(classifyWorkable({ title: 'Compile daily action queue update', description: '<span>HUMAN TASK</span> owner Ali' })).toBe('human');
  });
  it('classifies "DECISION:" titles as decision', () => {
    expect(classifyWorkable({ title: 'DECISION: Re-confirm native community given the timeline', description: '' })).toBe('decision');
  });
  it('fails toward human on an ambiguous title', () => {
    expect(classifyWorkable({ title: 'Sync with Luda about the roadmap', description: '' })).toBe('human');
  });
});

describe('buildPrompt', () => {
  const task = {
    title: 'Implement escalation rules in dashboard',
    url: 'https://app.basecamp.com/3945211/buckets/47502609/todos/9946497989',
    project: 'AI Systems Architect Accelerator',
    list: 'Launch Readiness Dashboard',
    due: '2026-06-04',
    summary: 'Add escalation rules to the launch readiness dashboard.',
  };
  const p = buildPrompt(task);

  it('embeds the ticket link and title', () => {
    expect(p).toContain(task.url);
    expect(p).toContain(task.title);
  });
  it('embeds the operating contract (tsc, tests, branch, PR, no deploy)', () => {
    expect(p).toMatch(/tsc --noEmit/);
    expect(p).toMatch(/happy \+ failure \+ boundary \+ idempotency/);
    expect(p).toMatch(/workstream\/implement-escalation-rules-in-dashboard/);
    expect(p).toMatch(/open a PR/i);
    expect(p).toMatch(/DO NOT deploy/i);
  });
  it('includes a project-specific hint', () => {
    expect(p).toMatch(/reportingRegistry|Launch Readiness|admin/);
  });
  it('is deterministic', () => {
    expect(buildPrompt(task)).toBe(p);
  });
});

describe('slugify', () => {
  it('drops [tags] and caps length at 5 words', () => {
    expect(slugify('[Ali] Refactor JD parser to two-stage: all_role_requirements')).toBe('refactor-jd-parser-to-two');
  });
});

describe('renderDigest', () => {
  const task = { title: 'Do X', url: 'https://bc/1', project: 'AI Pathway', due: '2026-07-01' };
  const input = {
    runId: 'TPW-1',
    dateStr: '2026-07-05',
    code: [{ task, prompt: 'RUN THIS PROMPT' }],
    needsYou: [{ task: { title: 'Approve Y', url: 'https://bc/2' }, kind: 'human' }],
  };
  const out = renderDigest(input);

  it('produces a subject with both counts', () => {
    expect(out.subject).toMatch(/1 ready-to-run/);
    expect(out.subject).toMatch(/1 need you/);
  });
  it('embeds the prompt text and ticket links in the html', () => {
    expect(out.html).toContain('RUN THIS PROMPT');
    expect(out.html).toContain('https://bc/1');
    expect(out.html).toContain('Approve Y');
  });
  it('is deterministic (no clock inside)', () => {
    expect(renderDigest(input).html).toBe(out.html);
  });
});
