/**
 * NOT A TEST — a render harness for the Phase 5 discovery surfaces. Mounts the
 * real components against a realistic preview payload and writes their actual
 * DOM to disk so it can be screenshotted at 1440 and 390.
 *
 * SKIPPED unless HARNESS_OUT is set, because it writes files and a test suite
 * must not have side effects on the working tree. Run it deliberately:
 *
 *   HARNESS_OUT=<dir> CI=true npx react-scripts test \
 *     --testPathPattern="discoveryHarness.dump" --watchAll=false
 *   node scripts/captureDiscoveryHarness.js <dir> <out-dir>
 *
 * Same pattern as campaigns/journey/__tests__/renderHarness.dump.test.tsx: a
 * visual produced from the REAL component and the REAL stylesheets rather
 * than a mockup. It is not a production screenshot; nothing here proves
 * production behaviour. What it proves is that the surfaces lay out at a
 * given width, which no assertion in the unit suites can answer.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { fetchIntakeQuestions, previewIntake } from '../../../../services/sbpApi';

jest.mock('../../../../services/sbpApi', () => ({
  fetchIntakeQuestions: jest.fn(),
  previewIntake: jest.fn(),
  describeFailure: () => ({ title: '', body: '', action: '' }),
}));
jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));

import ProjectWizard from '../ProjectWizard';
import { PipelineBanner, CallBanner } from '../ProjectBanners';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const OUT = process.env.HARNESS_OUT;
const maybe = OUT ? describe : describe.skip;

const IDEA = 'An assistant that reads the overnight support inbox for our 40-person logistics team, drafts a reply for each ticket in our tone, and files anything about a missed delivery into the claims queue with the customer\'s order number attached. It should never send anything itself; Priya reviews the drafts each morning.';

const PREVIEW = {
  ok: true,
  preview: {
    review: {
      items: [
        { index: 0, dimension: 'problem', label: 'What you are building', value: IDEA, group: 'needsConfirmation', quote: IDEA },
        { index: 1, dimension: 'approval_points', label: 'What a person checks before it acts', value: 'Priya reads every draft before anything goes out, and anything over a $500 claim needs her sign-off in writing.', group: 'needsConfirmation', quote: '' },
        { index: 2, dimension: 'systems', label: 'What it has to work with', value: 'the overnight support inbox and the claims queue', group: 'needsConfirmation', quote: '' },
        { index: 3, dimension: 'actors', label: 'Who uses it', value: 'Priya, and the two dispatchers on the early shift', group: 'needsConfirmation', quote: '' },
      ],
      counts: { needsConfirmation: 4, inferences: 0, openQuestions: 0, unknowns: 0, confirmed: 0 },
      contradictions: [],
      blocksPlanning: false,
    },
    unanswered: [
      'there is no baseline, so nothing can be measured against it later',
      'what it does when it is uncertain is undecided',
      'what starts it, and how often, is unknown',
      'no one has said what would make this impressive',
    ],
    covered: [
      { angle: 'THE TOOLS', evidence: 'the overnight support inbox and the claims queue' },
      { angle: 'THE OPERATOR', evidence: 'Priya reviews the drafts each morning' },
    ],
    unmapped: 0,
    callOffer: {
      available: true,
      consentVersion: '2026-09-11',
      consentText: 'I agree to receive one automated phone call from an AI assistant about this project, to the number I entered, and I understand the call will be recorded and transcribed to fill in what my project plan still needs. This is not consent to marketing calls.',
    },
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount(ui: React.ReactElement) {
  await act(async () => { root = createRoot(container); root.render(ui); });
}
async function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
function buttonByText(text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text)) as HTMLButtonElement;
}
async function click(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function write(name: string, _inner: string) {
  fs.mkdirSync(OUT!, { recursive: true });
  // React keeps form state in DOM PROPERTIES, which innerHTML does not carry:
  // a ticked box, a typed number and a chosen option would all serialise as
  // their defaults and the capture would show a screen the student never saw.
  // Mirror each into its attribute first.
  container.querySelectorAll('input').forEach((el) => {
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
    } else {
      el.setAttribute('value', el.value);
    }
  });
  container.querySelectorAll('textarea').forEach((el) => { el.textContent = el.value; });
  container.querySelectorAll('option').forEach((el) => {
    if (el.selected) el.setAttribute('selected', ''); else el.removeAttribute('selected');
  });
  // The page wrapper the real screen has, so projects.css scoping applies.
  fs.writeFileSync(path.join(OUT!, name), `<div class="pj-root">${container.innerHTML}</div>`);
}

maybe('discovery harness', () => {
  it('review step with the call offer, ticked, number entered', async () => {
    (fetchIntakeQuestions as jest.Mock).mockResolvedValue({
      ok: true,
      result: {
        generated: true, model: 'x', attempts: 1,
        covered: PREVIEW.preview.covered,
        questions: [{ id: 'g1', question: 'What would you want a person to check before it acts?', why: '', placeholder: '', angle: 'THE GUARDRAIL' }],
      },
    });
    (previewIntake as jest.Mock).mockResolvedValue(PREVIEW);

    await mount(<ProjectWizard onCreate={() => {}} />);
    await setValue(container.querySelector('textarea')!, IDEA);
    await click(buttonByText('Sharpen my idea'));
    await setValue(container.querySelector('#q-g1') as HTMLTextAreaElement, 'Priya reads every draft before anything goes out, and anything over a $500 claim needs her sign-off in writing.');
    await click(buttonByText('Review & confirm'));
    await click(container.querySelector('[data-testid="call-consent"]') as HTMLElement);
    await setValue(container.querySelector('#call-phone') as HTMLInputElement, '+1 214 555 0143');

    write('01-review-step.html', container.innerHTML);
  });

  it('review step, fallback when the preview cannot be reached', async () => {
    (fetchIntakeQuestions as jest.Mock).mockResolvedValue({
      ok: true,
      result: { generated: true, model: 'x', attempts: 1, questions: [{ id: 'g1', question: 'Who checks it?', why: '', placeholder: '', angle: 'THE GUARDRAIL' }] },
    });
    (previewIntake as jest.Mock).mockResolvedValue({ ok: false, error: { status: 503, kind: 'server_error', message: 'unreachable' } });

    await mount(<ProjectWizard onCreate={() => {}} />);
    await setValue(container.querySelector('textarea')!, IDEA);
    await click(buttonByText('Sharpen my idea'));
    await setValue(container.querySelector('#q-g1') as HTMLTextAreaElement, 'Priya does');
    await click(buttonByText('Review & confirm'));

    write('02-review-fallback.html', container.innerHTML);
  });

  it('delivered: the Story 000 handoff, and the call notice beside it', async () => {
    await mount(
      <>
        <PipelineBanner
          pipeline={{ state: 'delivered', projectId: 'p' }}
          handoff={{ told: 4, inferred: 0, unanswered: 4 }}
          onOpenStory000={() => {}}
        />
        <CallBanner notice={{ tone: 'warn', text: 'We could not place the call. Your build continues without it, and nothing else happens with your number.' }} />
      </>,
    );
    write('03-handoff.html', container.innerHTML);
  });

  it('step 1: the copy that says why detail matters', async () => {
    await mount(<ProjectWizard onCreate={() => {}} />);
    write('04-step1.html', container.innerHTML);
  });
});
