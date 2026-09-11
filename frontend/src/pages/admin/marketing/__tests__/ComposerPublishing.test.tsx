import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ComposerPublishing, { type ComposerPublishingProps } from '../composer/ComposerPublishing';
import type { ExternalPublication, PublishingJob } from '../../../../services/contentComposerApi';

/**
 * Spec 8.2: a handoff shows copyable content and a completion receipt - not a fake Publish
 * button. And a dry-run receipt must never read as a live post.
 */

let container: HTMLDivElement;
let root: Root;

const JOB = (over: Partial<PublishingJob>): PublishingJob => ({
  id: 'job-1', provider: 'meta_instagram', state: 'published', publish_at: '2026-11-03T15:00:00.000Z', attempts: 1, max_attempts: 3,
  next_retry_at: null, last_error: null, last_error_class: null, dead_lettered_at: null, dead_letter_reason: null, ...over,
});

const HANDOFF: ExternalPublication = {
  id: 'pub-1', publishing_job_id: 'job-1', provider: 'meta_instagram', external_id: 'handoff:meta_instagram:abc', permalink: null, published_at: null,
  current_status: 'handoff_pending',
  metadata: {
    mode: 'handoff',
    handoff: {
      provider: 'meta_instagram', displayName: 'Instagram', reasons: ['The app is not approved for Instagram (status: not_submitted).'],
      text: 'Join us Thursday. Link in bio.', linkUrl: 'https://enterprise.colaberry.ai/r/ABCD2345', disclosureText: null, mediaRefs: [],
      instructions: '1. Open Instagram as the brand account.\n2. Paste the text exactly as shown.',
    },
  },
};

function render(over: Partial<ComposerPublishingProps> = {}) {
  const props: ComposerPublishingProps = {
    jobs: [JOB({})], publications: [HANDOFF], busy: false,
    onRetry: () => undefined, onCancel: () => undefined, onCompleteHandoff: () => undefined, onRunNow: () => undefined, ...over,
  };
  act(() => { root.render(<ComposerPublishing {...props} />); });
}

function q<T extends Element>(sel: string): T {
  const el = container.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as T;
}

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('a handoff is copyable content plus a completion receipt', () => {
  it('shows the exact text, the reason, the link and the instructions', () => {
    render();
    const card = q<HTMLElement>('[data-testid="handoff-meta_instagram"]');
    expect(card.textContent).toContain('Handoff required');
    expect(card.textContent).toContain('The app is not approved for Instagram');
    expect(q<HTMLTextAreaElement>('[data-testid="handoff-meta_instagram"] textarea').value).toBe('Join us Thursday. Link in bio.');
    expect(card.textContent).toContain('https://enterprise.colaberry.ai/r/ABCD2345');
    expect(card.textContent).toContain('Paste the text exactly as shown.');
    // No button on this card claims to publish.
    for (const b of Array.from(card.querySelectorAll('button'))) expect(b.textContent).not.toMatch(/^Publish$/);
  });

  it('completing requires a post id and sends it with the optional URL', () => {
    const seen: unknown[] = [];
    render({ onCompleteHandoff: (...a) => seen.push(a) });
    const submit = q<HTMLButtonElement>('[data-testid="handoff-meta_instagram"] button[type="submit"]');
    expect(submit.disabled).toBe(true);
    const ext = q<HTMLInputElement>('#ext-pub-1');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(ext, '17895695668004550'); ext.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(submit.disabled).toBe(false);
    act(() => { q<HTMLFormElement>('[data-testid="handoff-meta_instagram"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(seen).toEqual([['pub-1', '17895695668004550', null]]);
  });
});

describe('the job table', () => {
  it('labels a dry-run receipt as a dry run, never as live', () => {
    const dry: ExternalPublication = { ...HANDOFF, id: 'pub-2', current_status: 'live', external_id: 'dryrun:meta_instagram:0123', metadata: { mode: 'dry_run' } };
    render({ publications: [dry] });
    const row = q<HTMLElement>('[data-testid="job-meta_instagram"]');
    expect(row.textContent).toContain('Dry run');
    expect(container.querySelector('[data-testid="handoff-meta_instagram"]')).toBeNull();
  });

  it('offers Retry only for failed or dead-lettered jobs, and shows the reason', () => {
    render({ jobs: [JOB({ state: 'dead_lettered', last_error: 'timeout', last_error_class: 'Error', dead_letter_reason: 'exhausted 3 attempts: Error' })], publications: [] });
    const row = q<HTMLElement>('[data-testid="job-meta_instagram"]');
    expect(row.textContent).toContain('exhausted 3 attempts');
    expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Retry', 'Cancel']);
  });

  it('a published job can be neither retried nor cancelled', () => {
    render({ publications: [] });
    expect(q<HTMLElement>('[data-testid="job-meta_instagram"]').querySelectorAll('button')).toHaveLength(0);
  });

  it('says so when nothing is queued', () => {
    render({ jobs: [], publications: [] });
    expect(container.textContent).toContain('Nothing queued yet');
  });
});
