/**
 * D14 — the wordmark is artwork, in all three places, and stays that way.
 *
 * Two different jobs here, deliberately kept apart:
 *
 *   1. The component renders the artwork at the right size and says the right thing to a
 *      screen reader.
 *   2. A SOURCE SCAN proving no hand-set logotype came back. The acceptance criterion is
 *      "no hand-set Quicksand wordmark remains", which is a statement about the repo, not
 *      about one rendered component. Rendering tests cannot see a fourth page adding its own
 *      `.xyz-wordmark` next month; the scan can.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import fs from 'fs';
import path from 'path';
import ColaberryLockup from '../ColaberryLockup';

let container: HTMLDivElement;
let root: Root;

function draw(node: React.ReactElement): HTMLImageElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(node);
  });
  return container.querySelector('img') as HTMLImageElement;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('ColaberryLockup', () => {
  it('renders the horizontal lockup artwork', () => {
    expect(draw(<ColaberryLockup />).getAttribute('src')).toBe('/colaberry-horizontal.png');
  });

  it('derives width from height so the artwork cannot be squashed', () => {
    const img = draw(<ColaberryLockup height={51} />);

    // The art is 436x102, so a height of 51 is exactly half: 218 wide.
    expect(img.getAttribute('height')).toBe('51');
    expect(img.getAttribute('width')).toBe('218');
  });

  it('is decorative by default, because it usually sits inside a labelled link', () => {
    expect(draw(<ColaberryLockup />).getAttribute('alt')).toBe('');
  });

  it('takes a real alt where it is the only thing naming the site', () => {
    expect(draw(<ColaberryLockup alt="Colaberry" />).getAttribute('alt')).toBe('Colaberry');
  });
});

describe('no hand-set wordmark survives anywhere in the app', () => {
  const SRC = path.join(__dirname, '..', '..', '..');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(full, out);
      } else if (/\.(tsx?|css)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  const files = walk(SRC);

  it('scans a believable number of files, so a broken walk cannot pass as a clean result', () => {
    // Without this, a typo in the path above makes every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(200);
  });

  it('has no `<span>C</span>olaberry` split-letter logotype left', () => {
    // The hand-set mark is recognisable by its split first letter: a "C" in its own element
    // so it can be coloured separately, immediately followed by "olaberry".
    const offenders = files.filter((f) =>
      />\s*C\s*<\/span>olaberry/.test(fs.readFileSync(f, 'utf8')),
    );

    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('has no `-wordmark` CSS class left to style one with', () => {
    const offenders = files.filter((f) => /[\w-]+-wordmark\b/.test(fs.readFileSync(f, 'utf8')));

    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
