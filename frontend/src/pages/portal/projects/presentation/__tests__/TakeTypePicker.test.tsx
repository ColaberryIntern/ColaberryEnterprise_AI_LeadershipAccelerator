import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import TakeTypePicker from '../TakeTypePicker';
import portalApi from '../../../../../utils/portalApi';

/**
 * SAYING WHAT A TAKE IS.
 *
 * Ali asked Practice to make the learner classify each video so demos can be
 * categorised and the kind travels into the post.
 *
 * The test that carries the most weight is the one about PROVENANCE. A take
 * inherits its task's type so the common case costs nothing — but an inherited
 * value shown as though it were a decision is exactly how a feed ends up with
 * everything labelled "Final showcase". The page has to say which it is.
 */

jest.mock('../../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
let onChanged: jest.Mock;

const REC = '5ff8c1cd-0929-4ab4-8e3f-df32c338a931';
const TYPES = {
  data: {
    types: [
      { id: 'project_introduction', label: 'Project introduction', prominent: true, defaultSeconds: 90 },
      { id: 'working_system_demo', label: 'Working-system demo', prominent: true, defaultSeconds: 420 },
      { id: 'client_handoff', label: 'Client handoff', prominent: false, defaultSeconds: 300 },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  onChanged = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

async function mount(over: Record<string, unknown> = {}) {
  const props = {
    projectId: 'p1',
    storyId: 'PREP-4',
    recordingId: REC,
    presentationType: 'working_system_demo',
    presentationTypeLabel: 'Working-system demo',
    typeSource: 'take' as const,
    onChanged,
    ...over,
  };
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<TakeTypePicker {...(props as any)} />);
  });
}

const text = () => container.textContent || '';
const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const click = async (el: HTMLElement) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('what it says the take is', () => {
  it('shows the label', async () => {
    await mount();
    expect(q('[data-testid="ps-take-type-label"]')!.textContent).toContain('Working-system demo');
  });

  it('SAYS WHEN THE VALUE IS INHERITED rather than chosen', async () => {
    // The whole reason provenance is carried. Without this line a learner has no
    // way to tell a default from a decision, and every demo quietly files itself
    // as whatever the task was set to.
    await mount({ typeSource: 'task' });
    expect(text()).toContain('from your task setting');
  });

  it('does NOT claim inheritance when the learner chose it', async () => {
    await mount({ typeSource: 'take' });
    expect(text()).not.toContain('from your task setting');
  });

  it('asks for one when nothing is set anywhere', async () => {
    await mount({ typeSource: 'unset', presentationType: null, presentationTypeLabel: null });
    expect(text()).toContain('Not set');
    expect(text()).toContain('pick one so people know what this is');
  });
});

describe('choosing', () => {
  it('fetches the options only when opened, not once per take on render', async () => {
    // A page of takes should not make the same request per take to draw a label
    // it already has.
    await mount();
    expect(api.get).not.toHaveBeenCalled();

    await click(q('[data-testid="ps-take-type-change"]')!);
    expect(api.get).toHaveBeenCalledWith('/api/portal/presentation-types');
  });

  it('lists the options the SERVER returned, not a hardcoded set', async () => {
    api.get.mockResolvedValue(TYPES);
    await mount();
    await click(q('[data-testid="ps-take-type-change"]')!);

    expect(q('[data-testid="ps-take-type-option-project_introduction"]')).not.toBeNull();
    expect(q('[data-testid="ps-take-type-option-client_handoff"]')).not.toBeNull();
  });

  it('marks the current one, so a learner can see what they are changing from', async () => {
    api.get.mockResolvedValue(TYPES);
    await mount();
    await click(q('[data-testid="ps-take-type-change"]')!);

    expect(q('[data-testid="ps-take-type-option-working_system_demo"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-testid="ps-take-type-option-project_introduction"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('POSTs the chosen id for THIS recording and re-reads', async () => {
    api.get.mockResolvedValue(TYPES);
    api.post.mockResolvedValue({ data: {} });
    await mount();
    await click(q('[data-testid="ps-take-type-change"]')!);
    await click(q('[data-testid="ps-take-type-option-project_introduction"]')!);

    expect(api.post).toHaveBeenCalledWith(
      `/api/portal/projects/p1/tasks/PREP-4/recordings/${REC}/type`,
      { presentation_type: 'project_introduction' },
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('reports a failure and does NOT claim the change landed', async () => {
    api.get.mockResolvedValue(TYPES);
    api.post.mockRejectedValue({ response: { data: { error: 'Nope.' } } });
    await mount();
    await click(q('[data-testid="ps-take-type-change"]')!);
    await click(q('[data-testid="ps-take-type-option-project_introduction"]')!);

    expect(text()).toContain('Nope.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('survives the options failing to load', async () => {
    api.get.mockRejectedValue(new Error('network'));
    await mount();
    await click(q('[data-testid="ps-take-type-change"]')!);
    expect(text()).toContain('could not load the types');
    // And the label is still there — a broken chooser must not erase the answer.
    expect(text()).toContain('Working-system demo');
  });
});
