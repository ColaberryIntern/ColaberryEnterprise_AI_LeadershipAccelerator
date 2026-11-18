import fs from 'fs';
import path from 'path';

/**
 * W20 (Ali, 2026-11-17): the black "Department by department" band on the home page should
 * run all the way across, like the Trust Before Intelligence band. It was boxed because the
 * shared 1200px width rule in fidelityV5.css named the band itself. The band must never carry
 * a max-width; its children do.
 */
const DIR = path.join(__dirname, '..');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function rulesFor(css: string, selector: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m = re.exec(css);
  while (m) {
    const sels = m[1].split(',').map((s) => s.trim());
    if (sels.includes(selector)) out.push(m[2]);
    m = re.exec(css);
  }
  return out;
}

describe('W20: the home rollout band is full bleed', () => {
  const v5 = strip(fs.readFileSync(path.join(DIR, 'fidelityV5.css'), 'utf8'));

  it('no fidelityV5 rule caps the band itself', () => {
    for (const body of rulesFor(v5, '.cbv2-shell .cbv2-h8__rollout')) {
      expect(body).not.toMatch(/max-width/);
    }
  });

  it('keeps the band content at the 1200px page width', () => {
    const inner = rulesFor(v5, '.cbv2-shell .cbv2-h8__rollout > *');
    expect(inner.join(' ')).toMatch(/max-width:\s*1200px/);
  });

  it('heroV8.css still cancels the band max-width', () => {
    const v8 = strip(fs.readFileSync(path.join(DIR, 'heroV8.css'), 'utf8'));
    const own = rulesFor(v8, '.cbv2-h8__rollout');
    expect(own.some((b) => /max-width:\s*none/.test(b))).toBe(true);
  });
});
