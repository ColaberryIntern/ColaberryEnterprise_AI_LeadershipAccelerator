import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TimelineBuilderPanel from '../TimelineBuilderPanel';
import {
  resolveTimelineList, moveItemOnDrop, CountAndOverride, StoryBeatOverride, TeachSlideOverride,
  PromptOverride, InteractionPlacement, TimelineSegment, CheckpointLandmark,
} from '../types';

/**
 * Phase 5 (Timeline Builder) tests. `renderToStaticMarkup` can't fire drag
 * events (no real browser DOM), so the drag/drop LOGIC is tested directly as
 * pure functions here (the actual correctness-bearing code) — the render
 * test only proves the panel mounts without throwing against a realistic
 * multi-category, multi-segment shape, same discipline as every other panel
 * smoke test in this directory.
 */

describe('resolveTimelineList', () => {
  const defaults: StoryBeatOverride[] = [{ segment: 'business-problem', icon: '💡', eyebrow: '', title: 'Default beat', tone: 'berry' }];
  const cfg = (overrides: StoryBeatOverride[] | null, enabled = true): CountAndOverride<StoryBeatOverride> => ({ enabled, max: null, overrides });

  it('returns defaults when overrides is null', () => {
    expect(resolveTimelineList(cfg(null), defaults)).toBe(defaults);
  });
  it('returns overrides verbatim when set, ignoring defaults', () => {
    const overrides: StoryBeatOverride[] = [{ segment: 'checkin', icon: '🎯', eyebrow: '', title: 'Custom', tone: 'leaf' }];
    expect(resolveTimelineList(cfg(overrides), defaults)).toBe(overrides);
  });
  it('returns an empty array when disabled, regardless of overrides/defaults', () => {
    const overrides: StoryBeatOverride[] = [{ segment: 'checkin', icon: '🎯', eyebrow: '', title: 'Custom', tone: 'leaf' }];
    expect(resolveTimelineList(cfg(overrides, false), defaults)).toEqual([]);
  });
  it('never truncates by max — capping is display-only in the timeline, not applied to the list a drag writes back', () => {
    const many: StoryBeatOverride[] = [1, 2, 3].map((n) => ({ segment: 'checkin', icon: '💡', eyebrow: '', title: `Beat ${n}`, tone: 'berry' as const }));
    const cappedCfg: CountAndOverride<StoryBeatOverride> = { enabled: true, max: 1, overrides: many };
    expect(resolveTimelineList(cappedCfg, defaults).length).toBe(3);
  });
});

describe('moveItemOnDrop', () => {
  interface Item { segment: string; label: string }
  const items: Item[] = [
    { segment: 'checkin', label: 'A' },
    { segment: 'checkin', label: 'B' },
    { segment: 'challenge', label: 'C' },
  ];
  const getSegment = (i: Item) => i.segment;
  const setSegment = (i: Item, seg: string): Item => ({ ...i, segment: seg });

  it('reorders within the same segment when dropped on another card', () => {
    // Drag B (index 1) onto A (index 0) — both in 'checkin' — B should end up before A.
    const next = moveItemOnDrop(items, 1, 'card::0', getSegment, setSegment);
    expect(next.map((i) => i.label)).toEqual(['B', 'A', 'C']);
    expect(next.map((i) => i.segment)).toEqual(['checkin', 'checkin', 'challenge']);
  });

  it('moves to a different segment when dropped on a card in that segment, inserting at that card\'s position', () => {
    // Drag A (index 0, 'checkin') onto C (index 2, 'challenge') — A should move into 'challenge', taking C's old slot.
    const next = moveItemOnDrop(items, 0, 'card::2', getSegment, setSegment);
    expect(next.map((i) => i.label)).toEqual(['B', 'A', 'C']);
    expect(next.find((i) => i.label === 'A')?.segment).toBe('challenge');
  });

  it('moves to a different segment when dropped on the lane\'s own empty-area droppable, appending after that segment\'s last item', () => {
    const next = moveItemOnDrop(items, 0, 'lane::challenge', getSegment, setSegment);
    expect(next.map((i) => i.label)).toEqual(['B', 'C', 'A']);
    expect(next.find((i) => i.label === 'A')?.segment).toBe('challenge');
  });

  it('dropping on an empty lane with nothing currently in it appends at the end of the list', () => {
    const next = moveItemOnDrop(items, 0, 'lane::trivia', getSegment, setSegment);
    expect(next.map((i) => i.label)).toEqual(['B', 'C', 'A']);
    expect(next.find((i) => i.label === 'A')?.segment).toBe('trivia');
  });

  it('is a no-op (returns the same array reference) when dropped on itself', () => {
    expect(moveItemOnDrop(items, 0, 'card::0', getSegment, setSegment)).toBe(items);
  });

  it('is a no-op when the drop target id is not a recognized card:: or lane:: id', () => {
    expect(moveItemOnDrop(items, 0, 'garbage', getSegment, setSegment)).toBe(items);
  });

  it('is a no-op when the active index is out of range', () => {
    expect(moveItemOnDrop(items, 99, 'card::1', getSegment, setSegment)).toBe(items);
  });
});

