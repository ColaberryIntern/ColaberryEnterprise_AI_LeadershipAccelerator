import fs from 'fs';
import path from 'path';

/**
 * The admin shell's mobile header shows "Colaberry Admin" in red on white. The brand red (--red-500,
 * #FB2832) is 3.85:1 there, under WCAG AA's 4.5:1 for text, and every admin page shares the header.
 * This reads the token the header actually uses and its value from the colour tokens, so swapping
 * back to a lighter red fails here.
 */
const SRC = path.join(__dirname, '..');
const layout = fs.readFileSync(path.join(SRC, 'AdminLayout.tsx'), 'utf8');
const colors = fs.readFileSync(path.join(SRC, '..', '..', 'colaberry', 'tokens', 'colors.css'), 'utf8');

function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onWhite = (hex: string): number => 1.05 / (luminance(hex) + 0.05);

describe('admin mobile header brand text contrast', () => {
  const token = /admin-mobile-header__brand"[^>]*color: 'var\((--[a-z0-9-]+)\)'/.exec(layout)?.[1];

  it('the header names its colour through a token', () => {
    expect(token).toBeDefined();
  });

  it('that token is at least 4.5:1 on the white header', () => {
    const hex = new RegExp(`${token}:\\s*#([0-9A-Fa-f]{6})`).exec(colors)?.[1];
    expect(hex).toBeDefined();
    expect(onWhite(hex!)).toBeGreaterThanOrEqual(4.5);
  });

  it('the check itself would catch the old brand red (3.85:1)', () => {
    expect(onWhite('FB2832')).toBeLessThan(4.5);
  });
});
