/**
 * The setup block says, ON SCREEN, that it is optional.
 *
 * The block has always BEEN optional. Its own docstring says "the webhook is
 * deliberately optional", and the STORY-000 prompt tells the student's agent
 * "If I say skip it, skip it and start building. This is a convenience, not a
 * requirement." Neither of those sentences is anywhere the student can see.
 *
 * What the student CAN see is a titled panel, a numbered checklist, an "n of 3"
 * counter and a shell command carrying a signing secret. That reads as a gate.
 *
 * Swati Raman — curriculum owner, running STORY-000 herself — read it as a gate
 * on 2026-08-19 and asked whether the command was required before building. The
 * counter is what creates the doubt, so the answer is printed next to it.
 *
 * This test fails against unmodified main, where the rendered block contains no
 * statement of optionality at all.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockSetup: Record<string, unknown> | null = null;

jest.mock('../../../../services/workspaceRepoApi', () => ({
  __esModule: true,
  getWebhookSetup: () => (
    mockSetup ? Promise.resolve(mockSetup) : Promise.reject(new Error('not configured'))
  ),
}));

import WebhookSetupBlock from '../WebhookSetupBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
  mockSetup = null;
});

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(<WebhookSetupBlock projectId="p1" repoLabel="SwatiR-Colaberry/SupplyMind_AI" />);
  });
}

const setup = (over: Record<string, unknown> = {}) => ({
  supported: true,
  owner: 'SwatiR-Colaberry',
  repo: 'SupplyMind_AI',
  payload_url: 'https://enterprise.colaberry.ai/api/webhook/github',
  secret: 's3cr3t',
  content_type: 'json',
  events: ['push'],
  gh_command: 'HOOK_ID=$(gh api ...); fi',
  settings_url: 'https://github.com/SwatiR-Colaberry/SupplyMind_AI/settings/hooks/new',
  last_delivery_at: null,
  last_push_at: null,
  ...over,
});

describe('the block states that it is optional', () => {
  it('says so while there is still setup to do', async () => {
    mockSetup = setup();
    await mount();

    const text = container.textContent || '';
    expect(text).toContain('Optional');
    // The point is not the word, it is the consequence: skipping costs speed,
    // never verification. A student who reads only this line must not conclude
    // that their story will fail to verify.
    expect(text).toContain('Sync from GitHub');
  });

  it('does not contradict the counter it sits next to', async () => {
    mockSetup = setup();
    await mount();

    // The counter still reports real progress; optionality is a separate claim
    // and must not have been implemented by deleting the checklist.
    expect(container.querySelectorAll('.rt-hook-step').length).toBeGreaterThan(0);
    expect(container.querySelector('.rt-hook-count')).toBeTruthy();
  });

  it('is absent when the platform never offered a webhook at all', async () => {
    // Unconfigured platform: the block fails soft and renders nothing, so there
    // is no stray "Optional" line floating on a page with no setup on it.
    mockSetup = null;
    await mount();

    expect(container.textContent || '').not.toContain('Optional');
  });
});
