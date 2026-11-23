import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ScopeState, { resolveScopeState } from '../ScopeState';
import type { ResponseError } from '../../useGrowthJourneyData';
import type { AsyncState } from '../../../explorerGrowth/AsyncPanel';
import type { ScopedResponse } from '../../../../services/growthJourneyExplorerApi';

/**
 * The four honest states, and the one that was a brand leak by design.
 *
 * THE CELL THIS FILE EXISTS FOR is "a 403 renders zero rows and none of the
 * all-brands numbers". The first draft of this component answered a 403 with
 * "Showing all brands" - which in production, where `tenant_memberships` is
 * empty, would have put Colaberry Training's 1,191 learners under the Colaberry
 * Enterprise label on day one. Every other cell here would have passed against
 * that version, which is why the leak is asserted as a NUMBER ABSENT FROM THE
 * DOM rather than as a kind string from the resolver.
 *
 * Rendered with `react-dom/client` and `act`, the idiom every component suite in
 * this repo uses. There is no `@testing-library/react` here and adding one for a
 * single file is a dependency decision, not a test decision.
 */

type Payload = { total: number; label: string };

/** Colaberry Training's real population, so a leak is recognisable on sight. */
const CT_COUNT = 1191;

const scopeOf = (over: Partial<ScopedResponse<Payload>['scope']> = {}) => ({
  tenant_id: 't-cola',
  brand_id: null,
  program_id: null,
  in_scope: true,
  reason: 'all_brands' as const,
  ...over,
});

const ready = (
  over: Partial<ScopedResponse<Payload>['scope']> = {}
): AsyncState<ScopedResponse<Payload>> => ({
  loading: false,
  error: null,
  data: { data: { total: CT_COUNT, label: 'Colaberry Training' }, scope: scopeOf(over) },
});

const failing = (
  status: number | null,
  message = 'Journey read failed'
): AsyncState<ScopedResponse<Payload>> => {
  const err: ResponseError = Object.assign(new Error(message), { status });
  return { loading: false, error: err, data: null };
};

const forbidden = () => failing(403, 'Brand not in scope');

const outOfScope = (): AsyncState<ScopedResponse<Payload>> => ({
  loading: false,
  error: null,
  data: {
    data: null,
    scope: scopeOf({ brand_id: 'b-ent', in_scope: false, reason: 'other_brand' }),
  },
});

const loadingState: AsyncState<ScopedResponse<Payload>> = {
  loading: true,
  error: null,
  data: null,
};

