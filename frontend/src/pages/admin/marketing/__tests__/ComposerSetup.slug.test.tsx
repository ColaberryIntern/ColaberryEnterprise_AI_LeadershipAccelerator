import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ComposerSetup, { type CampaignOption, type SetupValues } from '../composer/ComposerSetup';

/**
 * The "no UTM slug" warning used to be a dead end: it told the operator tracked links would
 * be refused and offered nothing to do about it, because nothing in the app could assign a
 * slug. The warning now carries the action, and the action carries the campaign id.
 */

let container: HTMLDivElement;
let root: Root;

const VALUES: SetupValues = {
  brand_id: 'b-1', campaign_id: 'c-1', title: '', destination_url: '', canonical_body: '',
  content_type: 'text', is_paid: false, has_offer: false,
};
const CAMPAIGNS: CampaignOption[] = [
  { id: 'c-1', name: 'Nov Open House', brand_id: 'b-1', utm_campaign_slug: null },
  { id: 'c-2', name: 'Alumni', brand_id: 'b-1', utm_campaign_slug: 'colaberry-awareness-alumni-all-2026q3' },
];

function render(props: Partial<React.ComponentProps<typeof ComposerSetup>> = {}) {
  act(() => {
    root.render(
      <ComposerSetup values={VALUES} brands={[] as any} campaigns={CAMPAIGNS} locked={false} busy={false} onChange={() => {}} onSubmit={() => {}} {...props} />,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('ComposerSetup slug assignment', () => {
  it('offers to assign the slug for a slugless campaign and passes that campaign id', () => {
    const onAssignSlug = jest.fn();
    render({ onAssignSlug });
    const btn = container.querySelector('[data-testid="assign-slug"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toMatch(/Assign UTM slug/);
    act(() => { btn.click(); });
    expect(onAssignSlug).toHaveBeenCalledWith('c-1');
  });

  it('shows no warning and no button once the campaign has a slug', () => {
    render({ values: { ...VALUES, campaign_id: 'c-2' }, onAssignSlug: jest.fn() });
    expect(container.textContent).not.toMatch(/This campaign has no UTM slug/);
    expect(container.querySelector('[data-testid="assign-slug"]')).toBeNull();
  });

  it('disables the button while the page is busy, so a double click cannot fire twice', () => {
    render({ onAssignSlug: jest.fn(), busy: true });
    const btn = container.querySelector('[data-testid="assign-slug"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
