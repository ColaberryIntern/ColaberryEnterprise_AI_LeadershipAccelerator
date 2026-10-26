/**
 * C42 (room fix F2): the back-wall screen's fit pass. Text that fits keeps --fit 1; text that overflows steps down 5% at a time until
 * it fits; it never goes below 80% (a very long card is then clamped by its own line clamps, never shrunk to unreadable).
 */
import { fitScreen } from '../interior/room3d/RoomBoard';

function screen(contentAt1: number, box = 500): HTMLElement {
  const el = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'inner';
  el.appendChild(inner);
  const fit = () => Number(el.style.getPropertyValue('--fit') || '1');
  Object.defineProperty(inner, 'scrollHeight', { get: () => Math.round(contentAt1 * fit()) });
  Object.defineProperty(inner, 'clientHeight', { get: () => box });
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
});

it('never below 80%', () => {
  const el = screen(2000);
  expect(fitScreen(el)).toBe(0.8);
  expect(el.style.getPropertyValue('--fit')).toBe('0.8');
});
