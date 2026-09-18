import * as fs from 'fs';
import * as path from 'path';

/**
 * The AI Flotation renderer draws the lower half in the approved format.
 *
 * WHY THIS TEST EXISTS. The format Ali approved on the training site on
 * 2026-09-17 (the build as a rail, what happened next as a status board, the
 * long text folded, "Who built it" standing down when the builder card is the
 * credit) was ported to the training site only. The same record then published
 * on aiflotation.com with a screen-and-a-half dated list and a paragraph per
 * roadmap item, and nothing failed: "the timeline is not on the aiflotation
 * side ... it doesn't have a timeline and bottom format." The shell is plain
 * script with no test of its own, so this runs it in the test DOM against a
 * real projected envelope (trimmed) and asserts the markers a reader sees.
 */

const SHELL = path.resolve(__dirname, '../../../../../packages/case-study-shell/case-study-record.js');
const ENVELOPE = path.resolve(__dirname, '../__fixtures__/shellLowerHalfEnvelope.json');

async function renderShell(): Promise<HTMLElement> {
  const envelope = JSON.parse(fs.readFileSync(ENVELOPE, 'utf8'));
  document.body.innerHTML = '<main id="cs-record"></main>';
  window.history.pushState({}, '', `/results/${envelope.caseStudy.slug}/`);
  const script = document.createElement('script');
  script.setAttribute('data-api', 'https://api.example.test');
  script.setAttribute('data-surface', 'ai-flotation');
  Object.defineProperty(document, 'currentScript', { value: script, configurable: true });
  (global as unknown as { fetch: unknown }).fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(url.includes('limit=') ? { items: [] } : envelope),
  }));
  // eslint-disable-next-line no-new-func
  new Function(fs.readFileSync(SHELL, 'utf8'))();
  // The shell fetches, then renders; let every pending promise settle.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return document.getElementById('cs-record') as HTMLElement;
}

describe('the AI Flotation renderer draws the approved lower half', () => {
  let root: HTMLElement;
  beforeAll(async () => { root = await renderShell(); });

  it('draws the build as a staggered rail with its notes folded', () => {
    const items = root.querySelectorAll('.cs-rail .cs-rail__item');
    expect(items.length).toBe(8);
    expect([...items].slice(0, 2).map((li) => li.getAttribute('data-side'))).toEqual(['up', 'down']);
    // The date reads as a person says it, from the string, never "2026-03-08".
    expect(root.querySelector('.cs-rail time')?.textContent).toBe('8 Mar 2026');
    expect(root.querySelector('[data-testid="story-build-notes"] summary')?.textContent).toBe('Notes on 7 of the 8 steps');
    // Not the old list.
    expect(root.querySelector('.cs-timeline')).toBeNull();
  });

  it('draws what happened next as a status board, the details folded', () => {
    const groups = [...root.querySelectorAll('.cs-next .cs-next__group')];
    expect(groups.map((g) => g.getAttribute('data-status'))).toEqual(['shipped', 'not_pursued']);
    expect(groups[1].querySelector('h3')?.textContent).toBe('Not pursued');
    expect(root.querySelector('[data-testid="story-roadmap-notes"]')).not.toBeNull();
    expect(root.querySelector('.cs-roadmap')).toBeNull();
  });

  it('keeps the first paragraph of what was built standing and folds the rest', () => {
    const band = root.querySelector('[data-band="architecture"]') as HTMLElement;
    const standing = [...band.children].filter((n) => n.tagName !== 'DETAILS').map((n) => n.textContent).join(' ');
    expect(standing).toContain('Interpretation and action are two modules.');
    expect(standing).not.toContain('Detection reads its inputs in a fixed order');
    expect(band.querySelector('[data-testid="story-architecture-more"]')?.textContent).toContain('Detection reads its inputs in a fixed order');
  });

  it('stands "Who built it" down when the builder card already names the only contributor', () => {
    expect(root.querySelector('[data-band="builder"]')).not.toBeNull();
    expect(root.querySelector('[data-band="contributors"]')).toBeNull();
  });

  it('prints no dash in anything a reader sees in the lower half', () => {
    for (const band of ['build', 'roadmap', 'architecture']) {
      expect(root.querySelector(`[data-band="${band}"]`)?.textContent).not.toMatch(/[–—]/);
    }
  });
});
