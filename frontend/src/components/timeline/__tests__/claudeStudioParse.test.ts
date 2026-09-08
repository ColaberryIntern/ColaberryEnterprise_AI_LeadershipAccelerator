/**
 * The student-side half of the Claude Studio body_html contract.
 *
 * The backend renders the markup (asserted in
 * backend/src/seeds/__tests__/claudeStudioFormat.test.ts); this asserts the
 * renderer reads it back. Between them, a class or attribute rename that breaks
 * the card fails a test rather than silently degrading the studio to raw HTML.
 */
import { parseClaudeStudio, STAGE_ORDER, loadDraft, saveDraft, clearDraft, EMPTY_DRAFT } from '../claudeStudioParse';

/** A minimal body that satisfies the contract, mirroring what the seed emits. */
const body = (over: { cert?: string; chat?: string; projects?: string } = {}) => `
<style>.cs{}</style>
<div class="cs" data-claude-studio="1"
     data-chat-url="${over.chat ?? 'https://claude.ai/new'}"
     data-projects-url="${over.projects ?? 'https://claude.ai/projects'}"
     data-cert-active="${over.cert ?? '0'}"
     data-career-asset="An interactive Business Problem Brief"
     data-week-theme="Claude Code Foundations + Workspace">
  <div class="cs-kick">Claude Studio</div>
  <div class="cs-asset"><b>What you walk away with:</b> A brief</div>
  <p>Decide what the workspace is for before you build in it.</p>
  <div class="cs-scenario">Someone has been complaining for months.<span class="cs-role"><b>Your role:</b> The person defending this build</span></div>
  <ul class="cs-obj"><li>Convert an idea into constraints</li><li>Separate symptom from cause</li></ul>
  <section class="cs-stage" data-stage="explore" data-title="Separate symptom from problem" data-min="20">
    <p class="cs-inst">Bring the messy version.</p>
    <ol class="cs-steps"><li>Describe it verbatim</li><li>Ask for root causes</li></ol>
  </section>
  <section class="cs-stage" data-stage="organize" data-title="Load what is true" data-min="15">
    <p class="cs-inst">Move to a Project.</p><ol class="cs-steps"><li>Add constraints</li></ol>
  </section>
  <section class="cs-stage" data-stage="create" data-title="Build the brief" data-min="30">
    <p class="cs-inst">Make it inspectable.</p><ol class="cs-steps"><li>Include assumptions</li></ol>
  </section>
  <section class="cs-stage" data-stage="prove" data-title="Defend it" data-min="10">
    <p class="cs-inst">Two minutes.</p><ol class="cs-steps"><li>Lead with cost of nothing</li></ol>
  </section>
  <div class="cs-prompt" data-prompt="starter" data-label="Interrogate the complaint" data-why="Most briefs encode the first complaint.">
    <div class="cs-plabel">Interrogate the complaint</div><p class="cs-why">Most briefs encode the first complaint.</p>
    <pre class="cs-pre">Here is the situation:
"[paste it]"

Separate symptom from cause.</pre>
  </div>
  <div class="cs-prompt" data-prompt="improve" data-label="Make it measurable" data-why="Turns wishes into numbers.">
    <div class="cs-plabel">Make it measurable</div><p class="cs-why">Turns wishes into numbers.</p>
    <pre class="cs-pre">Rewrite each outcome with a number and a deadline.</pre>
  </div>
  <section class="cs-block" data-block="project"><h4>Week 1 — Problem Framing</h4><ul><li>Your CLAUDE.md</li><li>The process description</li></ul></section>
  <section class="cs-block" data-block="artifact"><h4>Interactive brief</h4><ul><li>Assumptions register</li></ul></section>
  <section class="cs-block cs-trust" data-block="trust"><ul><li>Numbers must trace to a source</li></ul></section>
  <section class="cs-block" data-block="deliverables"><ul><li>The brief</li><li>The register</li></ul></section>
  <section class="cs-block" data-block="reflection">
    <ul><li data-check="1">Every criterion has a number</li><li data-check="1">Five assumptions listed</li></ul>
    <p class="cs-free" data-free-response="1">Which root cause did you reject, and why?</p>
  </section>
  <section class="cs-block" data-block="rubric"><table><tbody><tr data-dimension="Reasoning"><td>Reasoning</td><td>Strong</td><td>Developing</td></tr></tbody></table></section>
</div>`;

