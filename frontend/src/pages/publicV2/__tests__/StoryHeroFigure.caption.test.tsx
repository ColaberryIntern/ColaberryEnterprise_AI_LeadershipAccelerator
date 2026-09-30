/**
 * The synthetic-narration caption must not promise figures that are not there.
 *
 * It read "the figures it states are the verified metrics recorded below" on
 * every record with a narrated walkthrough. On 2026-09-13 the figures were
 * removed from all three live records, and the sentence became false on each:
 * the narration counts things, and there was nothing below to check it against.
 * The disclosure that the voice is synthetic is the half that must always be
 * said; the promise about metrics is the half that has to be earned.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { StoryHeroFigure } from '../StoryHeroFigure';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => { root.unmount(); }); document.body.removeChild(container); });
const mount = async (ui: React.ReactElement) => {
  await act(async () => { root = createRoot(container); root.render(ui); });
};

const video = (over: Record<string, unknown> = {}) => ({
  url: 'https://enterprise.colaberry.ai/site-v2/walkthrough.mp4',
  title: 'How it works',
  posterUrl: 'https://enterprise.colaberry.ai/site-v2/poster.png',
  captionsUrl: null,
  durationSeconds: 84,
  narrationSource: 'synthetic',
  embedUrl: null,
  ...over,
}) as any;

const caption = () => (container.querySelector('.cbv2-story__walkthrough-note')?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('the synthetic narration caption', () => {
  it('always discloses the synthetic voice, with figures or without', async () => {
    await mount(<StoryHeroFigure video={video()} cover={null} figuresBelow />);
    expect(caption()).toContain('Narrated by a synthetic voice');
    act(() => { root.unmount(); });
    await mount(<StoryHeroFigure video={video()} cover={null} figuresBelow={false} />);
    expect(caption()).toContain('Narrated by a synthetic voice');
  });

  it('promises verified metrics below ONLY when the record publishes some', async () => {
    await mount(<StoryHeroFigure video={video()} cover={null} figuresBelow />);
    expect(caption()).toContain('verified metrics recorded below');
  });

  it('says instead that the record publishes no figures when it does not', async () => {
    await mount(<StoryHeroFigure video={video()} cover={null} figuresBelow={false} />);
    expect(caption()).not.toContain('verified metrics recorded below');
    expect(caption()).toContain('publishes no figures');
  });

  it('defaults to the honest half: an omitted prop must not promise metrics', async () => {
    // A caller that forgets the prop gets the claim that is true of every
    // record, not the one that happens to be true of some.
    await mount(<StoryHeroFigure video={video()} cover={null} />);
    expect(caption()).not.toContain('verified metrics recorded below');
  });

  it('says nothing about narration when a human recorded it', async () => {
    await mount(<StoryHeroFigure video={video({ narrationSource: 'human' })} cover={null} figuresBelow={false} />);
    expect(caption()).toBe('How it works');
  });
});
