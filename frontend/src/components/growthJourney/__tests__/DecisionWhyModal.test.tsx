import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DecisionWhyModal from '../DecisionWhyModal';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';

/**
 * The why modal (Phase 6, T614).
 *
 * ── THIS SUITE'S JOB IS THE PLAN'S M2 MUTATION ──────────────────────────────
 *
 * T614's second named mutation is "the why modal shows a field the API did not
 * return". The modal is built to make that structurally impossible: it walks the
 * payload it received instead of declaring an interface over it, so there is no
 * field name in the component that the API could fail to send. The cells below pin
 * that from both directions - an absent key reports as absent, and a key the API
 * DID send appears - because a renderer that showed nothing would also pass a
 * one-sided test.
 *
 * ── AND IT MASKS KEYS, NOT JUST VALUES ─────────────────────────────────────
 *
 * T613's leak was a packet KEY rendered raw under a caption promising otherwise.
 * `why` payload keys come from JSONB an operator may have written, so the key goes
 * through the mask too, and a cell asserts it with the address in the key position.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyInspectApi', () => ({
  getDecisionWhy: jest.fn(),
  getClassificationWhy: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyInspectApi') as {
  getDecisionWhy: jest.Mock;
  getClassificationWhy: jest.Mock;
};

let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();

const render = async (kind: 'decision' | 'classification' = 'decision') => {
  await act(async () => {
    root.render(
      <DecisionWhyModal kind={kind} id="d-1" subjectRef="lead:4711" onClose={onClose} />,
    );
  });
};
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.getDecisionWhy.mockResolvedValue({
    answer: { reason: 'next step in the path', action: 'SEND_EDUCATION' },
    scores: { dimensions: [{ key: 'intent', value: 0.8, factors: ['asked twice'] }] },
  });
  api.getClassificationWhy.mockResolvedValue({ answer: { intent: 'wants a date' } });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  onClose.mockClear();
});

describe('it renders what arrived, and nothing it was not sent', () => {
  it('walks a nested payload and shows the real keys and values', async () => {
    await render();
    expect(text()).toContain('answer');
    expect(text()).toContain('next step in the path');
    expect(text()).toContain('intent');
    expect(text()).toContain('asked twice');
  });

  it('shows a DIFFERENT payload faithfully - the renderer has no field list of its own', async () => {
    api.getDecisionWhy.mockResolvedValue({ totally_new_key: 'and its value' });
    await render();
    expect(text()).toContain('totally_new_key');
    expect(text()).toContain('and its value');
    // and nothing from the previous shape leaks in
    expect(text()).not.toContain('SEND_EDUCATION');
  });

  it('reports a null as NOT RETURNED rather than as a blank or a zero', async () => {
    // Scoped to the table body, and this cell is why the scoping matters: the first
    // version asserted `text()).toContain('not returned')` over the whole modal,
    // where the CAPTION says "reads as not returned rather than as a blank". The
    // needle was always present, so the assertion could not fail - and the plan's
    // own M2 mutant (null rendering as `0`) SURVIVED all 194 cells because of it.
    // Third time today that a whole-page substring assertion caught the right thing
    // for the wrong reason; the mutation run is what exposed it.
    api.getDecisionWhy.mockResolvedValue({ reason: null });
    await render();
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('not returned');
    expect(body).not.toContain('0');
  });

  it('distinguishes an empty string, an empty list and an empty object', async () => {
    // Three different facts. A UI that renders all three as blank throws away the
    // difference between "the engine said nothing" and "there was nothing to say".
    api.getDecisionWhy.mockResolvedValue({ a: '', b: [], c: {} });
    await render();
    expect(text()).toContain('empty string');
    expect(text()).toContain('empty list');
    expect(text()).toContain('empty object');
  });

  it('renders a false boolean as false, not as absent', async () => {
    // Scoped to the table body. A whole-modal `not.toContain('not returned')` can
    // never pass: the caption above the table explains that very convention, so the
    // phrase is always on screen. The assertion has to look where the value is.
    api.getDecisionWhy.mockResolvedValue({ executed: false });
    await render();
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('false');
    expect(body).not.toContain('not returned');
  });
});

describe('masking covers keys as well as values', () => {
  it('masks an address in a VALUE', async () => {
    api.getDecisionWhy.mockResolvedValue({ contact_evidence: 'wrote from lead@example.com' });
    await render();
    expect(text()).not.toContain('lead@example.com');
    expect(text()).toContain('[redacted]');
  });

  it('masks an address in a KEY - the T613 leak', async () => {
    api.getDecisionWhy.mockResolvedValue({ 'lead@example.com': 'said yes' });
    await render();
    expect(text()).not.toContain('lead@example.com');
  });

  it('positive control: a clean key and value both render verbatim', async () => {
    api.getDecisionWhy.mockResolvedValue({ reason_code: 'path_step' });
    await render();
    expect(text()).toContain('reason_code');
    expect(text()).toContain('path_step');
  });

  it('says in the caption what the mask does not catch', async () => {
    await render();
    expect(text()).toContain('does not catch');
    expect(text()).toContain('@handle');
  });
});

describe('it reads the right endpoint for the kind it was given', () => {
  it('a decision asks the decision route', async () => {
    await render('decision');
    expect(api.getDecisionWhy).toHaveBeenCalledWith('d-1');
    expect(api.getClassificationWhy).not.toHaveBeenCalled();
  });

  it('a classification asks the classification route', async () => {
    await render('classification');
    expect(api.getClassificationWhy).toHaveBeenCalledWith('d-1');
    expect(api.getDecisionWhy).not.toHaveBeenCalled();
  });

  it('a failed read says so inside the modal rather than closing it', async () => {
    api.getDecisionWhy.mockRejectedValue(new Error('why exploded'));
    await render();
    expect(text()).toContain('why exploded');
  });
});

describe('it behaves like a dialog', () => {
  it('is marked as a modal dialog with an accessible name', async () => {
    await render();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toContain('lead:4711');
  });

  it('closes on the footer button', async () => {
    await render();
    const close = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.textContent ?? '').trim() === 'Close');
    await act(async () => { close?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClose).toHaveBeenCalled();
  });

  it('passes the mechanical a11y rules', async () => {
    await render();
    expectNoA11yViolations(container);
  });
});
