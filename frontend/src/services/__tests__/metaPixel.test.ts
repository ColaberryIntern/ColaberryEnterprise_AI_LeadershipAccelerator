jest.mock('../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

/**
 * Each test gets a FRESH copy of the module, because `loading` is module-level state that
 * caches the first result for the life of a page load.
 *
 * That means re-importing the api mock too. `jest.resetModules()` hands the re-imported
 * metaPixel a NEW mock instance from the factory, so a `mockResolvedValue` configured on the
 * old one reaches nothing - which is exactly how the first version of this file failed against
 * working code.
 */
async function freshModule(pixelResponse: unknown | Error) {
  jest.resetModules();
  const apiMod = (await import('../../utils/api')).default as unknown as { get: jest.Mock };
  if (pixelResponse instanceof Error) apiMod.get.mockRejectedValue(pixelResponse);
  else apiMod.get.mockResolvedValue({ data: { meta_pixel_id: pixelResponse } });
  return import('../metaPixel');
}

/**
 * The one rule that matters here: a person is reported as a Lead ONCE.
 *
 * Sohail's snippet fires `fbq('track','Lead')` on every load of /portal/today, and that is the
 * page a student opens daily for twelve weeks. Fired literally, one signup reports as dozens of
 * leads: cost-per-lead looks superb, means nothing, and Meta's optimiser learns to buy people
 * who open portals rather than people who enrol. A test that only checked "Lead was sent" would
 * pass against exactly that bug, so the assertions below are about the SECOND call.
 */

const PIXEL = '2250748725203240';



beforeEach(() => {
  window.localStorage.clear();
  delete (window as { fbq?: unknown }).fbq;
  delete (window as { _fbq?: unknown })._fbq;
  document.head.innerHTML = '';
});

describe('a person is reported once, however often they come back', () => {
  it('fires Lead the first time and never again for the same person', async () => {
    const mod = await freshModule(PIXEL);

    // Install the spy BEFORE loading: the module only injects Meta's bootstrap when window.fbq
    // is absent, so this both counts the events and keeps a real third-party script out of the
    // test. Reading `.mock` off the module's own shim does not work - it is a plain function.
    const fbq = jest.fn();
    (window as unknown as { fbq: jest.Mock }).fbq = fbq;
    const leadCalls = () => fbq.mock.calls.filter((c: unknown[]) => c[1] === 'Lead').length;

    const first = await mod.trackLeadOnce('student@example.com');
    expect(first).toBe(true);
    expect(leadCalls()).toBe(1);

    const second = await mod.trackLeadOnce('student@example.com');
    const third = await mod.trackLeadOnce('student@example.com');

    expect([second, third]).toEqual([false, false]);
    // THE ASSERTION THIS FILE EXISTS FOR: still one, after three visits.
    expect(leadCalls()).toBe(1);
  });

  it('a different person is still reported', async () => {
    // Otherwise the de-duplication would silently suppress every lead after the first visitor
    // on a shared browser, which is the opposite failure and just as quiet.
    const mod = await freshModule(PIXEL);

    await mod.trackLeadOnce('first@example.com');
    const second = await mod.trackLeadOnce('second@example.com');
    expect(second).toBe(true);
  });
});

describe('no pixel configured means no third-party script', () => {
  it.each([null, '', 'not-digits', '123'])('%p loads nothing', async (id) => {
    const mod = await freshModule(id);

    expect(await mod.loadMetaPixel()).toBeNull();
    expect(document.querySelector('script[src*="facebook"]')).toBeNull();
    expect(await mod.trackLeadOnce('student@example.com')).toBe(false);
  });

  it('a valid id DOES load it, so the checks above are not vacuous', async () => {
    const mod = await freshModule(PIXEL);

    expect(await mod.loadMetaPixel()).toBe(PIXEL);
    expect(document.querySelector('script[src*="connect.facebook.net"]')).not.toBeNull();
  });
});

describe('tracking can never break the page it is loaded by', () => {
  it('a failing config request yields no pixel rather than throwing', async () => {
    const mod = await freshModule(new Error('network down'));

    await expect(mod.loadMetaPixel()).resolves.toBeNull();
    await expect(mod.trackLeadOnce('student@example.com')).resolves.toBe(false);
  });

  it('no key means no event - an anonymous visitor is not a lead', async () => {
    const mod = await freshModule(PIXEL);
    expect(await mod.trackLeadOnce('')).toBe(false);
    expect(await mod.trackLeadOnce(null)).toBe(false);
  });

  it('does not fire when storage is unavailable, rather than firing every visit', async () => {
    // Private browsing. Without somewhere to remember, repeating forever is worse for the
    // advertiser than missing one conversion - so the honest choice is to stay quiet.
    const mod = await freshModule(PIXEL);
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    try {
      expect(await mod.trackLeadOnce('student@example.com')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the pixel that saw the PageView is the one that sees the Lead', () => {
  /**
   * The bug this fixes, in full: the landing page carried the right pixel, the portal asked
   * "which pixel belongs to my hostname", and got null - because /lp/colaberry-training/... is
   * served on www.refactored.ai, whose brand has no pixel. One person, one ad click, one
   * signup, and the Lead reported against nobody.
   */
  const CARRIED = '9999888877776666';

  it('prefers the pixel the landing page left behind over the hostname lookup', async () => {
    window.localStorage.setItem('cb.meta.pixel', CARRIED);
    const mod = await freshModule(PIXEL); // host would answer with a DIFFERENT pixel
    expect(await mod.loadMetaPixel()).toBe(CARRIED);
  });

  it('falls back to the hostname when nothing was carried', async () => {
    // Someone who reaches the portal without passing a landing page.
    const mod = await freshModule(PIXEL);
    expect(await mod.loadMetaPixel()).toBe(PIXEL);
  });

  it('ignores a carried value that is not a pixel id', async () => {
    window.localStorage.setItem('cb.meta.pixel', '<script>alert(1)</script>');
    const mod = await freshModule(PIXEL);
    expect(await mod.loadMetaPixel()).toBe(PIXEL);
  });

  it('still reports a Lead against the carried pixel', async () => {
    window.localStorage.setItem('cb.meta.pixel', CARRIED);
    const mod = await freshModule(null); // the host knows nothing, as in production
    const fbq = jest.fn();
    (window as unknown as { fbq: jest.Mock }).fbq = fbq;

    expect(await mod.trackLeadOnce('student@example.com')).toBe(true);
    expect(fbq.mock.calls).toContainEqual(['init', CARRIED]);
    expect(fbq.mock.calls.filter((c: unknown[]) => c[1] === 'Lead')).toHaveLength(1);
  });
});