/** Renders the payload's number, so a leak shows up as a number on screen. */
const rows = (data: Payload) => (
  <table>
    <tbody>
      <tr data-testid="row">
        <td>{data.total}</td>
      </tr>
    </tbody>
  </table>
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function show(
  state: AsyncState<ScopedResponse<Payload>>,
  props: { brandSelected: boolean; brandName?: string | null } = { brandSelected: true }
): void {
  act(() => {
    root.render(
      <ScopeState state={state} brandSelected={props.brandSelected} brandName={props.brandName}>
        {rows}
      </ScopeState>
    );
  });
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');
const rowCount = () => container.querySelectorAll('[data-testid="row"]').length;

describe('THE RULE: a 403 never falls back to data', () => {
  it('renders ZERO rows and none of the all-brands numbers', () => {
    show(forbidden(), { brandSelected: true, brandName: 'Colaberry Enterprise' });

    expect(rowCount()).toBe(0);
    // The specific leak: Colaberry Training's count under another brand's label.
    expect(text()).not.toContain(String(CT_COUNT));
    expect(text()).not.toContain('Showing all brands');
    expect(text()).toContain('tenant memberships are not set up yet');
  });

  it('says so as a CONFIGURATION state, not a failure', () => {
    show(forbidden());

    // Not red. Nothing is broken and nobody needs to be paged.
    expect(container.querySelector('.alert-danger')).toBeNull();
    expect(container.querySelector('.alert-secondary')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('tells the reader what to do instead, rather than only what is missing', () => {
    show(forbidden());
    expect(text()).toContain('Clear the brand selection');
  });

  it('is decided by the STATUS, so a reworded server message cannot change it', () => {
    const reworded = forbidden();
    reworded.error!.message = 'something else entirely';
    expect(resolveScopeState(reworded, true).kind).toBe('unavailable');

    // ...and the right words with the wrong status are NOT the configuration state.
    expect(resolveScopeState(failing(500, 'Brand not in scope'), true).kind).toBe('failed');
  });

  it('a 403 with NO brand selected is a real failure, not configuration', () => {
    // There is nothing about an unscoped read for a membership table to fix, so
    // dressing it up as a configuration step would hide an authorization bug.
    expect(resolveScopeState(forbidden(), false).kind).toBe('failed');
  });

  it('a network failure is state 4, because "we could not ask" is not "not configured"', () => {
    expect(resolveScopeState(failing(null, 'Network Error'), true).kind).toBe('failed');
  });
});

describe('the other three states render distinctly', () => {
  it('state 1: no brand selected, labelled all-brands, rows DO render', () => {
    show(ready({ reason: 'all_brands' }), { brandSelected: false });

    expect(rowCount()).toBe(1);
    expect(text()).toContain(String(CT_COUNT));
    expect(text()).toContain('All brands.');
  });

  it('state 3: 200 with data null names the brand and renders zero rows', () => {
    show(outOfScope(), { brandSelected: true, brandName: 'AI Flotation' });

    expect(rowCount()).toBe(0);
    expect(text()).not.toContain(String(CT_COUNT));
    expect(text()).toContain('Explorer Growth covers Colaberry Training.');
    expect(text()).toContain('AI Flotation has no explorer population yet.');
  });

  it('state 3 falls back to a neutral label rather than printing "undefined"', () => {
    show(outOfScope(), { brandSelected: true });
    expect(text()).toContain('This brand has no explorer population yet.');
    expect(text()).not.toContain('undefined');
  });

  it('state 4: red, named as a failure, carrying the reason and the status', () => {
    show(failing(500, 'Journey read failed'));

    expect(container.querySelector('.alert-danger')).not.toBeNull();
    expect(text()).toContain('it is unknown');
    expect(text()).toContain('Journey read failed');
    expect(text()).toContain('HTTP 500');
    expect(rowCount()).toBe(0);
  });

  it("a brand that IS Explorer's renders rows with no all-brands banner", () => {
    show(ready({ brand_id: 'b-ct', reason: 'explorer_brand' }));

    expect(rowCount()).toBe(1);
    expect(text()).not.toContain('All brands.');
  });

  it('loading is its own state, not an empty result', () => {
    show(loadingState);
    expect(text()).toContain('Loading');
    expect(rowCount()).toBe(0);
  });
});

describe('mayRenderRows is the single expression the rule lives in', () => {
  const cases: Array<[string, AsyncState<ScopedResponse<Payload>>, boolean, boolean]> = [
    ['unavailable', forbidden(), true, false],
    ['out_of_scope', outOfScope(), true, false],
    ['failed', failing(500), true, false],
    ['loading', loadingState, true, false],
    ['ready', ready({ reason: 'explorer_brand' }), true, true],
    ['unscoped', ready({ reason: 'all_brands' }), false, true],
  ];

  it.each(cases)('%s -> mayRenderRows=%s', (_kind, state, brandSelected, expected) => {
    // Asserted on the RESOLVER rather than through the DOM, because the
    // guarantee is "exactly two states may render rows" and that must not be a
    // property of how four JSX branches happen to be ordered.
    expect(resolveScopeState(state, brandSelected).mayRenderRows).toBe(expected);
  });

  it('exactly two of the six states may render rows', () => {
    const allowed = cases.filter(([, state, brandSelected]) =>
      resolveScopeState(state, brandSelected).mayRenderRows
    );
    expect(allowed.map(([kind]) => kind).sort()).toEqual(['ready', 'unscoped']);
  });

  it('an envelope with neither data nor error is a bug, not an empty result', () => {
    const impossible: AsyncState<ScopedResponse<Payload>> = {
      loading: false,
      error: null,
      data: null,
    };
    expect(resolveScopeState(impossible, false).kind).toBe('failed');
  });
});
