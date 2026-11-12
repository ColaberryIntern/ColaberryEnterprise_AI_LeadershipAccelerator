/**
 * The profile carousel (profile upgrade §1.2): the pure clock in carousel.js, and the motion
 * rules its CSS has to keep. The browser half (hover, focus, hidden tab) is in the e2e suite.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const K = require('../src/assets/carousel.js');

const ASSETS = path.join(__dirname, '..', 'src', 'assets');
const motion = fs.readFileSync(path.join(ASSETS, 'motion.css'), 'utf8').replace(/\r\n/g, '\n');
const portfolioCss = fs.readFileSync(path.join(ASSETS, 'portfolio.css'), 'utf8');

describe('the clock', () => {
  test('advances every 6s, in 100ms ticks', () => {
    assert.equal(K.SLIDE_MS, 6000);
    assert.equal(K.TICK_MS, 100);
    let s = { elapsed: 0 }; let advanced = 0;
    for (let i = 0; i < 60; i += 1) { s = K.tick(s.elapsed, 100, true); if (s.advance) advanced += 1; }
    assert.equal(advanced, 1, 'exactly one advance in 6 seconds');
    assert.equal(s.elapsed, 0, 'the progress resets on the change');
  });

  test('a paused carousel (button, hover, focus, hidden tab, reduced motion) never advances', () => {
    let s = { elapsed: 5900 };
    for (let i = 0; i < 100; i += 1) { s = K.tick(s.elapsed, 100, false); assert.equal(s.advance, false); }
    assert.equal(s.elapsed, 5900, 'and the progress holds where it was');
  });

  test('previous and next wrap both ways', () => {
    assert.equal(K.step(8, 1, 9), 0);
    assert.equal(K.step(0, -1, 9), 8);
    assert.equal(K.step(3, 1, 9), 4);
    assert.equal(K.step(0, 1, 0), 0, 'no slides is safe');
  });
});

describe('motion rules (MOTION.md §0)', () => {
  test('the slide enter keyframes move only opacity and transform, on the launch easing', () => {
    const m = /@keyframes car-in\{([\s\S]*?\})\}/.exec(motion);
    assert.ok(m, 'car-in keyframes exist');
    const props = [...m[1].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
    assert.ok(props.length && props.every((p) => p === 'opacity' || p === 'transform'), 'only opacity/transform: ' + props);
    assert.match(motion, /\.car-slide\.enter\{animation:car-in var\(--dur-fade\) var\(--ease-launch\)\}/);
  });

  test('the progress line is drawn with transform, never by animating width', () => {
    assert.match(portfolioCss, /\.car-progress i\{[^}]*transform:scaleX\(0\)/);
    assert.doesNotMatch(fs.readFileSync(path.join(ASSETS, 'carousel.js'), 'utf8'), /style\.width/);
  });

  test('reduced motion turns every animation off and drops the progress line', () => {
    const guard = motion.slice(motion.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(guard, /animation:none!important/);
    assert.match(guard, /\.car-progress\{display:none\}/);
  });

  test('a thumbnail looks the same on hover and keyboard focus', () => {
    assert.match(motion, /\.thumbs button:hover,\.thumbs button:focus-visible\{/);
  });
});
