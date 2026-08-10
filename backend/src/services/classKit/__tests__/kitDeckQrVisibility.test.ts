import { DECK_CSS } from '../kitDeckStyles';

/**
 * The check-in QR has failed students twice, in two different ways, and both
 * failures are cheap to reintroduce by "tidying" the CSS. This pins both.
 *
 *  1. It was gated on the instructor pressing "Start class", so on nights that
 *     was skipped the QR existed on the cover slide alone for a 2-hour class
 *     (fixed in kitDeckScript; covered by kitDeckScript.test.ts).
 *  2. It was 52px. The check-in URL is ~70 characters
 *     (https://…/portal/class-checkin/<uuid>), roughly a 37x37 module QR, so
 *     52px is ~1.4 screen pixels per module BEFORE the deck is screenshared and
 *     re-compressed by the video call. Students reported they could not read it
 *     even in normal mode. That is arithmetic, not bad luck.
 *
 * It was also hidden outright in Focus/Video mode — the mode used while
 * recording, i.e. exactly when latecomers are most likely to need it.
 */

function px(prop: string, block: string): number | null {
  const m = block.match(new RegExp(prop + ':\\s*(\\d+)px'));
  return m ? Number(m[1]) : null;
}

describe('Class Kit deck — check-in QR readability', () => {
  it('renders the QR large enough to survive a screenshare', () => {
    const box = DECK_CSS.match(/\.klateqr-box\{[^}]*\}/)?.[0] ?? '';
    const width = px('width', box);
    const height = px('height', box);

    expect(width).not.toBeNull();
    // ~4px per module at 37 modules. Below ~120px it stops scanning off a
    // shared screen, which is the reported failure.
    expect(width as number).toBeGreaterThanOrEqual(120);
    expect(height).toBe(width);
  });

  it('is NOT hidden in Focus/Video mode — that is when latecomers need it most', () => {
    const focusRules = DECK_CSS.split('\n').filter((l) => l.includes('body.focus') && l.includes('klateqr'));
    expect(focusRules.length).toBeGreaterThan(0);
    for (const rule of focusRules) {
      expect(rule).not.toMatch(/display:\s*none/);
    }
  });

  it('repositions to the bottom-right in Focus mode rather than overlapping framed content', () => {
    const focusRule = DECK_CSS.split('\n').find((l) => l.includes('body.focus') && l.includes('klateqr')) ?? '';
    expect(focusRule).toMatch(/bottom:/);
    expect(focusRule).toMatch(/right:/);
  });

  it('never fades on idle — a QR at low opacity is a QR that does not scan', () => {
    const idleFade = DECK_CSS.split('\n').filter((l) => l.includes('body.idle') && l.includes('klateqr'));
    expect(idleFade).toHaveLength(0);
  });
});
