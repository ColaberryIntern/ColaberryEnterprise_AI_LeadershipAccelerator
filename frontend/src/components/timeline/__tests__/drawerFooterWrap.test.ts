import fs from 'fs';
import path from 'path';

/**
 * The drawer footer holds Close + "Collect points · 23/75%" + "Enter workspace →".
 * At 360px that row cannot grow sideways, so unless it is allowed to WRAP the
 * buttons are squeezed below their content width and the labels wrap inside
 * them instead — the collect button broke across three lines, which is the one
 * control a student blocked on the watch gate is trying to press. Photographed
 * by Mohammed Abdul Aleem on a 360px Android, 2026-11-18.
 *
 * A wrap rule already existed, but only below 560px and only when the
 * celebration element is present. The ordinary three-button case — what a
 * student sees every time — was never covered.
 *
 * jsdom applies no external stylesheet and does no layout, so only the
 * stylesheet source can hold this contract.
 */
const CSS = fs
  .readFileSync(path.join(__dirname, '..', 'timeline.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string | null {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = CSS.match(re);
  return m ? m[1] : null;
}

describe('the video drawer footer wraps instead of crushing its buttons', () => {
  it('REGRESSION: .tld-foot is allowed to wrap at every width', () => {
    const body = ruleBody('.tl-de .tld-foot');
    expect(body).not.toBeNull();
    expect(body).toMatch(/flex-wrap:\s*wrap/);
  });

  it('REGRESSION: footer buttons keep their label on one line and refuse to shrink', () => {
    const body = ruleBody('.tl-de .tld-foot .tl-btn:not(.tld-win-next)');
    expect(body).not.toBeNull();
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/flex:\s*0 0 auto/);
  });

  it('exempts .tld-win-next, which the celebration row hands flex:1 on purpose', () => {
    // The guard is the more specific selector, so without the :not() it would
    // silently beat `.tl-de .tld-win-next{...flex:1}` and undo the wrapped
    // celebration layout. Pin the exemption so a future tidy-up cannot drop it.
    expect(CSS).toMatch(/\.tl-de \.tld-foot \.tl-btn:not\(\.tld-win-next\)/);
    expect(CSS).toMatch(/\.tl-de \.tld-win-next\{[^}]*flex:\s*1/);
  });
});
