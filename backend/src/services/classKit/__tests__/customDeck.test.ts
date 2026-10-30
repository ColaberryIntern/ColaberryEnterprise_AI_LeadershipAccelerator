import { injectCustomDeckLive } from '../customDeck';
import { mergeKitConfig } from '../kitConfig';

const LIVE = {
  enabled: true, sessionId: 's1', liveStateUrl: 'https://x/live-state', broadcastUrl: 'https://x/broadcast',
  token: 'tok', checkinUrl: 'https://x/checkin', qrSvg: '<svg></svg>',
};

describe('injectCustomDeckLive', () => {
  it('injects the live block right after <head>, before the deck scripts', () => {
    const out = injectCustomDeckLive('<!doctype html><html><head><title>t</title></head><body><script>run()</script></body></html>', LIVE);
    expect(out.indexOf('window.__KITLIVE__')).toBeGreaterThan(out.indexOf('<head>'));
    expect(out.indexOf('window.__KITLIVE__')).toBeLessThan(out.indexOf('run()'));
  });

  it('cannot be broken out of by a </script> inside a value', () => {
    const out = injectCustomDeckLive('<head></head>', { ...LIVE, qrSvg: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script><script>alert(1)');
    const json = /window\.__KITLIVE__=(.*);<\/script>/.exec(out)![1];
    expect(JSON.parse(json).qrSvg).toBe('</script><script>alert(1)</script>');
  });

  it('still injects when the deck has no <head>', () => {
    expect(injectCustomDeckLive('<body>x</body>', LIVE).startsWith('<script>window.__KITLIVE__=')).toBe(true);
  });

  it('is idempotent in shape: the same input renders the same output', () => {
    expect(injectCustomDeckLive('<head></head>', LIVE)).toBe(injectCustomDeckLive('<head></head>', LIVE));
  });
});

describe('KitConfig.customDeck', () => {
  it('keeps a deck with html, and its guide', () => {
    expect(mergeKitConfig({ customDeck: { html: '<p>x</p>', guideHtml: '<p>g</p>' } }).customDeck)
      .toEqual({ html: '<p>x</p>', guideHtml: '<p>g</p>' });
  });
  it('drops an empty or malformed deck back to the generated one', () => {
    expect(mergeKitConfig({ customDeck: { html: '   ' } }).customDeck).toBeNull();
    expect(mergeKitConfig({ customDeck: 'nope' }).customDeck).toBeNull();
    expect(mergeKitConfig({}).customDeck).toBeNull();
  });
  it('treats a missing guide as null', () => {
    expect(mergeKitConfig({ customDeck: { html: '<p>x</p>' } }).customDeck).toEqual({ html: '<p>x</p>', guideHtml: null });
  });
});
