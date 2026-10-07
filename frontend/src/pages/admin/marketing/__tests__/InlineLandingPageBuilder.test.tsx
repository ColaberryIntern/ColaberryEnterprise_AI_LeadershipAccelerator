import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * Building a landing page without leaving the post.
 *
 * The button this replaces called `navigate('/admin/marketing/landing-pages')` - it abandoned
 * the composer and took anything unsaved with it. So the behaviours worth pinning are the ones
 * that make staying put safe: the brief gate, the honesty signals from the generator, and what
 * happens when a revision changes nothing.
 *
 * Mocks are created INSIDE the factory and read back through the typed import, because babel
 * hoists `jest.mock` above the declarations and a `const` above it is still in its temporal dead
 * zone when the factory runs.
 */

jest.mock('../../../../services/landingPageApi', () => ({
  createLandingPage: jest.fn(),
  reviseLandingPage: jest.fn(),
  publishLandingPage: jest.fn(),
  previewLandingPage: jest.fn(),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

import * as lp from '../../../../services/landingPageApi';
import InlineLandingPageBuilder, { slugify, MIN_BRIEF } from '../composer/InlineLandingPageBuilder';

const mockCreate = lp.createLandingPage as jest.Mock;
const mockRevise = lp.reviseLandingPage as jest.Mock;
const mockPublish = lp.publishLandingPage as jest.Mock;
const mockPreview = lp.previewLandingPage as jest.Mock;

let container: HTMLDivElement;
let root: Root;
let onPublished: jest.Mock;
let onClose: jest.Mock;

const BRIEF = 'A six week cohort for working analysts, with a mentor review at the end.';

const draft = (over: Record<string, unknown> = {}) => ({
  page: { id: 'lp-1', name: 'October class', slug: 'october-class' },
  content: { sections: [{ type: 'hero', headline: 'Start here' }] },
  placeholders: [],
  unverifiedClaims: [],
  model: 'gpt-4o-mini',
  repaired: false,
  ...over,
});

function q(testid: string) { return container.querySelector<HTMLElement>(`[data-testid="${testid}"]`); }
function text() { return container.textContent ?? ''; }

function type(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mount(over: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <InlineLandingPageBuilder
        brandId="b-1"
        initialName="October class"
        initialBrief={BRIEF}
        busy={false}
        onClose={onClose}
        onPublished={onPublished}
        {...over as never}
      />,
    );
  });
}

async function buildIt() {
  await act(async () => { q('inline-lp-build')!.click(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onPublished = jest.fn();
  onClose = jest.fn();
  mockCreate.mockResolvedValue(draft());
  mockPreview.mockResolvedValue('<!doctype html><title>t</title><h1>Start here</h1>');
  mockPublish.mockResolvedValue({ page: { id: 'lp-1', name: 'October class' }, url: '/lp/b/october-class' });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('it opens in place and says so', () => {
  it('promises the post survives, because that is the whole point', async () => {
    await mount();
    expect(text()).toContain('Nothing in this post is lost while you do this');
  });

  it('starts from the post, so nothing is retyped', async () => {
    await mount();
    expect((q('inline-lp-brief') as HTMLTextAreaElement).value).toBe(BRIEF);
    expect((q('inline-lp-name') as HTMLInputElement).value).toBe('October class');
  });
});

describe('the brief gate', () => {
  it('refuses to build from a scrap, and says how much is needed', async () => {
    await mount({ initialBrief: 'too short' });
    expect((q('inline-lp-build') as HTMLButtonElement).disabled).toBe(true);
    expect(q('inline-lp-brief-note')!.textContent).toContain('couple of sentences');
  });

  it('builds once there is enough to build from', async () => {
    await mount();
    expect((q('inline-lp-build') as HTMLButtonElement).disabled).toBe(false);
    expect(BRIEF.length).toBeGreaterThanOrEqual(MIN_BRIEF);
  });

  it('refuses without a name even when the brief is long', async () => {
    await mount({ initialName: '' });
    expect((q('inline-lp-build') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the web address follows the name, until someone takes it over', () => {
  it('derives the slug while it is untouched', async () => {
    await mount();
    await act(async () => { type(q('inline-lp-name')!, 'Free AI Class!! October'); });
    expect((q('inline-lp-slug') as HTMLInputElement).value).toBe('free-ai-class-october');
  });

  it('stops overwriting it once it has been edited by hand', async () => {
    await mount();
    await act(async () => { type(q('inline-lp-slug')!, 'my-own-address'); });
    await act(async () => { type(q('inline-lp-name')!, 'A Completely Different Name'); });
    expect((q('inline-lp-slug') as HTMLInputElement).value).toBe('my-own-address');
  });

  it('slugify strips punctuation and edge dashes', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
    expect(slugify('A/B — test')).toBe('a-b-test');
  });
});

describe('what the generator reported is shown, not swallowed', () => {
  it('lists placeholders as things to fill before publishing', async () => {
    mockCreate.mockResolvedValue(draft({ placeholders: ['[START DATE]'] }));
    await mount(); await buildIt();
    expect(q('inline-lp-warnings')!.textContent).toContain('[START DATE]');
  });

  it('lists claims the brief does not support', async () => {
    mockCreate.mockResolvedValue(draft({ unverifiedClaims: ['92% placement rate'] }));
    await mount(); await buildIt();
    expect(q('inline-lp-warnings')!.textContent).toContain('92% placement rate');
  });

  it('names sections that were dropped, so the page is not mistaken for complete', async () => {
    mockCreate.mockResolvedValue(draft({ droppedSections: ['bullets (section 3): invalid'] }));
    await mount(); await buildIt();
    expect(q('inline-lp-warnings')!.textContent).toContain('bullets (section 3)');
  });

  it('says when the first attempt had to be repaired', async () => {
    mockCreate.mockResolvedValue(draft({ repaired: true }));
    await mount(); await buildIt();
    expect(q('inline-lp-repaired')).not.toBeNull();
  });

  it('shows no warning block when there is genuinely nothing to warn about', async () => {
    await mount(); await buildIt();
    expect(q('inline-lp-warnings')).toBeNull();
  });
});

describe('the preview', () => {
  it('is handed to the iframe as srcDoc, because a src would 401', async () => {
    await mount(); await buildIt();
    const frame = q('inline-lp-preview') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('srcdoc')).toContain('Start here');
    expect(frame.getAttribute('src')).toBeNull();
  });

  it('says so when it could not be loaded, instead of showing an empty frame', async () => {
    mockPreview.mockRejectedValue(new Error('nope'));
    await mount(); await buildIt();
    expect(q('inline-lp-preview')).toBeNull();
    expect(q('inline-lp-preview-failed')!.textContent).toContain('could not be loaded');
  });
});

describe('revising', () => {
  it('says plainly when the model returned the same page, and keeps the feedback', async () => {
    await mount(); await buildIt();
    await act(async () => { type(q('inline-lp-feedback')!, 'fix the picture links'); });
    mockRevise.mockResolvedValue(draft()); // identical content
    await act(async () => { q('inline-lp-revise')!.click(); });

    expect(q('inline-lp-error')!.textContent).toContain('nothing changed');
    // Kept so it can be reworded rather than retyped.
    expect((q('inline-lp-feedback') as HTMLInputElement).value).toBe('fix the picture links');
  });

  it('clears the box when something actually changed', async () => {
    await mount(); await buildIt();
    await act(async () => { type(q('inline-lp-feedback')!, 'shorter headline'); });
    mockRevise.mockResolvedValue(draft({ content: { sections: [{ type: 'hero', headline: 'Shorter' }] } }));
    await act(async () => { q('inline-lp-revise')!.click(); });

    expect(q('inline-lp-error')).toBeNull();
    expect((q('inline-lp-feedback') as HTMLInputElement).value).toBe('');
  });

  it('puts the preview back when the revision fails, rather than stranding the panel', async () => {
    await mount(); await buildIt();
    await act(async () => { type(q('inline-lp-feedback')!, 'change it'); });
    mockRevise.mockRejectedValue(new Error('boom'));
    await act(async () => { q('inline-lp-revise')!.click(); });

    expect(q('inline-lp-error')).not.toBeNull();
    expect(q('inline-lp-publish')).not.toBeNull();
  });
});

describe('publishing hands the page back to the post', () => {
  it('reports the live page so the composer can select it', async () => {
    await mount(); await buildIt();
    await act(async () => { q('inline-lp-publish')!.click(); });
    expect(onPublished).toHaveBeenCalledWith(expect.objectContaining({ id: 'lp-1' }));
  });

  it('does not hand anything back when publishing fails', async () => {
    mockPublish.mockRejectedValue(new Error('refused'));
    await mount(); await buildIt();
    await act(async () => { q('inline-lp-publish')!.click(); });
    expect(onPublished).not.toHaveBeenCalled();
    expect(q('inline-lp-error')).not.toBeNull();
  });

  it('closing before publishing leaves the post alone', async () => {
    await mount();
    await act(async () => { q('inline-lp-close')!.click(); });
    expect(onClose).toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });
});
