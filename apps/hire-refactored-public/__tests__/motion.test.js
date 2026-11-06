/**
 * The motion contract (MOTION.md), as far as it is assertable without a browser: the
 * timing functions are pure and their numbers are pinned here; the CSS is read as text and
 * checked for the reduced-motion guard and the animate-only-cheap-properties rule. The
 * browser half (60fps, the new tab opening on the same click) is the e2e suite's.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../src/assets/motion.js');
const L = require('../src/assets/launch.js');

const ASSETS = path.join(__dirname, '..', 'src', 'assets');
const css = fs.readFileSync(path.join(ASSETS, 'motion.css'), 'utf8');

describe('3.1 count-up', () => {
  test('lands exactly on the API value at 600ms, and stays there', () => {
    assert.equal(M.COUNT_MS, 600);
    assert.equal(M.countUpValue(600, 137), 137);
    assert.equal(M.countUpValue(5000, 137), 137);
  });

  test('eases out: past the midpoint by half time, never above target', () => {
    assert.ok(M.countUpValue(300, 100) > 50);
    for (let t = 0; t <= 600; t += 16) assert.ok(M.countUpValue(t, 100) <= 100);
  });

  test('shows 0 for a total of 0, with no animation, and survives junk', () => {
    assert.equal(M.countUpValue(0, 0), 0);
    assert.equal(M.countUpValue(300, 0), 0);
    assert.equal(M.countUpValue(300, 'x'), 0);
    assert.equal(M.countUpValue(-50, 10), 0);
  });
});

describe('6 the boot sequence', () => {
  const full = {
    caseStudy: { builder: { name: 'Ann Lee' }, repositories: [{ url: 'https://github.com/a/b' }] },
    hireEvidence: { verifiedCommits: 4, criteriaPassed: 12 },
  };

  test('prints the seven data-bound lines in order when every field exists', () => {
    const lines = L.bootLines('claims-triage', full);
    assert.equal(lines.length, 8); // seven printed lines plus the blank spacer
    assert.match(lines[0], /refactored open --case claims-triage/);
    assert.match(lines[1], /resolving builder[\s\S]*Ann Lee/);
    assert.match(lines[2], /repository[\s\S]*public ✓/);
    assert.match(lines[3], /commits verified[\s\S]*4 \/ 4 ✓/);
    assert.match(lines[4], /acceptance criteria[\s\S]*12 passed ✓/);
    assert.match(lines[5], /★ published/);
    assert.match(lines[7], /→ opening case study/);
  });

  test('OMITS a line whose field is missing - never a tick for something unverified', () => {
    const lines = L.bootLines('x', { caseStudy: { builder: null, repositories: [] } });
    const text = lines.join('\n');
    assert.doesNotMatch(text, /resolving builder/);
    assert.doesNotMatch(text, /repository/);
    assert.doesNotMatch(text, /commits verified/);
    assert.doesNotMatch(text, /acceptance criteria/);
    assert.match(text, /★ published/);
    const zero = L.bootLines('x', { caseStudy: { builder: null, repositories: [] }, hireEvidence: { verifiedCommits: 0, criteriaPassed: 0 } });
    assert.doesNotMatch(zero.join('\n'), /✓/);
  });

  test('escapes the builder name before it reaches the terminal', () => {
    const lines = L.bootLines('x', { caseStudy: { builder: { name: '<b>x</b>' }, repositories: [] } });
    assert.match(lines[1], /&lt;b&gt;x&lt;\/b&gt;/);
  });

  test('runs on the stated rhythm: 0, +380, then +210; hold 450; fade 500; remove +520', () => {
    const plan = L.bootSchedule(8);
    assert.deepEqual(plan.lines, [0, 380, 590, 800, 1010, 1220, 1430, 1640]);
    assert.equal(plan.fadeAt, 1640 + 450);
    assert.equal(plan.removeAt, 1640 + 450 + 520);
    assert.equal(plan.fadeMs, 500);
    assert.ok(plan.removeAt < 3000, 'the overlay never covers content for more than about 3s');
    assert.equal(L.CAP, 4000);
  });
});

describe('5 the launch', () => {
  const src = fs.readFileSync(path.join(ASSETS, 'launch.js'), 'utf8');
  test('never prevents the native click and never opens a window itself', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /preventDefault/);
    assert.doesNotMatch(code, /window\.open/);
  });

  test('replays on every click: remove, force a reflow, re-add', () => {
    assert.match(src, /classList\.remove\('launch'\);\s*void l\.offsetWidth;[^\n]*\n\s*l\.classList\.add\('launch'\)/);
  });

  test('dips and springs over 700ms, with the gold sweep on the same clock', () => {
    assert.match(css, /@keyframes launch\{0%\{transform:scale\(1\)\}35%\{transform:scale\(\.97\)\}70%\{transform:scale\(1\.03\)\}100%\{transform:scale\(1\)\}\}/);
    assert.match(css, /\.launch\{animation:launch var\(--dur-launch\) var\(--ease-launch\)\}/);
    assert.match(css, /\.launch::after\{[^}]*animation:sweep var\(--dur-launch\) forwards/);
    const tokens = fs.readFileSync(path.join(ASSETS, 'tokens.css'), 'utf8');
    assert.match(tokens, /--dur-launch:\s*700ms/);
    assert.match(tokens, /--ease-launch:\s*cubic-bezier\(\.2, \.9, \.3, 1\)/);
  });
});

describe('reduced motion and the cheap-properties rule', () => {
  test('one guard turns every animation and transition off, and un-hides what animates in', () => {
    const guard = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(guard, /animation:none!important;transition:none!important/);
    assert.match(guard, /\.step\.anim\{opacity:1;transform:none\}/);
    assert.match(guard, /\.boot\{display:none\}/);
  });

  test('keyframes animate only transform and opacity (MOTION §0.3)', () => {
    const frames = [...css.matchAll(/@keyframes [\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1]);
    assert.ok(frames.length >= 5);
    for (const f of frames) {
      const props = [...f.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
      for (const p of props) assert.ok(['transform', 'opacity'].includes(p), `keyframe animates ${p}`);
    }
  });

  test('transitions name only transform, opacity, box-shadow, filter or colours - never layout', () => {
    for (const m of css.matchAll(/transition:([^;}]+)/g)) {
      if (m[1].trim().startsWith('none')) continue;
      for (const part of m[1].split(',')) {
        const prop = part.trim().split(/\s+/)[0];
        assert.ok(['transform', 'opacity', 'box-shadow', 'filter', 'border-color', 'color'].includes(prop), `transition on ${prop}`);
      }
    }
  });
});
