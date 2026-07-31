import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StoryBeatsPanel from '../StoryBeatsPanel';
import TeachPanel from '../TeachPanel';
import PromptsPanel from '../PromptsPanel';
import InteractionsPanel from '../InteractionsPanel';
import EvidencePanel from '../EvidencePanel';
import { CountAndOverride, StoryBeatOverride, TeachSlideOverride, PromptOverride, InteractionSlot, EvidenceOverride } from '../types';

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
const slotOff: InteractionSlot = { enabled: false, override: null };
const slotOn: InteractionSlot = { enabled: true, override: null };

const noop = () => {};

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

  it('InteractionsPanel renders the relevant slots per dayKind without throwing', () => {
    const interactions = { mondayPoll: slotOn, mondayTrivia: slotOn, thursdayTrivia: slotOff };
    const defaults = { mondayPoll: { kind: 'poll' as const, q: 'Pick one?', options: ['A', 'B'], answer: null, reveal: 'Reveal.', theater: true }, mondayTrivia: null, thursdayTrivia: null };
    const html = renderToStaticMarkup(
      <InteractionsPanel interactions={interactions} defaults={defaults} theaterEnabled={true} dayKind="architecture" onChange={noop} onToggleTheater={noop} />,
    );
    expect(html).toContain('Pick one?');
    expect(html).toContain('Live Decision Theater');
  });

  it('EvidencePanel renders in defaults and custom modes', () => {
    const html1 = renderToStaticMarkup(<EvidencePanel overrides={null} defaults={[evidence]} onChange={noop} />);
    expect(html1).toContain('A claim.');
    const html2 = renderToStaticMarkup(<EvidencePanel overrides={[evidence]} defaults={[]} onChange={noop} />);
    expect(html2).toContain('+ Add source');
  });
});
