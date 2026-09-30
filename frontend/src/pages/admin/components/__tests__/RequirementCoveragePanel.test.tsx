import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import RequirementCoveragePanel from '../RequirementCoveragePanel';
import type { RequirementCoverage } from '../../../../services/adminInternshipApi';

/**
 * The screen that answers "show me what was dropped".
 *
 * Two things it has to get right, and they pull against each other: an
 * unaccounted area must be impossible to miss, and the panel must not claim
 * more than was measured. The comparison is per AREA — a plan requirement
 * cites the dimension it came from, never an item id — so "nothing in the plan
 * cites this" is the truthful phrasing and "missing requirement" is not.
 */

const coverage = (over: Partial<RequirementCoverage> = {}): RequirementCoverage => ({
  stated_items: 3,
  planned_requirements: 2,
  dimensions: [
    {
      dimension: 'constraints', label: 'Constraints',
      stated: ['Never auto-submit a bid.', 'Runs inside our VPC.'],
      requirement_ids: ['REQ-001'], unaccounted: false,
    },
    {
      dimension: 'approval_points', label: 'Approval points',
      stated: ['A director signs off over $50k.'],
      requirement_ids: [], unaccounted: true,
    },
  ],
  unaccounted_dimensions: ['approval_points'],
  requirements_without_provenance: [],
  dropped: [],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = (c: RequirementCoverage, summary?: string | null) => {
  act(() => { root.render(<RequirementCoveragePanel coverage={c} summary={summary} />); });
};

beforeEach(() => {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('an area nothing cites', () => {
  it('is called out in the header count', () => {
    render(coverage());
    expect(container.textContent).toContain('1 area not cited');
  });

  it('is opened by default, so it is not hidden behind a click', () => {
    // The whole point is that it cannot be missed. A collapsed warning is a
    // warning nobody reads.
    render(coverage());
    const open = Array.from(container.querySelectorAll('details')).filter((d) => (d as HTMLDetailsElement).open);
    expect(open).toHaveLength(1);
    expect(open[0].textContent).toContain('Approval points');
  });

  it('says "nothing in the plan cites this", not "missing"', () => {
    // A requirement may legitimately omit its provenance, so the stronger word
    // would be a claim the data does not support.
    render(coverage());
    expect(container.textContent).toContain('nothing in the plan cites this');
    expect(container.textContent).not.toContain('missing');
  });
});

describe('a clean comparison', () => {
  it('says every area is cited', () => {
    render(coverage({
      dimensions: [{
        dimension: 'constraints', label: 'Constraints',
        stated: ['Never auto-submit.'], requirement_ids: ['REQ-001'], unaccounted: false,
      }],
      unaccounted_dimensions: [],
    }));
    expect(container.textContent).toContain('every area is cited');
  });

  it('opens nothing by default when there is nothing to look at', () => {
    render(coverage({
      dimensions: [{
        dimension: 'constraints', label: 'Constraints',
        stated: ['Never auto-submit.'], requirement_ids: ['REQ-001'], unaccounted: false,
      }],
      unaccounted_dimensions: [],
    }));
    expect(Array.from(container.querySelectorAll('details')).filter((d) => (d as HTMLDetailsElement).open)).toHaveLength(0);
  });
});

describe('what the customer said', () => {
  it('is shown verbatim, because the last step is the reviewer\'s eye', () => {
    render(coverage());
    expect(container.textContent).toContain('Never auto-submit a bid.');
    expect(container.textContent).toContain('Runs inside our VPC.');
    expect(container.textContent).toContain('A director signs off over $50k.');
  });

  it('names the requirements an area produced', () => {
    render(coverage());
    expect(container.textContent).toContain('REQ-001');
  });
});

describe('items the intake could not carry', () => {
  it('are shown with their reason, never as a bare count', () => {
    render(coverage({
      dropped: [{ dimension: 'constraints', value: 'A very long constraint.', reason: 'a single answer over 4000 chars; clipped' }],
    }));
    expect(container.textContent).toContain('A very long constraint.');
    expect(container.textContent).toContain('clipped');
  });

  it('are absent when nothing was lost', () => {
    render(coverage());
    expect(container.textContent).not.toContain('could not be carried');
  });
});

describe('requirements the model added on its own', () => {
  it('are separated, and not called wrong', () => {
    render(coverage({ requirements_without_provenance: ['REQ-009'] }));
    expect(container.textContent).toContain('REQ-009');
    expect(container.textContent).toContain('not necessarily wrong');
  });
});

describe('the summary line', () => {
  it('is shown when the server sent one', () => {
    render(coverage(), '3 things said across 2 areas became 2 requirements.');
    expect(container.textContent).toContain('3 things said across 2 areas became 2 requirements.');
  });
});
