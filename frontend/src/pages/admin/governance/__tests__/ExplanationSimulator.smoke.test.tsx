import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExplanationSimulator from '../ExplanationSimulator';

/**
 * CAPE Phase 6 (T014). Same no-browser smoke-check pattern as the sibling
 * governance panels: `renderToStaticMarkup` proves the initial render never
 * crashes — the real `fetchGovernancePersonas()` call never fires (no
 * `useEffect` commit phase in static rendering). Also a lightweight,
 * code-review-style assertion that this file contains no mutating HTTP verb
 * anywhere (per this panel's explicit read-only requirement).
 */

describe('ExplanationSimulator (CAPE Phase 6 governance board)', () => {
  it('renders its initial state without throwing', () => {
    expect(() => renderToStaticMarkup(<ExplanationSimulator />)).not.toThrow();
    const html = renderToStaticMarkup(<ExplanationSimulator />);
    expect(html).toContain('Explanation Simulator');
    expect(html).toContain('Look up a student');
  });

  it('never calls a mutating HTTP verb (api.post/put/patch/delete) — read-only by construction', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../ExplanationSimulator.tsx'), 'utf8');
    expect(src).not.toMatch(/api\.(post|put|patch|delete)\(/);
  });
});
