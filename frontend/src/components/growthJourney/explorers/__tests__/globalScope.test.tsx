import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import GlobalScopeNotice from '../GlobalScopeNotice';
import BrainPanel from '../BrainPanel';
import SettingsPanel from '../SettingsPanel';

/**
 * The two tabs that do NOT follow the brand selector, and the notice that is the
 * only thing stopping that from being a lie.
 *
 * ─── THE CELL THIS FILE EXISTS FOR ──────────────────────────────────────────
 *
 * Brain and Settings sit on a brand-scoped page and ignore the brand. On the
 * Brain tab, saving the rules changes what Maya says to EVERY brand, because they
 * persist through one `setSetting(BRAIN_RULES_SETTING, ...)` key. So an operator
 * who selects Colaberry Enterprise, edits her voice and saves has just rewritten
 * Colaberry Training's outreach.
 *
 * Nothing in the code prevents that - it is a property of the storage. The notice
 * is the entire defense, which makes it load-bearing rather than decorative, and
 * a mutation that deletes it must fail a test rather than pass quietly. Before
 * this file existed, removing the notice broke nothing: 383 tests passed either
 * way.
 *
 * ─── WHY THE CHILD TABS ARE STUBBED ────────────────────────────────────────
 *
 * `BrainTab` and `SettingsTab` self-fetch. Stubbing them keeps each cell about
 * the thing this file is responsible for - the notice, and that the real tab is
 * still rendered beneath it - rather than about Explorer's own loading states,
 * which Explorer's own 200 tests already cover.
 */

jest.mock('../../../explorerGrowth/BrainTab', () => ({
  __esModule: true,
  default: () => <div data-testid="brain-tab-rendered" />,
}));

jest.mock('../../../explorerGrowth/SettingsTab', () => ({
  __esModule: true,
  Body: () => <div data-testid="settings-body-rendered" />,
}));