describe('parseClaudeStudio — happy path', () => {
  const s = parseClaudeStudio(body())!;

  it('parses a conforming body', () => {
    expect(s).not.toBeNull();
  });

  it('reads the launch targets and certification flag', () => {
    expect(s.chatUrl).toBe('https://claude.ai/new');
    expect(s.projectsUrl).toBe('https://claude.ai/projects');
    expect(s.certActive).toBe(false);
    expect(parseClaudeStudio(body({ cert: '1' }))!.certActive).toBe(true);
  });

  it('reads the career asset and week theme', () => {
    expect(s.careerAsset).toBe('An interactive Business Problem Brief');
    expect(s.weekTheme).toBe('Claude Code Foundations + Workspace');
  });

  it('reads four stages in canonical order with their steps', () => {
    expect(s.stages.map((st) => st.key)).toEqual(STAGE_ORDER);
    expect(s.stages[0].title).toBe('Separate symptom from problem');
    expect(s.stages[0].minutes).toBe(20);
    expect(s.stages[0].steps).toEqual(['Describe it verbatim', 'Ask for root causes']);
  });

  it('reads prompts with their kind, label, why, and exact text', () => {
    expect(s.prompts).toHaveLength(2);
    expect(s.prompts[0].kind).toBe('starter');
    expect(s.prompts[0].label).toBe('Interrogate the complaint');
    // Newlines inside the prompt must survive — it goes to the clipboard as-is.
    expect(s.prompts[0].text).toContain('\n');
    expect(s.prompts[0].text).toContain('[paste it]');
    expect(s.prompts[1].kind).toBe('improve');
  });

  it('separates the scenario from the role', () => {
    expect(s.scenario).toBe('Someone has been complaining for months.');
    expect(s.role).toBe('The person defending this build');
  });

  it('reads the objectives', () => {
    expect(s.objectives).toEqual(['Convert an idea into constraints', 'Separate symptom from cause']);
  });

  it('reads every named block', () => {
    ['project', 'artifact', 'trust', 'deliverables', 'reflection', 'rubric']
      .forEach((name) => expect(s.blocks[name]).toBeDefined());
    expect(s.blocks.project.heading).toBe('Week 1 — Problem Framing');
    expect(s.blocks.deliverables.items).toEqual(['The brief', 'The register']);
  });

  it('reads the reflection checks and the free-response prompt', () => {
    expect(s.checks).toEqual(['Every criterion has a number', 'Five assumptions listed']);
    expect(s.freeResponse).toBe('Which root cause did you reject, and why?');
  });
});

describe('parseClaudeStudio — degradation and safety', () => {
  it('returns null for a body that does not carry the contract', () => {
    expect(parseClaudeStudio('<p>just some html</p>')).toBeNull();
    expect(parseClaudeStudio('')).toBeNull();
  });

  it('returns null when the marker is present but no stages are', () => {
    expect(parseClaudeStudio('<div data-claude-studio="1"><p>nothing</p></div>')).toBeNull();
  });

  it('ignores an unknown stage key rather than rendering it', () => {
    const s = parseClaudeStudio(body().replace('data-stage="organize"', 'data-stage="bogus"'));
    expect(s!.stages.map((st) => st.key)).toEqual(['explore', 'create', 'prove']);
  });

  it('reorders stages emitted out of sequence', () => {
    const shuffled = body()
      .replace('data-stage="explore"', 'data-stage="ZZZ"')
      .replace('data-stage="prove"', 'data-stage="explore"')
      .replace('data-stage="ZZZ"', 'data-stage="prove"');
    expect(parseClaudeStudio(shuffled)!.stages.map((st) => st.key)).toEqual(STAGE_ORDER);
  });

  it('refuses a javascript: launch URL and falls back to the safe default', () => {
    const s = parseClaudeStudio(body({ chat: 'javascript:alert(1)' }))!;
    expect(s.chatUrl).toBe('https://claude.ai/new');
  });

  it('refuses a data: launch URL and falls back to the safe default', () => {
    expect(parseClaudeStudio(body({ projects: 'data:text/html,<h1>x' }))!.projectsUrl)
      .toBe('https://claude.ai/projects');
  });

  it('allows a legitimately retargeted https launch URL', () => {
    expect(parseClaudeStudio(body({ chat: 'https://claude.ai/chat/new' }))!.chatUrl)
      .toBe('https://claude.ai/chat/new');
  });

  it('drops a prompt block with no text rather than offering an empty Copy button', () => {
    const empty = body().replace(/<pre class="cs-pre">Rewrite each outcome with a number and a deadline\.<\/pre>/, '<pre class="cs-pre"></pre>');
    expect(parseClaudeStudio(empty)!.prompts).toHaveLength(1);
  });

  it('treats an unknown prompt kind as a follow-up rather than dropping it', () => {
    const s = parseClaudeStudio(body().replace('data-prompt="improve"', 'data-prompt="weird"'))!;
    expect(s.prompts[1].kind).toBe('followup');
  });
});

describe('draft storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns an empty draft when nothing is saved', () => {
    expect(loadDraft('card-1')).toEqual(EMPTY_DRAFT);
  });

  it('round-trips a draft', () => {
    const d = { ...EMPTY_DRAFT, stages: ['explore' as const], checks: [0, 2], reflection: 'partial thoughts' };
    saveDraft('card-1', d);
    expect(loadDraft('card-1')).toEqual(d);
  });

  it('keeps drafts separate per card', () => {
    saveDraft('card-1', { ...EMPTY_DRAFT, reflection: 'one' });
    saveDraft('card-2', { ...EMPTY_DRAFT, reflection: 'two' });
    expect(loadDraft('card-1').reflection).toBe('one');
    expect(loadDraft('card-2').reflection).toBe('two');
  });

  it('survives corrupt stored JSON', () => {
    window.localStorage.setItem('claude-studio:draft:card-1', '{not json');
    expect(loadDraft('card-1')).toEqual(EMPTY_DRAFT);
  });

  it('discards stage values that are not real stages', () => {
    window.localStorage.setItem('claude-studio:draft:card-1', JSON.stringify({ stages: ['explore', 'nonsense'] }));
    expect(loadDraft('card-1').stages).toEqual(['explore']);
  });

  it('clears a draft', () => {
    saveDraft('card-1', { ...EMPTY_DRAFT, reflection: 'x' });
    clearDraft('card-1');
    expect(loadDraft('card-1')).toEqual(EMPTY_DRAFT);
  });
});
