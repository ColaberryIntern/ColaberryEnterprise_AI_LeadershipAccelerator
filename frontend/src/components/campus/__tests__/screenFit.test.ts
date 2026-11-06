/**
 * C42 (room fix F2): the back-wall screen's fit pass. Text that fits keeps --fit 1; text that overflows steps down 5% at a time until
 * it fits. C117: it never goes below 60% (FIT_MIN); a WIDE overflow counts too (the board wider than the screen, or a word wider
 * than a box marked data-fit-box, such as an Admissions price tile).
 */
import { FIT_MIN, fitScreen, screenOverflows } from '../interior/room3d/RoomBoard';

const fitOf = (el: HTMLElement) => Number(el.style.getPropertyValue('--fit') || '1');

function screen(contentAt1: number, box = 500): HTMLElement {
  const el = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'inner';
  el.appendChild(inner);
  Object.defineProperty(inner, 'scrollHeight', { get: () => Math.round(contentAt1 * fitOf(el)) });
  Object.defineProperty(inner, 'clientHeight', { get: () => box });
  return el;
}

/** A screen whose height fits but which holds one tile with a word `wordAt1` px wide in a `tile` px box. */
function tiled(wordAt1: number, tile = 150): HTMLElement {
  const el = screen(100);
  const t = document.createElement('div');
  t.setAttribute('data-fit-box', '');
  el.querySelector('.inner')!.appendChild(t);
  Object.defineProperty(t, 'scrollWidth', { get: () => Math.round(Math.max(tile, wordAt1 * fitOf(el))) });
  Object.defineProperty(t, 'clientWidth', { get: () => tile });
  return el;
}

it('content that fits keeps the full size', () => {
  const el = screen(480);
  expect(fitScreen(el)).toBe(1);
  expect(el.style.getPropertyValue('--fit')).toBe('1');
});

it('overflowing content steps down 5% at a time until it fits', () => {
  expect(fitScreen(screen(560))).toBe(0.85); // 560 x 0.9 = 504 still over; x 0.85 = 476 fits
  expect(fitScreen(screen(520))).toBe(0.95);
  expect(fitScreen(screen(700))).toBe(0.7); // 700 x 0.7 = 490 fits: below the old 80% floor, which left it clipped
});

it('never below the floor (60%)', () => {
  expect(FIT_MIN).toBe(0.6);
  const el = screen(2000);
  expect(fitScreen(el)).toBe(0.6);
  expect(el.style.getPropertyValue('--fit')).toBe('0.6');
});

it('a word wider than its marked box shrinks the board until it fits (no mid-word break)', () => {
  expect(fitScreen(tiled(140))).toBe(1); // fits
  expect(fitScreen(tiled(180))).toBe(0.8); // 180 x 0.85 = 153 still wide; x 0.8 = 144 fits
});

it('a board wider than the screen counts as overflow; nothing overflowing does not', () => {
  const inner = document.createElement('div');
  Object.defineProperty(inner, 'scrollWidth', { get: () => 900 });
  Object.defineProperty(inner, 'clientWidth', { get: () => 800 });
  expect(screenOverflows(inner)).toBe(true);
  expect(screenOverflows(document.createElement('div'))).toBe(false);
});

it('the same board fits the same way twice (idempotent)', () => {
  const el = screen(560);
  expect(fitScreen(el)).toBe(0.85);
  expect(fitScreen(el)).toBe(0.85);
});