jest.mock('../../../../services/growthJourneyExplorerApi', () => ({
  getExplorerSummary: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../services/growthJourneyExplorerApi');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  // Set per test, not once at mock time. `clearAllMocks` in `afterEach` removes
  // the implementation as well as the calls, so a value declared in the factory
  // survives exactly one test and every later one gets `undefined` back - which
  // surfaces far from the cause, as `Cannot read properties of undefined
  // (reading 'then')` inside the hook.
  api.getExplorerSummary.mockResolvedValue({
    data: { modes: ['shadow'] },
    scope: {
      tenant_id: 't1', brand_id: null, program_id: null, in_scope: true, reason: 'all_brands',
    },
  });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

const render = async (node: React.ReactNode) => {
  await act(async () => { root.render(node); });
};

const text = () => container.textContent ?? '';

/** Colaberry Training's real population, so a leak is recognisable on sight. */
const CT_NAME = 'Colaberry Training';

describe('GlobalScopeNotice', () => {
  it('names the selected brand and says this tab does not follow it', async () => {
    await render(
      <GlobalScopeNotice what="Maya's brain" brandName="Colaberry Enterprise">
        specifics here
      </GlobalScopeNotice>
    );

    // Naming the brand is the point. "This is not brand-scoped" is abstract;
    // "the selector reads Colaberry Enterprise and this is not Colaberry
    // Enterprise's" is the sentence that actually stops someone mid-edit.
    expect(text()).toContain('Colaberry Enterprise');
    expect(text()).toContain('does not follow it');
    expect(text()).toContain('is not scoped to this brand');
  });

  it('with no brand chosen, claims no brand at all', async () => {
    await render(
      <GlobalScopeNotice what="Maya's brain" brandName={null}>
        specifics here
      </GlobalScopeNotice>
    );

    expect(text()).toContain('is shared by every brand');
    // The mismatch sentence is for when there IS a mismatch. Rendering it with no
    // brand selected would be a warning about nothing, and a notice that cries
    // wolf is one people stop reading.
    expect(text()).not.toContain('does not follow it');
    expect(text()).not.toContain(CT_NAME);
  });

  it('is marked as a note for assistive technology, not styled text', async () => {
    await render(
      <GlobalScopeNotice what="x" brandName={null}>y</GlobalScopeNotice>
    );
    expect(container.querySelector('[role="note"]')).not.toBeNull();
  });
});

describe('BrainPanel', () => {
  it('shows the notice ABOVE the brain, every time', async () => {
    await render(<BrainPanel brandId="b-enterprise" brandName="Colaberry Enterprise" />);

    const notice = container.querySelector('[data-testid="gj-global-scope-notice"]');
    const brain = container.querySelector('[data-testid="brain-tab-rendered"]');
    expect(notice).not.toBeNull();
    expect(brain).not.toBeNull();

    // Order matters: a warning underneath the editor is read after the mistake.
    // `compareDocumentPosition` returns FOLLOWING (4) when `brain` comes after.
    expect(notice!.compareDocumentPosition(brain!) & Node.DOCUMENT_POSITION_FOLLOWING).
      toBeTruthy();
  });

  it('with a brand chosen, says the rules are THAT brand and no other changes', async () => {
    await render(<BrainPanel brandId="b-enterprise" brandName="Colaberry Enterprise" />);

    // THE load-bearing assertion for the brand case. Until the rules were
    // keyed by brand this panel had to warn that saving rewrote everyone's; now
    // it must say the opposite, and saying the old thing would be worse than
    // saying nothing because an operator would avoid a safe edit.
    // Asserted around the apostrophes rather than through them: the copy uses
    // `&rsquo;`, which renders as U+2019 and does not match a typed `'`. A test
    // that pins the character pins the typography, not the meaning.
    expect(text()).toContain('rules below are this brand');
    expect(text()).toContain('Saving writes only this brand');
    expect(text()).toContain('no other brand changes');
    // The old warning must be GONE for the brand case.
    expect(text()).not.toContain('changes what Maya says on all of them');
  });

  it('with NO brand chosen, warns that saving changes every brand', async () => {
    await render(<BrainPanel brandId={null} brandName={null} />);

    // The shared set is still shared. The warning did not disappear when the
    // rules became per-brand, it moved to the case where it is true.
    expect(text()).toContain('These are the shared rules');
    expect(text()).toContain('changes what Maya says on all of them');
  });

  it('attributes the already-given list to Colaberry Training, not the selected brand', async () => {
    await render(<BrainPanel brandId="b-enterprise" brandName="Colaberry Enterprise" />);

    // The inventory and the given list are Explorer's population. Under an
    // Enterprise selector they are still Training's people, and saying so is the
    // difference between this tab and the "Showing all brands" bug that nearly
    // shipped on ScopeState.
    expect(text()).toContain(CT_NAME);
  });

  it('still carries the notice when NO brand is chosen', async () => {
    await render(<BrainPanel brandId={null} brandName={null} />);

    // The rules are global whether or not a brand is selected, so the notice is
    // unconditional. A version that only warned when a brand was chosen would
    // leave the all-brands view implying these rules are the only ones.
    expect(container.querySelector('[data-testid="gj-global-scope-notice"]')).not.toBeNull();
    expect(text()).toContain('is shared by every brand');
  });
});

describe('SettingsPanel', () => {
  it('shows the notice and names which half is global', async () => {
    await render(<SettingsPanel brandId="b-enterprise" brandName="Colaberry Enterprise" />);

    expect(container.querySelector('[data-testid="gj-global-scope-notice"]')).not.toBeNull();
    // Mixed scope on one screen is the thing a reader gets wrong, so both halves
    // are named rather than left to be inferred.
    expect(text()).toContain('one set for everything');
  });

  it('states that nothing here can change what sends', async () => {
    await render(<SettingsPanel brandId={null} brandName={null} />);

    // `SettingsTab`'s own header records that the mode switch is deliberately
    // absent, because its upper values are what would let the system email real
    // learners. That guarantee is worth asserting where an operator reads it.
    expect(text()).toContain('mode switch is deliberately absent');
  });

  it('renders the real settings body beneath the notice', async () => {
    await render(<SettingsPanel brandId={null} brandName={null} />);
    expect(container.querySelector('[data-testid="settings-body-rendered"]')).not.toBeNull();
  });
});
