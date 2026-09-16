import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CaseStudyVisualStoryPanel from '../CaseStudyVisualStoryPanel';
import { formFromSection, sectionFromForm } from '../caseStudyVisualStoryPanelModel';
import type { CaseStudyVisualStoryDraft, CaseStudyVisualStoryState } from '../../../../services/caseStudyAdminTypes';

/**
 * The Visual Story panel.
 *
 * WHAT IS ASSERTED. It loads the form from the snapshot; an edited label saves
 * through the override path with path `visualStory` and a section the server
 * schema accepts (no blank optionals); a refused save prints the server's
 * errors and marks the row; Reset restores the stored form; Generate fills
 * the form from the endpoint and keeps the person's on/off decision.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HASH = 'c'.repeat(64);
const AT = '2026-09-16T13:00:00.000Z';

const stored = () => ({
  schemaVersion: 1, presentationVersion: 'v2', enabled: true, surfaces: ['enterprise'], motion: 'auto',
  workflow: {
    key: 'flow', type: 'single_state', title: 'How it works', description: 'A flow.',
    panels: [{ key: 'single', label: 'As built', nodes: [{ key: 'a', label: 'Launch', role: 'system' }, { key: 'b', label: 'Detect', role: 'system', status: 'resolved', lane: 'recovery' }], edges: [{ from: 'a', to: 'b' }] }],
  },
  outcomeCards: [{ metricKey: 'resolved', emphasis: true }],
  charts: [{ key: 'share-resolved', kind: 'share', title: 'Resolved', metricKey: 'resolved' }],
  provenance: { generator: 'evidence', generatedAt: AT, sourceContentHash: HASH, state: 'approved', humanEdited: false },
});

const state = (over: Partial<CaseStudyVisualStoryState> = {}): CaseStudyVisualStoryState => ({
  snapshotId: 'snap-1', version: 3, current: stored(), stale: false, validation: { ok: true, errors: [] },
  limits: { outcomeCards: 3, charts: 6, chartParts: 8 }, ...over,
});

let container: HTMLDivElement;
let root: Root;
const onReadState = jest.fn();
const onGenerate = jest.fn();
const onSave = jest.fn();

async function flush(): Promise<void> {
  await act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });
}

async function render(visualStory: React.ComponentProps<typeof CaseStudyVisualStoryPanel>['visualStory']): Promise<void> {
  act(() => {
    root.render(
      <CaseStudyVisualStoryPanel
        visualStory={visualStory}
        metricKeys={['resolved', 'automatic']}
        busy={false}
        onReadState={onReadState}
        onGenerate={onGenerate}
        onSave={onSave}
        now={() => new Date(AT)}
      />,
    );
  });
  await flush();
}

const byId = (id: string): HTMLElement => container.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const all = (id: string): HTMLElement[] => Array.from(container.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const click = async (el: Element | null): Promise<void> => {
  act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
};
const type = (input: Element | null, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    (input as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onReadState.mockReset().mockResolvedValue(state());
  onGenerate.mockReset();
  onSave.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
});

const view = () => ({ enabled: true, surfaces: ['enterprise'], state: 'approved', raw: stored() as Record<string, unknown> });

describe('CaseStudyVisualStoryPanel', () => {
  it('loads the form from the snapshot and reads the stored state', async () => {
    await render(view());
    expect(onReadState).toHaveBeenCalledTimes(1);
    expect(byId('cs-vs-badge-enabled').textContent).toBe('Shown on enterprise');
    expect((byId('cs-vs-title') as HTMLInputElement).value).toBe('How it works');
    expect(all('cs-vs-node')).toHaveLength(2);
    expect(all('cs-vs-edge')).toHaveLength(1);
    expect(all('cs-vs-card')).toHaveLength(1);
    expect(all('cs-vs-chart')).toHaveLength(1);
    expect((byId('cs-vs-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits a label and saves via the override with path visualStory and a strict-schema section', async () => {
    await render(view());
    const label = all('cs-vs-node-label')[1] as HTMLInputElement;
    type(label, 'Gap detected');
    expect((byId('cs-vs-save') as HTMLButtonElement).disabled).toBe(false);
    await click(byId('cs-vs-preview'));
    expect(byId('cs-vs-diff').textContent).toContain('Step or connection wording changed');
    await click(byId('cs-vs-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [path, value, note] = onSave.mock.calls[0];
    expect(path).toBe('visualStory');
    expect(note).toBe('Visual story saved and shown');
    const section = value as ReturnType<typeof sectionFromForm>;
    const wf = section.workflow as { panels: { nodes: Record<string, unknown>[] }[] };
    expect(wf.panels[0].nodes[1]).toEqual({ key: 'b', label: 'Gap detected', role: 'system', status: 'resolved', lane: 'recovery' });
    // Blank optionals are absent, not empty strings; the node keeps only what was set.
    expect(wf.panels[0].nodes[0]).toEqual({ key: 'a', label: 'Launch', role: 'system' });
    expect(section.provenance).toEqual({ generator: 'human', generatedAt: AT, sourceContentHash: HASH, state: 'approved', humanEdited: true });
    expect(section.enabled).toBe(true);
    expect(section.surfaces).toEqual(['enterprise']);
  });

  it('prints the server errors from a refused save and marks the row they name', async () => {
    onSave.mockRejectedValue({ response: { status: 400, data: { error_class: 'ValidationError', errors: [
      { path: 'workflow.panels.0.nodes.1.label', code: 'shape', message: 'Too long' },
    ] } } });
    await render(view());
    type(all('cs-vs-node-label')[1], 'x'.repeat(50));
    await click(byId('cs-vs-save'));
    expect(byId('cs-vs-errors').textContent).toContain('workflow.panels.0.nodes.1.label');
    expect(byId('cs-vs-errors').textContent).toContain('Too long');
    const marked = all('cs-vs-row-error');
    expect(marked).toHaveLength(1);
    expect(marked[0].closest('[data-testid="cs-vs-node"]')).toBe(all('cs-vs-node')[1]);
  });

  it('Reset restores the stored form and disables Save', async () => {
    await render(view());
    type(byId('cs-vs-title'), 'Changed');
    expect((byId('cs-vs-save') as HTMLButtonElement).disabled).toBe(false);
    await click(byId('cs-vs-reset'));
    expect((byId('cs-vs-title') as HTMLInputElement).value).toBe('How it works');
    expect((byId('cs-vs-save') as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Generate fills the form from the endpoint, keeps the on/off decision, and lists the reasons', async () => {
    const draft = { ...stored(), enabled: false, surfaces: [], workflow: { ...stored().workflow, title: 'Drawn from evidence' }, provenance: { ...stored().provenance, sourceContentHash: 'd'.repeat(64) } };
    const out: CaseStudyVisualStoryDraft = { ...state(), draft, reasons: ['no ratio metric to chart'], draftValidation: { ok: true, errors: [] } };
    onGenerate.mockResolvedValue(out);
    await render(view());
    await click(byId('cs-vs-generate'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect((byId('cs-vs-title') as HTMLInputElement).value).toBe('Drawn from evidence');
    expect((byId('cs-vs-enabled') as HTMLInputElement).checked).toBe(true);
    expect(byId('cs-vs-reasons').textContent).toContain('no ratio metric to chart');
    await click(byId('cs-vs-save'));
    const section = onSave.mock.calls[0][1] as { provenance: { sourceContentHash: string } };
    expect(section.provenance.sourceContentHash).toBe('d'.repeat(64));
  });

  it('on a record with no story, Save waits for a draft and the status says so', async () => {
    onReadState.mockResolvedValue(state({ current: null }));
    await render(null);
    expect(byId('cs-vs-status').textContent).toContain('No visual story yet.');
    expect(byId('cs-vs-generate').textContent).toBe('Generate from evidence');
    expect(container.textContent).toContain('Generate a draft first');
    expect((byId('cs-vs-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the stale badge when the server says the sources moved', async () => {
    onReadState.mockResolvedValue(state({ stale: true }));
    await render(view());
    expect(byId('cs-vs-badge-stale')).not.toBeNull();
  });
});

describe('the form model round-trips', () => {
  it('section -> form -> section is identity for a stored section, apart from the human stamp', () => {
    const form = formFromSection(stored() as Record<string, unknown>);
    const back = sectionFromForm(form, { now: AT });
    const expected = { ...stored(), provenance: { ...stored().provenance, generator: 'human', generatedAt: AT, humanEdited: true } };
    expect(back).toEqual(expected);
  });
});
