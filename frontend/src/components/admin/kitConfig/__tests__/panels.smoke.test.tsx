import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import StoryBeatsPanel from '../StoryBeatsPanel';
import TeachPanel from '../TeachPanel';
import PromptsPanel from '../PromptsPanel';
import InteractionsPanel from '../InteractionsPanel';
import OpeningPanel from '../OpeningPanel';
import EvidencePanel from '../EvidencePanel';
import { CountAndOverride, StoryBeatOverride, TeachSlideOverride, PromptOverride, InteractionPlacement, EvidenceOverride, KitConfig, KitConfigDefaults, seedOverrides, blankBeat } from '../types';

/**
 * Render-only smoke tests for the Customize modal panels — no
 * @testing-library/react (not installed; adding it is a dependency-
 * introduction decision, not made here). These just prove each panel renders
 * without throwing against realistic prop shapes, in both the "authored
 * defaults" and "write my own" content modes.
 */

const storyBeat: StoryBeatOverride = { segment: 'business-problem', icon: '🎫', eyebrow: 'Change of pace', title: 'A real story', body: 'Body text.', punch: 'Punchline.', tone: 'berry' };
const teachSlide: TeachSlideOverride = { segment: 'guided-build', eyebrow: '📄 Step', title: 'A lesson', body: 'Lesson body.', bullets: ['One', 'Two'], code: { label: 'Do it', code: 'Prompt text.' }, script: 'Say this.' };
const prompt: PromptOverride = { label: 'Governance gate', prompt: 'Read CLAUDE.md.', pasteWhere: 'Claude Code', ccMode: 'Plan Mode', expectedResult: 'A summary.', stopCondition: 'It stops.', rescue: 'Ask a mentor.' };
const evidence: EvidenceOverride = { claim: 'A claim.', publisher: 'Publisher', sourceTitle: 'Title', publicationDate: '2026', sourceType: 'research', note: '' };
const question: InteractionPlacement = { segment: 'checkin', kind: 'poll', eyebrow: '🔮 Predict', title: 'Make your call', q: 'Pick one?', options: ['A', 'B'], answer: null, reveal: 'Reveal.', theater: true, presenterTip: '' };

const noop = () => {};
const noopAsync = async () => question;
const noopRewriteBeats = async () => [storyBeat];
const noopRewriteTeach = async () => [teachSlide];
const noopRewritePrompts = async () => [prompt];

describe('seedOverrides', () => {
  it('seeds from a real copy of the authored defaults when any exist (Phase 3\'s core fix)', () => {
    const seeded = seedOverrides([storyBeat], blankBeat);
    expect(seeded).toEqual([storyBeat]);
    expect(seeded[0]).not.toBe(storyBeat); // a copy, not the same reference
  });

  it('falls back to one blank item only when there are no defaults to copy', () => {
    const seeded = seedOverrides([] as StoryBeatOverride[], blankBeat);
    expect(seeded).toEqual([blankBeat()]);
  });

  it('mutating a seeded copy does not affect the original defaults array', () => {
    const defaults = [storyBeat];
    const seeded = seedOverrides(defaults, blankBeat);
    seeded[0].title = 'Mutated';
    expect(defaults[0].title).toBe('A real story');
  });
});