describe('TimelineBuilderPanel smoke render', () => {
  const segments: TimelineSegment[] = [
    { id: 'readiness', label: 'Readiness check', startMin: 0, endMin: 10, mode: 'interact' },
    { id: 'build-map', label: 'Build map', startMin: 10, endMin: 20, mode: 'present' },
    { id: 'guided-build', label: 'Guided build', startMin: 20, endMin: 70, mode: 'build' },
    { id: 'reset', label: 'Reset', startMin: 70, endMin: 80, mode: 'break' },
  ];
  const checkpoints: CheckpointLandmark[] = [{ n: 0, label: 'CP0', detail: 'First checkpoint', segment: 'build-map' }];
  const teachItem: TeachSlideOverride = { segment: 'guided-build', eyebrow: '📄 Step', title: 'A lesson', body: 'Body.', bullets: [], code: null, script: '' };
  const promptItem: PromptOverride = { label: 'A prompt', prompt: 'Do it.' };
  const questionItem: InteractionPlacement = { segment: 'readiness', kind: 'trivia', q: 'Quick check?', options: ['A', 'B'] };
  const beatItem: StoryBeatOverride = { segment: 'build-map', icon: '💡', eyebrow: '', title: 'A story beat', tone: 'berry' };
  const noop = () => {};
  const noopAsync = async () => questionItem;

  it('renders every track, checkpoint pin, and break note without throwing (Build Day)', () => {
    const html = renderToStaticMarkup(
      <TimelineBuilderPanel
        dayKind="build" segments={segments} checkpoints={checkpoints}
        breakSegment={{ segment: 'reset', startMin: 70, endMin: 80, label: 'Reset' }}
        storyBeats={{ config: { enabled: true, max: null, overrides: [beatItem] }, defaults: [] }}
        teach={{ config: { enabled: true, max: null, overrides: [teachItem] }, defaults: [] }}
        prompts={{ config: { enabled: true, max: null, overrides: [promptItem] }, defaults: [] }}
        interactions={{ config: { enabled: true, max: null, overrides: [questionItem] }, defaults: [] }}
        onChangeStoryBeats={noop} onChangeTeach={noop} onChangePrompts={noop} onChangeInteractions={noop}
        onJumpToCategory={noop} onGenerateQuestion={noopAsync}
      />,
    );
    expect(html).toContain('Readiness check');
    expect(html).toContain('Guided build');
    expect(html).toContain('A lesson');
    expect(html).toContain('A prompt');
    expect(html).toContain('Quick check?');
    expect(html).toContain('A story beat');
    expect(html).toContain('CP0');
    expect(html).toContain('Reset break');
  });

  it('flags a question misassigned to the break segment as won\'t-render, and never offers "+ add" there (the deck never pushes content to the break)', () => {
    const strandedQuestion: InteractionPlacement = { ...questionItem, segment: 'reset', q: 'Stranded in the break?' };
    const html = renderToStaticMarkup(
      <TimelineBuilderPanel
        dayKind="build" segments={segments} checkpoints={[]} breakSegment={{ segment: 'reset', startMin: 70, endMin: 80, label: 'Reset' }}
        storyBeats={{ config: { enabled: true, max: null, overrides: [] }, defaults: [] }}
        teach={{ config: { enabled: true, max: null, overrides: [] }, defaults: [] }}
        prompts={{ config: { enabled: true, max: null, overrides: [] }, defaults: [] }}
        interactions={{ config: { enabled: true, max: null, overrides: [strandedQuestion] }, defaults: [] }}
        onChangeStoryBeats={noop} onChangeTeach={noop} onChangePrompts={noop} onChangeInteractions={noop}
        onJumpToCategory={noop} onGenerateQuestion={noopAsync}
      />,
    );
    expect(html).toContain('Stranded in the break?');
    expect(html).toContain('render (break)'); // React server-escapes the apostrophe in "won't" — check the unambiguous part
    // Exactly one "+ add here" control per non-break lane — none for the break.
    const addButtonCount = (html.match(/AI-generate a question here/g) || []).length;
    expect(addButtonCount).toBe(segments.filter((s) => s.mode !== 'break').length);
  });

  it('hides the Claude Code track on non-Build-Day sessions and does not throw on empty categories', () => {
    const html = renderToStaticMarkup(
      <TimelineBuilderPanel
        dayKind="architecture" segments={segments} checkpoints={[]} breakSegment={null}
        storyBeats={{ config: { enabled: true, max: null, overrides: null }, defaults: [] }}
        teach={{ config: { enabled: false, max: null, overrides: null }, defaults: [] }}
        prompts={{ config: { enabled: true, max: null, overrides: null }, defaults: [] }}
        interactions={{ config: { enabled: true, max: null, overrides: null }, defaults: [] }}
        onChangeStoryBeats={noop} onChangeTeach={noop} onChangePrompts={noop} onChangeInteractions={noop}
        onJumpToCategory={noop} onGenerateQuestion={noopAsync}
      />,
    );
    expect(html).not.toContain('⌨️ Claude Code');
    expect(html).toContain('Lessons are off for this class.');
  });

  it('shows a "won\'t render" cap indicator for items beyond the category\'s max, without dropping them from the DOM', () => {
    const many: InteractionPlacement[] = [questionItem, { ...questionItem, q: 'Second question?' }];
    const html = renderToStaticMarkup(
      <TimelineBuilderPanel
        dayKind="build" segments={segments} checkpoints={[]} breakSegment={null}
        storyBeats={{ config: { enabled: true, max: null, overrides: null }, defaults: [] }}
        teach={{ config: { enabled: true, max: null, overrides: null }, defaults: [] }}
        prompts={{ config: { enabled: true, max: null, overrides: null }, defaults: [] }}
        interactions={{ config: { enabled: true, max: 1, overrides: many }, defaults: [] }}
        onChangeStoryBeats={noop} onChangeTeach={noop} onChangePrompts={noop} onChangeInteractions={noop}
        onJumpToCategory={noop} onGenerateQuestion={noopAsync}
      />,
    );
    expect(html).toContain('Quick check?');
    expect(html).toContain('Second question?');
    expect(html).toContain('over cap');
  });
});
