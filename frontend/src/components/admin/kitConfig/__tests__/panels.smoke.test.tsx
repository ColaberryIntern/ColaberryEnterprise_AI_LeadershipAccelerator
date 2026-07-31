import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StoryBeatsPanel from '../StoryBeatsPanel';
import TeachPanel from '../TeachPanel';
import PromptsPanel from '../PromptsPanel';
import InteractionsPanel from '../InteractionsPanel';
import OpeningPanel from '../OpeningPanel';
import EvidencePanel from '../EvidencePanel';
import { CountAndOverride, StoryBeatOverride, TeachSlideOverride, PromptOverride, InteractionPlacement, EvidenceOverride, KitConfig, KitConfigDefaults } from '../types';

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

describe('KitConfig panel smoke rendering', () => {
  it('StoryBeatsPanel renders in defaults and custom modes', () => {
    const base: CountAndOverride<StoryBeatOverride> = { enabled: true, max: null, overrides: null };
    const html1 = renderToStaticMarkup(<StoryBeatsPanel config={base} defaults={[storyBeat]} onChange={noop} />);
    expect(html1).toContain('Story Beats');
    expect(html1).toContain('A real story');
    const custom: CountAndOverride<StoryBeatOverride> = { enabled: true, max: 2, overrides: [storyBeat] };
    const html2 = renderToStaticMarkup(<StoryBeatsPanel config={custom} defaults={[storyBeat]} onChange={noop} />);
    expect(html2).toContain('Remove');
    expect(html2).toContain('will show');
  });

  it('StoryBeatsPanel renders the disabled/empty-defaults state without throwing', () => {
    const off: CountAndOverride<StoryBeatOverride> = { enabled: false, max: null, overrides: null };
    expect(() => renderToStaticMarkup(<StoryBeatsPanel config={off} defaults={[]} onChange={noop} />)).not.toThrow();
  });

  it('TeachPanel renders in defaults and custom modes', () => {
    const base: CountAndOverride<TeachSlideOverride> = { enabled: true, max: null, overrides: null };
    const html1 = renderToStaticMarkup(<TeachPanel config={base} defaults={[teachSlide]} dayLabel="Build Day (Thursday)" onChange={noop} />);
    expect(html1).toContain('A lesson');
    const custom: CountAndOverride<TeachSlideOverride> = { enabled: true, max: null, overrides: [teachSlide] };
    const html2 = renderToStaticMarkup(<TeachPanel config={custom} defaults={[]} dayLabel="Build Day (Thursday)" onChange={noop} />);
    expect(html2).toContain('+ Add lesson slide');
  });

  it('PromptsPanel shows the Lessons-precedence note when this week has deep-teach content', () => {
    const base: CountAndOverride<PromptOverride> = { enabled: true, max: null, overrides: null };
    const html = renderToStaticMarkup(
      <PromptsPanel config={base} defaults={[prompt]} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={false} dayKind="build" onChange={noop} />,
    );
    expect(html).toContain('already renders from');
    expect(html).toContain('Governance gate');
  });

  it('PromptsPanel shows the non-Build-Day message for Architecture Day', () => {
    const base: CountAndOverride<PromptOverride> = { enabled: true, max: null, overrides: null };
    const html = renderToStaticMarkup(
      <PromptsPanel config={base} defaults={[]} buildBayDetail={true} onToggleDetail={noop}
        appliesToThisSession={false} dayKind="architecture" onChange={noop} />,
    );
    expect(html).toContain('only apply to Build Day');
  });

  it('InteractionsPanel renders authored defaults without throwing', () => {
    const base: CountAndOverride<InteractionPlacement> = { enabled: true, max: null, overrides: null };
    const html = renderToStaticMarkup(
      <InteractionsPanel config={base} defaults={[question]} theaterEnabled={true} dayKind="architecture" onChange={noop} onToggleTheater={noop} onGenerateQuestion={noopAsync} />,
    );
    expect(html).toContain('Pick one?');
    expect(html).toContain('Live Decision Theater');
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

  it('EvidencePanel renders in defaults and custom modes', () => {
    const html1 = renderToStaticMarkup(<EvidencePanel overrides={null} defaults={[evidence]} onChange={noop} />);
    expect(html1).toContain('A claim.');
    const html2 = renderToStaticMarkup(<EvidencePanel overrides={[evidence]} defaults={[]} onChange={noop} />);
    expect(html2).toContain('+ Add source');
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