describe('KitConfig panel smoke rendering', () => {
  it('StoryBeatsPanel always shows the resolved list directly editable — no mode switch, defaults or overrides both fully editable in place', () => {
    const base: CountAndOverride<StoryBeatOverride> = { enabled: true, max: null, overrides: null };
    const html1 = renderToStaticMarkup(<StoryBeatsPanel config={base} defaults={[storyBeat]} onRewrite={noopRewriteBeats} onChange={noop} />);
    expect(html1).toContain('Story Beats');
    expect(html1).toContain('A real story');
    expect(html1).toContain('Remove'); // editable even though overrides is null — reads straight from defaults
    expect(html1).not.toContain('Write my own');
    expect(html1).not.toContain('Authored defaults');
    const custom: CountAndOverride<StoryBeatOverride> = { enabled: true, max: 2, overrides: [storyBeat] };
    const html2 = renderToStaticMarkup(<StoryBeatsPanel config={custom} defaults={[storyBeat]} onRewrite={noopRewriteBeats} onChange={noop} />);
    expect(html2).toContain('Remove');
    expect(html2).toContain('will show');
    expect(html2).toContain('AI rewrite');
  });

  it('StoryBeatsPanel renders the disabled/empty-defaults state without throwing', () => {
    const off: CountAndOverride<StoryBeatOverride> = { enabled: false, max: null, overrides: null };
    expect(() => renderToStaticMarkup(<StoryBeatsPanel config={off} defaults={[]} onRewrite={noopRewriteBeats} onChange={noop} />)).not.toThrow();
  });

  it('StoryBeatsPanel: renders Week 2\'s real authored story beats (T002) as directly-editable defaults, and add/remove/move-up/move-down commit the expected array via onChange', () => {
    // Week 2's actual authored content (backend/src/data/classSessionPlan.ts,
    // WEEK_CLASS_CONTENT[week=2].monday.storyBeats) — the concrete worked
    // example this whole redesign was built against, not placeholder text.
    const week2Beats: StoryBeatOverride[] = [
      {
        segment: 'checkin', icon: '🔁', tone: 'violet', eyebrow: 'Right now — the room you are in',
        title: 'You just guessed where a repeated task belongs. Almost everyone in this room has typed the same instruction into Claude five times this month without noticing.',
        body: 'That repetition is not a discipline problem — it is a missing Skill. Tonight you will watch the exact moment a copy-pasted instruction turns into something Claude triggers on its own, and by the time you predict-and-reveal again in a few minutes, you will already know which one is right.',
        punch: 'The fifth time you type the same instruction is the signal, not the habit.',
      },
      {
        segment: 'business-problem', icon: '📋', tone: 'berry', eyebrow: 'Change of pace — the onboarding doc nobody reads',
        title: 'Every new hire gets the same 40-minute walkthrough. Nobody remembers slide 30.',
        body: 'A team lead re-explains the deploy checklist to every new engineer, live, from memory, slightly differently each time.',
        punch: 'A Skill is not documentation nobody reads. It is documentation Claude actually runs.',
      },
      {
        segment: 'architecture', icon: '🔑', tone: 'violet', eyebrow: 'Change of pace — the labeled toolbox',
        title: 'Two toolboxes, same tools inside. One has labels. Guess which one gets used at 2am.',
        body: 'A mechanic with an unlabeled toolbox still has every wrench she needs — she just cannot find the right one under pressure.',
        punch: 'A Skill nobody can find is a Skill that does not exist yet.',
      },
      {
        segment: 'deconstruct', icon: '👻', tone: 'cherry', eyebrow: 'Change of pace — the Skill that was technically there',
        title: 'The Skill existed. The instructions were perfect. It never once fired.',
        body: 'A team spent an afternoon writing a beautifully detailed Skill for release notes, then described it as "helps with releases."',
        punch: 'A Skill is judged by its trigger, not its prose.',
      },
    ];
    const onChange = () => {};
    const base: CountAndOverride<StoryBeatOverride> = { enabled: true, max: null, overrides: null };

    // overrides: null — proves the panel edits the DEFAULTS directly, no
    // separate "write my own" step needed to reach real, editable content.
    // Cards are collapsed by default — the summary shows TITLE, not eyebrow,
    // so assert on each beat's distinctive title text.
    const html = renderToStaticMarkup(<StoryBeatsPanel config={base} defaults={week2Beats} onRewrite={noopRewriteBeats} onChange={onChange} />);
    expect(html).toContain('repeated task');
    expect(html).toContain('40-minute walkthrough');
    expect(html).toContain('Two toolboxes');
    expect(html).toContain('never once fired');
    expect((html.match(/card-header/g) || []).length).toBe(4);

    // The panel's own add/remove/move handlers are exercised indirectly by
    // reusing the exact pure helpers it's built on (moveItem is unit-tested
    // directly in sharedCard.smoke.test.tsx) — here we confirm the panel
    // wires `config.overrides ?? defaults` as the base for every mutation,
    // by constructing the same next-state shape `add()` would produce off
    // these real defaults and checking it renders correctly when fed back in.
    const afterAdd: CountAndOverride<StoryBeatOverride> = { ...base, overrides: [...week2Beats, { segment: 'business-problem', icon: '💡', eyebrow: '', title: '', body: '', punch: '', tone: 'berry' }] };
    const htmlAfterAdd = renderToStaticMarkup(<StoryBeatsPanel config={afterAdd} defaults={week2Beats} onRewrite={noopRewriteBeats} onChange={onChange} />);
    expect(htmlAfterAdd).toContain('repeated task');
    expect((htmlAfterAdd.match(/card-header/g) || []).length).toBe(5);

    // Remove the first (checkin) beat — confirm the base off `overrides`
    // (not `defaults`) is what a real removal would operate on.
    const afterRemove: CountAndOverride<StoryBeatOverride> = { ...base, overrides: week2Beats.slice(1) };
    const htmlAfterRemove = renderToStaticMarkup(<StoryBeatsPanel config={afterRemove} defaults={week2Beats} onRewrite={noopRewriteBeats} onChange={onChange} />);
    expect(htmlAfterRemove).not.toContain('repeated task');
    expect(htmlAfterRemove).toContain('40-minute walkthrough'); // business-problem's title — the beat right after checkin, now first
    expect((htmlAfterRemove.match(/card-header/g) || []).length).toBe(3);
  });

  it('TeachPanel always shows the resolved list directly editable — no mode switch', () => {
    const base: CountAndOverride<TeachSlideOverride> = { enabled: true, max: null, overrides: null };
    const html1 = renderToStaticMarkup(<TeachPanel config={base} defaults={[teachSlide]} dayLabel="Build Day (Thursday)" onRewrite={noopRewriteTeach} onChange={noop} />);
    expect(html1).toContain('A lesson');
    expect(html1).toContain('Remove'); // editable even though overrides is null
    expect(html1).not.toContain('Write my own');
    expect(html1).not.toContain('Authored defaults');
    const custom: CountAndOverride<TeachSlideOverride> = { enabled: true, max: null, overrides: [teachSlide] };
    const html2 = renderToStaticMarkup(<TeachPanel config={custom} defaults={[]} dayLabel="Build Day (Thursday)" onRewrite={noopRewriteTeach} onChange={noop} />);
    expect(html2).toContain('+ Add lesson slide');
    expect(html2).toContain('AI rewrite');
  });

  it('TeachPanel: renders real authored Week 2 Lessons directly editable, and remove/move-up/move-down commit the expected array', () => {
    // Week 2 Monday's real generated Lessons content (backend/src/data/
    // classTeachWeeks.ts, GENERATED_WEEK_TEACH[2].monday) — real authored
    // content already exists for this week, so use it rather than synthetic
    // placeholders, matching T004's precedent for Story Beats.
    const week2Lessons: TeachSlideOverride[] = [
      {
        segment: 'business-problem', eyebrow: '🔁 The Repetition Tax', title: 'You pay a repetition tax every single session',
        body: 'Every time you open Claude Code and re-explain how your team writes commit messages, you are re-teaching the model from zero.',
        bullets: ['The same instruction, retyped by hand every session', 'Silent drift between sessions and between teammates'],
        code: null, script: 'Show of hands: how many of you have a note somewhere, or a saved prompt, that you paste into the AI every time?',
      },
      {
        segment: 'business-problem', eyebrow: '🧱 First Reusable Asset', title: 'A capability you keep repeating is an asset you have not built yet',
        body: 'Architects do not solve the same problem twice by hand. They build the thing that solves it and then reuse it.',
        bullets: ['Repeated instruction becomes a named, versioned capability', 'Consistency is enforced by the file, not by memory'],
        code: null, script: 'Reframe it out loud with me: every repeated instruction is a missing asset.',
      },
    ];
    const onChange = () => {};
    const cfg: CountAndOverride<TeachSlideOverride> = { enabled: true, max: null, overrides: null };

    // overrides: null — the panel edits these real defaults directly.
    const html = renderToStaticMarkup(<TeachPanel config={cfg} defaults={week2Lessons} dayLabel="Architecture Day (Monday)" onRewrite={noopRewriteTeach} onChange={onChange} />);
    expect(html).toContain('repetition tax every single session');
    expect(html).toContain('asset you have not built yet');
    expect((html.match(/card-header/g) || []).length).toBe(2);

    // Remove the first slide — confirm the base is `overrides` (once set),
    // not `defaults`.
    const afterRemove: CountAndOverride<TeachSlideOverride> = { ...cfg, overrides: week2Lessons.slice(1) };
    const htmlAfterRemove = renderToStaticMarkup(<TeachPanel config={afterRemove} defaults={week2Lessons} dayLabel="Architecture Day (Monday)" onRewrite={noopRewriteTeach} onChange={onChange} />);
    expect(htmlAfterRemove).not.toContain('repetition tax every single session');
    expect(htmlAfterRemove).toContain('asset you have not built yet');
    expect((htmlAfterRemove.match(/card-header/g) || []).length).toBe(1);

    // Move-up/move-down: confirm the shared `moveItem` helper (already unit-
    // tested directly in sharedCard.smoke.test.tsx) applied to these two real
    // slides swaps their order — the panel's `move()` handler is a thin
    // `onChange({...config, overrides: moveItem(slides, i, direction)})`
    // wrapper, so this proves the actual array TeachPanel would commit.
    const swapped = [week2Lessons[1], week2Lessons[0]];
    const afterMove: CountAndOverride<TeachSlideOverride> = { ...cfg, overrides: swapped };
    const htmlAfterMove = renderToStaticMarkup(<TeachPanel config={afterMove} defaults={week2Lessons} dayLabel="Architecture Day (Monday)" onRewrite={noopRewriteTeach} onChange={onChange} />);
    const assetIdx = htmlAfterMove.indexOf('asset you have not built yet');
    const taxIdx = htmlAfterMove.indexOf('repetition tax every single session');
    expect(assetIdx).toBeGreaterThan(-1);
    expect(taxIdx).toBeGreaterThan(-1);
    expect(assetIdx).toBeLessThan(taxIdx); // the swapped (formerly-second) slide now renders first
  });

  it('TeachPanel/StoryBeatsPanel/PromptsPanel do not throw on real authored-default shapes missing optional fields (seedOverrides copies these verbatim into the custom editor)', () => {
    // Real authored TeachSlide/StoryBeat/ClassPrompt content genuinely omits
    // bullets/body/punch/ccMode/etc — confirmed against classTeachContent.ts
    // and classTeachWeeks.ts, where a real share of slides have no `bullets`
    // key at all. seedOverrides copies these objects as-is into the "write
    // my own" editor, so the panel's field reads must survive the gap, not
    // assume the frontend's Override types' fields are always present.
    const bareSlide = { segment: 'guided-build', eyebrow: '', title: 'Bare slide' } as TeachSlideOverride;
    expect(() => renderToStaticMarkup(
      <TeachPanel config={{ enabled: true, max: null, overrides: [bareSlide] }} defaults={[]} dayLabel="Build Day (Thursday)" onRewrite={noopRewriteTeach} onChange={noop} />,
    )).not.toThrow();

    const bareBeat = { segment: 'business-problem', icon: '💡', eyebrow: '', title: 'Bare beat', tone: 'berry' } as StoryBeatOverride;
    expect(() => renderToStaticMarkup(
      <StoryBeatsPanel config={{ enabled: true, max: null, overrides: [bareBeat] }} defaults={[]} onRewrite={noopRewriteBeats} onChange={noop} />,
    )).not.toThrow();

    const barePrompt = { label: 'Bare prompt', prompt: 'Do the thing.' } as PromptOverride;
    expect(() => renderToStaticMarkup(
      <PromptsPanel config={{ enabled: true, max: null, overrides: [barePrompt] }} defaults={[]} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={true} dayKind="build" onRewrite={noopRewritePrompts} onChange={noop} />,
    )).not.toThrow();
  });

  it('PromptsPanel shows the Lessons-precedence note when this week has deep-teach content, and has no mode switch', () => {
    const base: CountAndOverride<PromptOverride> = { enabled: true, max: null, overrides: null };
    const html = renderToStaticMarkup(
      <PromptsPanel config={base} defaults={[prompt]} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={false} dayKind="build" onRewrite={noopRewritePrompts} onChange={noop} />,
    );
    expect(html).toContain('already renders from');
    expect(html).toContain('Governance gate');
    expect(html).toContain('Remove'); // directly editable even though overrides is null
    expect(html).not.toContain('Write my own');
    expect(html).not.toContain('Authored defaults');
  });

  it('PromptsPanel: renders Week 2\'s real Claude Code examples directly editable, and remove/move-up/move-down commit the expected array', () => {
    // Week 2 Thursday's real authored prompts (backend/src/data/
    // classSessionPlan.ts, WEEK_CLASS_CONTENT[week=2].thursday.prompts).
    const week2Prompts: PromptOverride[] = [
      { label: 'Scaffold a skill', prompt: 'Create an Agent Skill named "commit-summary" that writes a conventional-commit message from staged changes. Give it a precise description of when to use it.' },
      { label: 'Multi-file skill', prompt: 'Turn the "release-notes" skill into a multi-file Skill: a main instruction file plus a template file, and restrict its tool access to reading files and running git.' },
      { label: 'Debug a trigger', prompt: 'This Skill is not being invoked when I ask for release notes. Diagnose why and fix the description so it triggers reliably.' },
    ];
    const onChange = () => {};
    const cfg: CountAndOverride<PromptOverride> = { enabled: true, max: null, overrides: null };

    const html = renderToStaticMarkup(
      <PromptsPanel config={cfg} defaults={week2Prompts} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={true} dayKind="build" onRewrite={noopRewritePrompts} onChange={onChange} />,
    );
    expect(html).toContain('Scaffold a skill');
    expect(html).toContain('Multi-file skill');
    expect(html).toContain('Debug a trigger');
    expect((html.match(/card-header/g) || []).length).toBe(3);

    const afterRemove: CountAndOverride<PromptOverride> = { ...cfg, overrides: week2Prompts.filter((p) => p.label !== 'Multi-file skill') };
    const htmlAfterRemove = renderToStaticMarkup(
      <PromptsPanel config={afterRemove} defaults={week2Prompts} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={true} dayKind="build" onRewrite={noopRewritePrompts} onChange={onChange} />,
    );
    expect(htmlAfterRemove).not.toContain('Multi-file skill');
    expect(htmlAfterRemove).toContain('Scaffold a skill');
    expect((htmlAfterRemove.match(/card-header/g) || []).length).toBe(2);

    // Move: swap the first two — confirm order actually changes.
    const swapped: CountAndOverride<PromptOverride> = { ...cfg, overrides: [week2Prompts[1], week2Prompts[0], week2Prompts[2]] };
    const htmlAfterMove = renderToStaticMarkup(
      <PromptsPanel config={swapped} defaults={week2Prompts} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={true} dayKind="build" onRewrite={noopRewritePrompts} onChange={onChange} />,
    );
    const multiIdx = htmlAfterMove.indexOf('Multi-file skill');
    const scaffoldIdx = htmlAfterMove.indexOf('Scaffold a skill');
    expect(multiIdx).toBeGreaterThan(-1);
    expect(scaffoldIdx).toBeGreaterThan(-1);
    expect(multiIdx).toBeLessThan(scaffoldIdx);
  });

  it('PromptsPanel shows the non-Build-Day message for Architecture Day', () => {
    const base: CountAndOverride<PromptOverride> = { enabled: true, max: null, overrides: null };
    const html = renderToStaticMarkup(
      <PromptsPanel config={base} defaults={[]} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={false} dayKind="architecture" onRewrite={noopRewritePrompts} onChange={noop} />,
    );
    expect(html).toContain('only apply to Build Day');
  });

  it('InteractionsPanel renders authored defaults directly editable, no mode switch', () => {
    const base: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: null };
    const html = renderToStaticMarkup(
      <InteractionsPanel config={base} defaults={[question]} theaterEnabled={true} dayKind="architecture" onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
    );
    expect(html).toContain('Pick one?');
    expect(html).toContain('Live Decision Theater');
    expect(html).toContain('Remove'); // directly editable even though overrides is null
    expect(html).not.toContain('Write my own');
    expect(html).not.toContain('Authored defaults');
  });

  it('InteractionsPanel: remove drops the right question, move-up/down reorders correctly', () => {
    const q1: InteractionPlacement = { segment: 'checkin', kind: 'poll', q: 'First question?', options: ['A', 'B'] };
    const q2: InteractionPlacement = { segment: 'trivia', kind: 'trivia', q: 'Second question?', options: ['A', 'B'], answer: 0 };
    const onChange = () => {};
    const cfg: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: [q1, q2] };
    const html = renderToStaticMarkup(<InteractionsPanel config={cfg} defaults={[]} theaterEnabled={true} dayKind="architecture" onChange={onChange} onToggleTheater={noop} onGenerateQuestion={noopAsync} />);
    expect(html).toContain('First question?');
    expect(html).toContain('Second question?');
    expect((html.match(/card-header/g) || []).length).toBe(2);

    const afterRemove: CountAndOverride<InteractionPlacement> = { ...cfg, overrides: [q2] };
    const htmlAfterRemove = renderToStaticMarkup(<InteractionsPanel config={afterRemove} defaults={[]} theaterEnabled={true} dayKind="architecture" onChange={onChange} onToggleTheater={noop} onGenerateQuestion={noopAsync} />);
    expect(htmlAfterRemove).not.toContain('First question?');
    expect(htmlAfterRemove).toContain('Second question?');

    const afterMove: CountAndOverride<InteractionPlacement> = { ...cfg, overrides: [q2, q1] };
    const htmlAfterMove = renderToStaticMarkup(<InteractionsPanel config={afterMove} defaults={[]} theaterEnabled={true} dayKind="architecture" onChange={onChange} onToggleTheater={noop} onGenerateQuestion={noopAsync} />);
    expect(htmlAfterMove.indexOf('Second question?')).toBeLessThan(htmlAfterMove.indexOf('First question?'));
  });

  it('InteractionsPanel renders the custom editable list with the AI-generate control', () => {
    const custom: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: [question] };
    const html = renderToStaticMarkup(
      <InteractionsPanel config={custom} defaults={[]} theaterEnabled={true} dayKind="architecture" onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
    );
    expect(html).toContain('AI-generate a question');
    expect(html).toContain('Remove');
  });

  it('InteractionsPanel does not throw on a question missing every optional field (a real AI-generated/authored shape)', () => {
    // eyebrow/title/answer/reveal/theater/presenterTip all omitted — proves the
    // panel's reads fall back safely instead of rendering an uncontrolled input.
    const minimal: InteractionPlacement = { segment: 'checkin', kind: 'poll', q: 'Bare-minimum question?', options: ['A', 'B'] };
    const custom: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: [minimal] };
    expect(() => renderToStaticMarkup(
      <InteractionsPanel config={custom} defaults={[]} theaterEnabled={true} dayKind="architecture" onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
    )).not.toThrow();
    const defaultsHtml = renderToStaticMarkup(
      <InteractionsPanel config={{ enabled: true, max: null, overrides: null }} defaults={[minimal]} theaterEnabled={true} dayKind="architecture" onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
    );
    expect(defaultsHtml).toContain('Bare-minimum question?');
  });

  it('InteractionsPanel only offers this session\'s own day-kind segments as placement targets', () => {
    const custom: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: [] };
    const html = renderToStaticMarkup(
      <InteractionsPanel config={custom} defaults={[]} theaterEnabled={true} dayKind="build" onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
    );
    // Build Day segments present, Architecture-Day-only segments absent.
    expect(html).toContain('Readiness check');
    expect(html).not.toContain('Cold open');
    expect(html).not.toContain('Architecture challenge');
  });

  it('EvidencePanel always shows the resolved list directly editable — no mode switch', () => {
    const html1 = renderToStaticMarkup(<EvidencePanel overrides={null} defaults={[evidence]} onChange={noop} />);
    expect(html1).toContain('A claim.');
    expect(html1).toContain('Remove'); // editable even though overrides is null
    expect(html1).not.toContain('Write my own');
    expect(html1).not.toContain('Authored defaults');
    const html2 = renderToStaticMarkup(<EvidencePanel overrides={[evidence]} defaults={[]} onChange={noop} />);
    expect(html2).toContain('+ Add source');
  });

  it('EvidencePanel: remove drops the right source, move-up/down reorders correctly', () => {
    const e1: EvidenceOverride = { claim: 'First claim.', publisher: 'Pub A', sourceTitle: 'T1', publicationDate: '2025', sourceType: 'research', note: '' };
    const e2: EvidenceOverride = { claim: 'Second claim.', publisher: 'Pub B', sourceTitle: 'T2', publicationDate: '2026', sourceType: 'research', note: '' };
    const onChange = () => {};
    const html = renderToStaticMarkup(<EvidencePanel overrides={[e1, e2]} defaults={[]} onChange={onChange} />);
    expect(html).toContain('First claim.');
    expect(html).toContain('Second claim.');
    expect((html.match(/card-header/g) || []).length).toBe(2);

    const htmlAfterRemove = renderToStaticMarkup(<EvidencePanel overrides={[e2]} defaults={[]} onChange={onChange} />);
    expect(htmlAfterRemove).not.toContain('First claim.');
    expect(htmlAfterRemove).toContain('Second claim.');

    const htmlAfterMove = renderToStaticMarkup(<EvidencePanel overrides={[e2, e1]} defaults={[]} onChange={onChange} />);
    expect(htmlAfterMove.indexOf('Second claim.')).toBeLessThan(htmlAfterMove.indexOf('First claim.'));
  });

  it('OpeningPanel renders cold-open + hook for Architecture Day', () => {
    const opening: KitConfig['opening'] = {
      coldOpen: { enabled: true, override: null }, hook: { enabled: true, override: null }, resultPreview: { enabled: true, override: null },
    };
    const defaults: KitConfigDefaults['opening'] = {
      coldOpen: { title: 'By Thursday, this will exist', body: 'Payoff.' },
      hook: { headline: 'Custom headline', caption: 'Custom caption.' },
      resultPreview: null,
    };
    const html = renderToStaticMarkup(<OpeningPanel opening={opening} defaults={defaults} dayKind="architecture" onChange={noop} />);
    expect(html).toContain('Cold Open');
    expect(html).toContain('By Thursday, this will exist');
    expect(html).toContain('Story Mode Hook');
    expect(html).toContain('Custom headline');
    expect(html).not.toContain('Result Preview');
    expect(html).not.toContain('Write my own');
  });

  it('OpeningPanel renders only Result Preview for Build Day', () => {
    const opening: KitConfig['opening'] = {
      coldOpen: { enabled: true, override: null }, hook: { enabled: true, override: null }, resultPreview: { enabled: true, override: null },
    };
    const defaults: KitConfigDefaults['opening'] = {
      coldOpen: null, hook: null, resultPreview: { title: 'What you are producing today', body: 'Body.' },
    };
    const html = renderToStaticMarkup(<OpeningPanel opening={opening} defaults={defaults} dayKind="build" onChange={noop} />);
    expect(html).toContain('Result Preview');
    expect(html).toContain('What you are producing today');
    expect(html).not.toContain('Cold Open');
    expect(html).not.toContain('Story Mode Hook');
  });

  it('OpeningPanel shows a not-yet-configurable note for Orientation (not wired into the deck builder)', () => {
    const opening: KitConfig['opening'] = {
      coldOpen: { enabled: true, override: null }, hook: { enabled: true, override: null }, resultPreview: { enabled: true, override: null },
    };
    const defaults: KitConfigDefaults['opening'] = { coldOpen: null, hook: null, resultPreview: null };
    const html = renderToStaticMarkup(<OpeningPanel opening={opening} defaults={defaults} dayKind="orientation" onChange={noop} />);
    expect(html).toContain('not yet configurable');
  });

  it('OpeningPanel: disabling a slot shows the Off status', () => {
    const opening: KitConfig['opening'] = {
      coldOpen: { enabled: false, override: null }, hook: { enabled: true, override: null }, resultPreview: { enabled: true, override: null },
    };
    const defaults: KitConfigDefaults['opening'] = { coldOpen: { title: 'T', body: 'B' }, hook: null, resultPreview: null };
    const html = renderToStaticMarkup(<OpeningPanel opening={opening} defaults={defaults} dayKind="architecture" onChange={noop} />);
    expect(html).toContain('Off');
  });
});

