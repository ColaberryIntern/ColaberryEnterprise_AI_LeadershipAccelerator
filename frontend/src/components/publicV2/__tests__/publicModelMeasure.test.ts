/**
 * publicModelMeasure.test.ts -- the two measurements that decide where every title on the
 * public site breaks its lines. Ali, 2026-11-16: "Something is off about the services page."
 *
 * The element audit passed (its width tolerance is 12%), but a line-break comparison of all
 * 35 shared titles against the model found 9 breaking in a different place, for two reasons:
 *  - the content column was 1,232px (1280 max, 24px sides) where the model's is 1,144px
 *    (1200 max, 28px sides), so every two-column band ran 40-70px wider;
 *  - page sheets set `text-wrap: balance` on titles, which the model never does.
 * With both fixed, all 35 break where the model breaks them, at 1440 and at 390.
 */
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, '..', 'fidelityV5.css'), 'utf8');
const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');

describe('public pages use the model measure', () => {
  it('caps the content column at the model width: 1200px with 28px sides', () => {
    expect(flat).toContain('.cbv2-shell .cbv2-wrap { max-width: 1200px; padding-inline: 28px; }');
  });

  it('keeps the home hero on the same column as every other band', () => {
    expect(flat).toMatch(/\.cbv2-shell \.cbv2-h8__inner, \.cbv2-shell \.cbv2-h8__verbs, \.cbv2-shell \.cbv2-h8__rollout \{ max-width: 1200px; padding-inline: 28px; \}/);
    expect(flat).toMatch(/\.cbv2-shell \.cbv2-h8__inner \{ grid-template-columns: minmax\(0, 1\.15fr\) minmax\(0, 0\.85fr\); gap: 56px; \}/);
  });

  it('wraps titles normally, as the model does, and never balances them in the shared layer', () => {
    expect(flat).toContain('.cbv2-shell :is(h1, h2, h3) { text-wrap: wrap; }');
    expect(flat).not.toMatch(/text-wrap:\s*balance/);
  });
});
