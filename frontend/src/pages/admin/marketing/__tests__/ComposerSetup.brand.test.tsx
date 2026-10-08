import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ComposerSetup, { type SetupValues } from '../composer/ComposerSetup';

/**
 * One brand on this page, and a way to make a campaign.
 *
 * TWO BRANDS USED TO BE SHOWN AT ONCE. The marketing shell holds the brand in a bar above every
 * page and says "Everything below is this brand only". The composer never read it - it kept its
 * own `setup.brand_id` - so the bar could read Colaberry Enterprise while Setup read Colaberry
 * Training, and the post was created under the second. Ali, 2026-10-07, looking at exactly that:
 * "Still have redundnacy with the brands".
 *
 * THE CAMPAIGN PICKER COULD NOT BE FILLED. The create API admitted only email lifecycle types,
 * so every campaign it could make was one this picker filters out: "now I have no way to create
 * Landing page campaign".
 */

let container: HTMLDivElement;
let root: Root;
let onChange: jest.Mock;
let onCreateCampaign: jest.Mock;

const BRANDS = [
  { id: 'b-1', name: 'Colaberry Training' },
  { id: 'b-2', name: 'Colaberry Enterprise' },
] as never;

const VALUES: SetupValues = {
  brand_id: 'b-1', campaign_id: '', title: '', landing_page_id: null, destination_url: '',
  canonical_body: '', content_type: 'text', is_paid: false, has_offer: false, poll: null,
};

async function mount(over: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <ComposerSetup
        values={VALUES}
        brands={BRANDS}
        campaigns={[]}
        locked={false}
        busy={false}
        onChange={onChange}
        onSubmit={() => undefined}
        {...over as never}
      />,
    );
  });
}

function q(sel: string) { return container.querySelector<HTMLElement>(sel); }
function testid(id: string) { return container.querySelector<HTMLElement>(`[data-testid="${id}"]`); }
function brandSelect() { return container.querySelector<HTMLSelectElement>('#composer-brand'); }
function text() { return container.textContent ?? ''; }

function type(el: HTMLElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onChange = jest.fn();
  onCreateCampaign = jest.fn();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('the brand is shown once, not asked for twice', () => {
  it('offers no second picker when the bar above already fixed the brand', async () => {
    await mount({ brandFixedBy: 'scope', brandName: 'Colaberry Training' });
    expect(brandSelect()).toBeNull();
    expect(testid('composer-brand-fixed')!.textContent).toContain('Colaberry Training');
  });

  it('says WHERE the brand came from, so the bar is discoverable', async () => {
    await mount({ brandFixedBy: 'scope', brandName: 'Colaberry Training' });
    expect(text()).toContain('brand bar');
  });

  it('shows a draft\'s own brand as fixed, and says why', async () => {
    // Retargeting an existing post because someone moved a bar would move its tracked links.
    await mount({ brandFixedBy: 'draft', brandName: 'Colaberry Enterprise', locked: true });
    expect(brandSelect()).toBeNull();
    expect(testid('composer-brand-fixed')!.textContent).toContain('Colaberry Enterprise');
    expect(text()).toContain('Fixed when this draft was created');
  });

  it('asks for a brand only when nothing has decided one', async () => {
    // The bar is on "All brands", and a post still needs exactly one.
    await mount({ brandFixedBy: null });
    expect(brandSelect()).not.toBeNull();
    expect(text()).toContain('Choosing here sets the bar too');
  });

  it('renders a name even when the brand list has not arrived', async () => {
    await mount({ brandFixedBy: 'scope', brandName: null });
    expect(testid('composer-brand-fixed')!.textContent).toContain('Not set');
  });
});

describe('a campaign can be created without leaving the post', () => {
  it('offers the door the picker never had', async () => {
    await mount({ onCreateCampaign });
    expect(testid('open-campaign-creator')).not.toBeNull();
  });

  it('does not offer it before a brand exists, because a campaign belongs to one', async () => {
    await mount({ onCreateCampaign, values: { ...VALUES, brand_id: '' } });
    expect(testid('open-campaign-creator')).toBeNull();
  });

  it('does not offer it on a locked draft, where the campaign can no longer change', async () => {
    await mount({ onCreateCampaign, locked: true });
    expect(testid('open-campaign-creator')).toBeNull();
  });

  it('is absent entirely when creation is unavailable', async () => {
    await mount();
    expect(testid('open-campaign-creator')).toBeNull();
  });

  it('refuses a name too short to be a name', async () => {
    await mount({ onCreateCampaign });
    await act(async () => { testid('open-campaign-creator')!.click(); });
    await act(async () => { type(testid('new-campaign-name')!, 'ab'); });
    expect((testid('create-campaign') as HTMLButtonElement).disabled).toBe(true);
  });

  it('hands over the trimmed name', async () => {
    await mount({ onCreateCampaign });
    await act(async () => { testid('open-campaign-creator')!.click(); });
    await act(async () => { type(testid('new-campaign-name')!, '  October $0 class  '); });
    await act(async () => { testid('create-campaign')!.click(); });
    expect(onCreateCampaign).toHaveBeenCalledWith('October $0 class');
  });

  it('promises the slug, because a campaign without one cannot be attributed', async () => {
    await mount({ onCreateCampaign });
    await act(async () => { testid('open-campaign-creator')!.click(); });
    expect(q('[data-testid="campaign-creator"]')!.textContent).toContain('slug');
  });

  it('closes again on cancel, leaving nothing created', async () => {
    await mount({ onCreateCampaign });
    await act(async () => { testid('open-campaign-creator')!.click(); });
    await act(async () => { container.querySelectorAll('button')
      .forEach((b) => { if (b.textContent === 'Cancel') b.click(); }); });
    expect(testid('campaign-creator')).toBeNull();
    expect(onCreateCampaign).not.toHaveBeenCalled();
  });
});
