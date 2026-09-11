import { highlightClicked } from '../MessageAsSent';

/**
 * Which link was clicked, marked in the email as sent.
 *
 * The comparison happens on the MASKED forms of both sides: the server masks
 * token-like query values before it returns a click URL or a fetched body, but
 * a held campaign body still carries its own links verbatim, so masking only
 * one side would silently highlight nothing.
 */
const LINK = 'https://enterprise.colaberry.ai/portal/verify?token=***';
const HTML = '<html><head><title>x</title></head><body>'
  + '<p>Hi</p><a href="https://enterprise.colaberry.ai/portal/verify?token=***">Open the portal</a>'
  + '<a href="https://enterprise.colaberry.ai/">Home</a></body></html>';

describe('highlightClicked', () => {
  it('marks only the anchor whose href was clicked, and injects the highlight style into <head>', () => {
    const out = highlightClicked(HTML, [LINK]);
    expect(out).toContain('<a href="https://enterprise.colaberry.ai/portal/verify?token=***" data-clicked="1">');
    expect(out).toContain('<a href="https://enterprise.colaberry.ai/">Home</a>');
    expect(out.indexOf('<style>')).toBeGreaterThan(out.indexOf('<head>'));
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('<title>'));
    expect(out).toContain('a[data-clicked]');
  });

  it('matches through entity-encoded and unmasked hrefs', () => {
    const held = '<a href="https://x.test/go?a=1&amp;token=live-secret&amp;jx=abc">Go</a>';
    const out = highlightClicked(held, ['https://x.test/go?a=1&token=***&jx=abc']);
    expect(out).toContain('data-clicked="1"');
    // The held body itself is not rewritten beyond the marker.
    expect(out).toContain('token=live-secret');
  });

  it('leaves the document untouched when nothing matches or nothing was clicked', () => {
    expect(highlightClicked(HTML, [])).toBe(HTML);
    expect(highlightClicked(HTML, ['https://elsewhere.test/'])).toBe(HTML);
    expect(highlightClicked(HTML, ['https://elsewhere.test/'])).not.toContain('<style>');
  });

  it('prepends the style when the document has no <head>', () => {
    const bare = `<p>x</p><a href='${LINK}'>go</a>`;
    const out = highlightClicked(bare, [LINK]);
    expect(out.startsWith('<style>')).toBe(true);
    expect(out).toContain(`<a href='${LINK}' data-clicked="1">`);
  });
});
