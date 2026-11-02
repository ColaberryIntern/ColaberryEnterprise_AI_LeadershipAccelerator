import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { BrandSnackbarField } from '../BrandSnackbarField';
import type { Brand } from '../../../../services/adminBrandApi';

/**
 * The switch that the snack bar spent its first weeks without.
 *
 * The feature was deployed and working and showed on nothing, because the only thing that could
 * enable it was a database column with no screen attached. So the cases that matter here are not
 * "does it render" but: does toggling actually send the value, does it send `false` as readily as
 * `true` (an on-switch that cannot turn off is a trap), and does a REFUSED save leave the operator
 * knowing it was refused rather than looking at a switch that lies.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../../services/adminBrandApi', () => ({
  setBrandSnackbarDefault: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../services/adminBrandApi') as {
  setBrandSnackbarDefault: jest.Mock;
};

let container: HTMLDivElement;
let root: Root;

const BRAND: Brand = {
  id: 'b1', tenant_id: 't1', slug: 'colaberry-training', name: 'Colaberry Training',
  status: 'active', default_public_url: null, support_email: null, meta_pixel_id: null,
  snackbar_default_enabled: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(brand: Brand, onSaved: (b: Brand) => void = () => {}) {
  act(() => {
    root.render(<BrandSnackbarField brand={brand} onSaved={onSaved} />);
  });
}

function sw(): HTMLInputElement {
  const el = container.querySelector('input[type="checkbox"]');
  if (!el) throw new Error('switch not rendered');
  return el as HTMLInputElement;
}

/**
 * `.click()` and not a dispatched `change`: React routes checkbox onChange off the click event,
 * so a synthetic `change` toggles the DOM and never reaches the component. The first version of
 * this test did that and five cases failed while the component was perfectly correct.
 */
async function click(el: HTMLInputElement) {
  await act(async () => { el.click(); });
}

describe('BrandSnackbarField', () => {
  it('happy path: turning it on sends true and hands back the saved brand', async () => {
    const saved = { ...BRAND, snackbar_default_enabled: true };
    api.setBrandSnackbarDefault.mockResolvedValue(saved);
    const onSaved = jest.fn();
    mount(BRAND, onSaved);

    await click(sw());

    expect(api.setBrandSnackbarDefault).toHaveBeenCalledWith('b1', true);
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('turning it OFF sends false — the switch has to work both ways', async () => {
    const on = { ...BRAND, snackbar_default_enabled: true };
    api.setBrandSnackbarDefault.mockResolvedValue({ ...on, snackbar_default_enabled: false });
    mount(on);

    expect(sw().checked).toBe(true);
    await click(sw());

    expect(api.setBrandSnackbarDefault).toHaveBeenCalledWith('b1', false);
  });

  it('reflects the brand it was given, rather than local state', () => {
    mount({ ...BRAND, snackbar_default_enabled: true });
    expect(sw().checked).toBe(true);
    expect(container.textContent).toContain('On.');
  });

  it('says plainly when it is off', () => {
    mount(BRAND);
    expect(sw().checked).toBe(false);
    expect(container.textContent).toContain('Off');
  });

  it('failure path: a refused save surfaces the server reason and never reports success', async () => {
    api.setBrandSnackbarDefault.mockRejectedValue({
      response: { data: { error: 'brand is inactive' } },
    });
    const onSaved = jest.fn();
    mount(BRAND, onSaved);

    await click(sw());

    expect(container.textContent).toContain('brand is inactive');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('failure path: an error with no server detail still says the setting did not change', async () => {
    api.setBrandSnackbarDefault.mockRejectedValue(new Error('network down'));
    mount(BRAND);

    await click(sw());

    expect(container.textContent).toContain('unchanged');
  });

  it('boundary: the switch is disabled while the save is in flight, so it cannot be double-sent', async () => {
    let release: (b: Brand) => void = () => {};
    api.setBrandSnackbarDefault.mockReturnValue(new Promise<Brand>((resolve) => { release = resolve; }));
    mount(BRAND);

    await click(sw());
    expect(sw().disabled).toBe(true);

    await act(async () => { release({ ...BRAND, snackbar_default_enabled: true }); });
    expect(sw().disabled).toBe(false);
  });

  it('states the 72-hour window, so an empty bar is not read as a fault', () => {
    mount({ ...BRAND, snackbar_default_enabled: true });
    expect(container.textContent).toContain('72 hours');
  });
});