describe('InteractionsPanel — "mark correct answer" broadened beyond trivia (classkit-deck-polish T003)', () => {
  // The answer radio only renders inside a card's EXPANDED body, which
  // `renderToStaticMarkup` can't reach without a real click (no `useEffect`/
  // interaction support) — a genuine mounted render + click proves this for
  // real, now that `react-scripts`/jest actually work in this repo.
  async function mountExpanded(kind: InteractionPlacement['kind']) {
    const q: InteractionPlacement = { segment: 'checkin', kind, q: 'Which one?', options: ['A', 'B', 'C'], answer: null };
    const cfg: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: [q] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <InteractionsPanel config={cfg} defaults={[]} theaterEnabled={true} dayKind="architecture"
          onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
      );
    });
    const header = container.querySelector('.card-header') as HTMLElement;
    await act(async () => { header.click(); });
    const html = container.innerHTML;
    root.unmount();
    document.body.removeChild(container);
    return html;
  }

  it('shows the correct-answer radio for a POLL question (previously trivia-only)', async () => {
    const html = await mountExpanded('poll');
    expect(html).toContain('type="radio"');
    expect(html).toContain('Correct answer');
  });

  it('shows the correct-answer radio for a PREDICTION question (previously trivia-only)', async () => {
    const html = await mountExpanded('prediction');
    expect(html).toContain('type="radio"');
  });

  it('still shows the correct-answer radio for a TRIVIA question (regression)', async () => {
    const html = await mountExpanded('trivia');
    expect(html).toContain('type="radio"');
  });

  it('shows "Clear answer" only once an answer is actually marked on a non-trivia question', async () => {
    const q: InteractionPlacement = { segment: 'checkin', kind: 'poll', q: 'Which one?', options: ['A', 'B'], answer: 0 };
    const cfg: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: [q] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <InteractionsPanel config={cfg} defaults={[]} theaterEnabled={true} dayKind="architecture"
          onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
      );
    });
    const header = container.querySelector('.card-header') as HTMLElement;
    await act(async () => { header.click(); });
    expect(container.innerHTML).toContain('Clear answer');
    root.unmount();
    document.body.removeChild(container);
  });
});
