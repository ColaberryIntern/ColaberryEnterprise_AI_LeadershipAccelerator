/**
 * The scaffold: the build produces every route nginx falls through to, the brand
 * config ships no identifiers, and the one token this app owns is set in BOTH themes.
 *
 * node's own test runner, like apps/ai-flotation-public: this app ships no dependencies
 * and is not going to start for an assertion library.
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.join(__dirname, '..');
const DIST = path.join(APP, 'dist');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

describe('build output', () => {
  before(() => {
    execFileSync(process.execPath, [path.join(APP, 'build.js')], { stdio: 'pipe' });
  });

  test('emits the four shells nginx falls through to', () => {
    for (const page of ['index.html', 'talent/record/index.html', 'case-studies/record/index.html', 'intro/index.html']) {
      assert.ok(fs.existsSync(path.join(DIST, page)), `missing ${page}`);
    }
  });

  test('substitutes the platform API base into every shell, leaving no raw token', () => {
    for (const page of ['index.html', 'talent/record/index.html', 'case-studies/record/index.html', 'intro/index.html']) {
      const html = read(DIST, page);
      assert.doesNotMatch(html, /\{\{brand\./, `${page} still carries a {{brand.*}} token`);
      assert.match(html, /data-api="https?:\/\//, `${page} has no data-api base`);
    }
  });

  test('ships each shell with its honest empty or not-found state already in the HTML', () => {
    assert.match(read(DIST, 'index.html'), /Nobody is listed yet/);
    assert.match(read(DIST, 'talent/record/index.html'), /This profile isn't listed/);
    assert.match(read(DIST, 'case-studies/record/index.html'), /isn't published here/);
  });

  test('keeps the record shells noindex by default', () => {
    assert.match(read(DIST, 'talent/record/index.html'), /<meta name="robots" content="noindex, nofollow"/);
    assert.match(read(DIST, 'case-studies/record/index.html'), /<meta name="robots" content="noindex, nofollow"/);
  });
});

describe('brand config', () => {
  test('names slugs only, never a server-resolved identifier', () => {
    const config = require('../brand.config');
    assert.equal(config.sourceSlug, 'hire-refactored');
    assert.equal(config.brandSlug, 'refactored');
    assert.equal(config.publicUrl, 'https://hire.refactored.ai');
    for (const banned of ['tenantId', 'brandId', 'apiKey', 'secret']) {
      assert.equal(Object.prototype.hasOwnProperty.call(config, banned), false);
    }
  });
});

describe('tokens', () => {
  const css = read(APP, 'src', 'assets', 'tokens.css');
  const block = (selector) => {
    const at = css.indexOf(selector);
    assert.ok(at >= 0, `no ${selector} block`);
    return css.slice(at, css.indexOf('}', at));
  };

  test('imports the vendored Refactored tokens instead of restating hex values', () => {
    assert.match(css, /@import url\("\.\/design\/tokens\/colors\.css"\)/);
    assert.doesNotMatch(css, /--accent\s*:/, 'the Refactored accent must come from the vendored file');
  });

  test('sets --star in the dark default, the explicit light theme and the light preference', () => {
    assert.match(block(':root {'), /--star:\s*#F2C14E/);
    assert.match(block(':root[data-theme="light"]'), /--star:\s*#B7860B/);
    assert.match(block(':root:not([data-theme="dark"])'), /--star:\s*#B7860B/);
  });

  test('vendors the design system byte-for-byte from the Refactored app it mirrors', () => {
    const ours = read(APP, 'src', 'assets', 'design', 'tokens', 'colors.css');
    const theirs = read(APP, '..', 'refactored-public', 'src', 'assets', 'design', 'tokens', 'colors.css');
    assert.equal(ours, theirs);
  });
});
