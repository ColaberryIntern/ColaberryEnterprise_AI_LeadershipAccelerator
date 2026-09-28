import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ComposerStepRail from '../composer/ComposerStepRail';
import ComposerSummaryRail from '../composer/ComposerSummaryRail';
import { stepStates, type StepFacts } from '../composer/composerSteps';
import type { ConfirmationSummary, ItemMedia } from '../../../../services/contentComposerApi';

/**
 * The two rails the composer gained: the steps across the top, and "This post" beside them.
 *
 * Between them they answer the questions the stacked form made you scroll for - where am I, what
 * is left, and which account is this actually going out from.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const FACTS: StepFacts = {
  hasItem: true, selectedCount: 1, variantCount: 1, validation: null,
  approved: false, jobCount: 0, itemStatus: 'draft',
};
const step = (key: string) => container.querySelector<HTMLButtonElement>(`[data-testid="step-${key}"]`)!;

describe('the step rail', () => {
  it('shows all five steps, always - a blocked step is dimmed, not hidden', () => {
    act(() => { root.render(<ComposerStepRail states={stepStates(FACTS, 'channels')} facts={FACTS} onGo={() => {}} />); });
    for (const key of ['setup', 'channels', 'preview', 'confirm', 'publishing']) {
      expect(step(key)).not.toBeNull();
    }
    // Hiding what you cannot do yet makes the job look shorter than it is.
    expect(step('publishing').disabled).toBe(true);
  });

  it('a blocked step carries its reason on the control itself', () => {
    act(() => { root.render(<ComposerStepRail states={stepStates(FACTS, 'setup')} facts={FACTS} onGo={() => {}} />); });
    expect(step('publishing').title).toMatch(/Schedule or publish from Confirm/);
  });

  it('marks where you are for a screen reader, not only in colour', () => {
    act(() => { root.render(<ComposerStepRail states={stepStates(FACTS, 'preview')} facts={FACTS} onGo={() => {}} />); });
    expect(step('preview').getAttribute('aria-current')).toBe('step');
    expect(step('setup').getAttribute('aria-current')).toBeNull();
    expect(step('setup').textContent).toContain('✓');
  });

  it('moves to a step you click, and refuses the ones you cannot', () => {
    const onGo = jest.fn();
    act(() => { root.render(<ComposerStepRail states={stepStates(FACTS, 'setup')} facts={FACTS} onGo={onGo} />); });
    act(() => { step('preview').click(); });
    expect(onGo).toHaveBeenCalledWith('preview');
    onGo.mockClear();
    act(() => { step('publishing').click(); });
    expect(onGo).not.toHaveBeenCalled();
  });
});

const MEDIA: ItemMedia[] = [
  { mediaAssetId: 'm1', mimeType: 'image/png', byteSize: 1000, width: 1, height: 1, altText: 'x', position: 0, originalFilename: null, durationMs: null, pages: null },
];

function summary(over: Partial<ConfirmationSummary> = {}): ConfirmationSummary {
  return {
    item: { id: 'ci-1', title: 'AI on Resume', status: 'draft', contentType: 'image', revision: 2, poll: null },
    brand: { id: 'b-1', name: 'Colaberry Training', timezone: 'America/Chicago', timezoneSource: 'brand' },
    campaign: { id: 'c-1', name: 'Explorer Accelerator', slug: 'explorer-2026-09' },
    accounts: [{ provider: 'linkedin_member', displayName: 'LinkedIn (personal profile)', mode: 'direct', reasons: [], account: null }],
    schedule: {
      utc: '2026-09-18T14:45:00.000Z', utcLabel: '2026-09-18 14:45 UTC',
      local: { day: '2026-09-18', time: '9:45 AM', zone: 'CDT', offset: '-05:00', dayLabel: 'Fri, Sep 18' },
      timezone: 'America/Chicago', differsFromUtc: true,
    },
    copy: [], assets: [], links: [{ provider: 'linkedin_member', shortUrl: 'https://refactored.ai/r/7KQ4MZ', finalUrl: 'https://x', utm: {} }],
    linkGaps: [],
    approval: { label: 'Not approved', itemStatus: 'draft', humanApproved: false },
    validation: { ran: false, ok: false, blockerCount: 0, blockers: [] },
    readiness: { canSchedule: false, canPublishNow: false, reasons: [] },
    ...over,
  } as ConfirmationSummary;
}

describe('the "This post" rail', () => {
  const text = () => container.textContent ?? '';

  it('before anything is saved it says so instead of showing empty fields', () => {
    act(() => { root.render(<ComposerSummaryRail summary={null} media={[]} empty />); });
    expect(text()).toMatch(/Nothing is saved yet/);
  });

  it('names the brand, campaign, link and time without leaving the step you are on', () => {
    act(() => { root.render(<ComposerSummaryRail summary={summary()} media={MEDIA} empty={false} />); });
    expect(text()).toContain('Colaberry Training');
    expect(text()).toContain('Explorer Accelerator');
    expect(text()).toContain('refactored.ai/r/7KQ4MZ');
    expect(text()).toContain('1 attached');
    // Central, like every other time on these screens.
    expect(text()).toContain('Fri, Sep 18, 9:45 AM CDT');
  });

  it('says plainly when a direct network has no account - the failure Ali hit on his first post', () => {
    act(() => { root.render(<ComposerSummaryRail summary={summary()} media={[]} empty={false} />); });
    expect(container.querySelector('[data-testid="summary-account-missing"]')!.textContent).toBe('no account connected');
  });

  it('a handoff-only post is not reported as missing an account', () => {
    act(() => {
      root.render(<ComposerSummaryRail
        summary={summary({ accounts: [{ provider: 'x', displayName: 'X', mode: 'handoff', reasons: [], account: null }] })}
        media={[]}
        empty={false}
      />);
    });
    expect(container.querySelector('[data-testid="summary-account-missing"]')).toBeNull();
    expect(text()).toMatch(/by hand/);
  });

  it('reports validation as not run rather than as passed', () => {
    act(() => { root.render(<ComposerSummaryRail summary={summary()} media={[]} empty={false} />); });
    expect(text()).toMatch(/not run/);
    act(() => {
      root.render(<ComposerSummaryRail summary={summary({ validation: { ran: true, ok: false, blockerCount: 2, blockers: [] } })} media={[]} empty={false} />);
    });
    expect(text()).toMatch(/2 blockers/);
  });
});
