import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes } from 'react-router-dom';
import BlueprintRevisionCompare from '../BlueprintRevisionCompare';
import BlueprintChangeRequest from '../BlueprintChangeRequest';
import lifecycleRoutes, { revisionUnderReview } from '../../../routes/lifecycleRoutes';
import {
  fetchRevisionCompare,
  requestBlueprintChanges,
  type ChangeRequestOutcome,
  type CompareResult,
} from '../../../services/blueprintReviewApi';

jest.mock('../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../utils/api').default as { get: jest.Mock; post: jest.Mock };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockReset();
  api.post.mockReset();
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

const render = (ui: React.ReactElement) => { act(() => { root.render(ui); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

/**
 * Type into a controlled textarea.
 *
 * Assigning `.value` directly is NOT enough: React 18 keeps its own value tracker on the node and
 * dedupes the resulting `input` event, so the component state never moves and the submit button
 * stays disabled. Four tests here failed that way — and two PASSED VACUOUSLY, because the
 * whitespace-only case was asserting that an EMPTY textarea refuses to submit rather than that
 * `trim()` works. The native setter is what makes the event real.
 */
const type = async (text: string) => {
  const ta = q('change-request-text') as HTMLTextAreaElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const col = (collection: string, over: Partial<{ added: string[]; removed: string[]; revised: string[] }> = {}) => ({
  collection, identity: 'pinned' as const,
  added: [], removed: [], revised: [], ...over,
});

const compared = (over: Partial<CompareResult> = {}): CompareResult => ({
  state: 'compared',
  from: { id: 'm-1', revision: 1, status: 'superseded', contentSha256: 'a' },
  to: { id: 'm-2', revision: 2, status: 'approved', contentSha256: 'b' },
  diff: { collections: [col('sources'), col('policies')], changed: false, unreadable: [] },
  ...over,
} as CompareResult);

describe('the four non-comparable answers are each rendered DIFFERENTLY', () => {
  // The same discipline the header applies to blocked-vs-not-assessed. A reviewer shown an
  // all-clear screen for a comparison that never happened would approve it anyway.

  it('NO MANIFEST says there is nothing to compare', () => {
    render(<BlueprintRevisionCompare result={{ state: 'no_manifest' }} />);
    expect(q('compare-no-manifest')).not.toBeNull();
    expect(q('compare-unchanged')).toBeNull();
    expect(q('compare-panel')).toBeNull();
  });

  it('SINGLE REVISION is not an empty diff', () => {
    render(<BlueprintRevisionCompare result={{
      state: 'single_revision',
      only: { id: 'm-1', revision: 1, status: 'approved', contentSha256: 'a' },
    }} />);
    expect(q('compare-single-revision')!.textContent).toContain('only revision');
    expect(q('compare-unchanged')).toBeNull();
  });

  it('REVISION NOT FOUND lists the revisions that DO exist', () => {
    render(<BlueprintRevisionCompare result={{
      state: 'revision_not_found', requested: [1, 9], available: [2, 1],
    }} />);
    expect(q('compare-revision-not-found')).not.toBeNull();
    // The available list is what makes the refusal actionable rather than a flat no.
    expect(q('compare-available')!.textContent).toContain('2, 1');
  });

  it('DISABLED names the flag rather than showing an empty panel', () => {
    render(<BlueprintRevisionCompare result={{
      state: 'disabled',
      detail: { lifecycleDisabled: true, error: 'not enabled', remedy: 'set ENABLE_PROJECT_LIFECYCLE=true' },
    }} />);
    expect(q('compare-disabled')!.textContent).toContain('ENABLE_PROJECT_LIFECYCLE');
    expect(q('compare-panel')).toBeNull();
  });

  it('an ERROR is surfaced, not swallowed into a quiet panel', () => {
    render(<BlueprintRevisionCompare result={{ state: 'error', message: 'boom' }} />);
    expect(q('compare-error')!.textContent).toContain('boom');
  });
});

describe('a compared pair', () => {
  it('names the revision range it actually compared', () => {
    render(<BlueprintRevisionCompare result={compared()} />);
    expect(q('compare-range')!.textContent).toContain('1');
    expect(q('compare-range')!.textContent).toContain('2');
  });

  it('says so explicitly when nothing changed', () => {
    render(<BlueprintRevisionCompare result={compared()} />);
    expect(q('compare-unchanged')).not.toBeNull();
    expect(q('compare-changes')).toBeNull();
  });

  it('shows the IDS of what changed, not just that something did', () => {
    render(<BlueprintRevisionCompare result={compared({
      diff: {
        collections: [
          col('sources', { revised: ['req-1'], added: ['req-9'] }),
          col('policies', { removed: ['pol-3'] }),
        ],
        changed: true,
        unreadable: [],
      },
    })} />);
    expect(q('compare-revised-sources')!.textContent).toContain('req-1');
    expect(q('compare-added-sources')!.textContent).toContain('req-9');
    expect(q('compare-removed-policies')!.textContent).toContain('pol-3');
    expect(q('compare-unchanged')).toBeNull();
  });

  it('omits collections with no change rather than listing twelve quiet rows', () => {
    render(<BlueprintRevisionCompare result={compared({
      diff: { collections: [col('sources', { revised: ['req-1'] }), col('policies')], changed: true, unreadable: [] },
    })} />);
    expect(q('compare-collection-sources')).not.toBeNull();
    expect(q('compare-collection-policies')).toBeNull();
  });

  it('keeps `revised` visually separate from added and removed', () => {
    // The change most likely to be missed: the same requirement, re-pinned. It must not share a
    // row with an addition.
    render(<BlueprintRevisionCompare result={compared({
      diff: { collections: [col('sources', { revised: ['req-1'], added: ['req-2'] })], changed: true, unreadable: [] },
    })} />);
    expect(q('compare-revised-sources')!.textContent).toContain('req-1');
    expect(q('compare-revised-sources')!.textContent).not.toContain('req-2');
    expect(q('compare-added-sources')!.textContent).not.toContain('req-1');
  });

  it('UNREADABLE gets its own warning even when everything else is clean', () => {
    // The case the whole component exists to get right: a clean diff plus collections nobody
    // could read is NOT an all-clear.
    render(<BlueprintRevisionCompare result={compared({
      diff: { collections: [col('sources')], changed: false, unreadable: ['agents.runtime', 'policies'] },
    })} />);
    expect(q('compare-unchanged')).not.toBeNull();
    const warn = q('compare-unreadable')!;
    expect(warn.textContent).toContain('agents.runtime');
    expect(warn.textContent).toContain('policies');
    expect(warn.textContent).toContain('un-reviewed');
  });

  it('shows no unreadable warning when every collection was readable', () => {
    render(<BlueprintRevisionCompare result={compared()} />);
    expect(q('compare-unreadable')).toBeNull();
  });
});

describe('requesting changes', () => {
  const outcome = (o: ChangeRequestOutcome) => jest.fn().mockResolvedValue(o);

  it('refuses to submit blank text, before the server is ever called', async () => {
    const onSubmit = outcome({ state: 'recorded', applied: true, revision: 2 });
    render(<BlueprintChangeRequest revision={2} onSubmit={onSubmit} />);
    const button = q('change-request-submit') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => { button.click(); });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(q('change-request-hint')!.textContent).toContain('Describe the change');
  });

  it('treats whitespace-only text as blank', async () => {
    const onSubmit = outcome({ state: 'recorded', applied: true, revision: 2 });
    render(<BlueprintChangeRequest revision={2} onSubmit={onSubmit} />);
    await type('   \n  ');
    // Genuinely non-blank in the DOM, and still refused — which is the actual claim.
    expect((q('change-request-text') as HTMLTextAreaElement).value.length).toBe(6);
    expect((q('change-request-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  const typeAndSubmit = async (text: string) => {
    await type(text);
    // The button must be live before the click, or a no-op click would read as a pass.
    expect((q('change-request-submit') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { (q('change-request-submit') as HTMLButtonElement).click(); });
  };

  it('submits the TRIMMED text against the revision on the button', async () => {
    const onSubmit = outcome({ state: 'recorded', applied: true, revision: 3 });
    render(<BlueprintChangeRequest revision={3} onSubmit={onSubmit} />);
    expect(q('change-request-revision')!.textContent).toBe('3');
    await typeAndSubmit('  tighten the acceptance criteria  ');
    expect(onSubmit).toHaveBeenCalledWith('tighten the acceptance criteria');
    expect(q('change-request-recorded')!.textContent).toContain('revision 3');
  });

  it('ALREADY ON RECORD reads differently from just-sent', async () => {
    // `applied: false` is a success. Shown as a failure, a reviewer sends it again.
    const onSubmit = outcome({ state: 'recorded', applied: false, revision: 2 });
    render(<BlueprintChangeRequest revision={2} onSubmit={onSubmit} />);
    await typeAndSubmit('same words as last time');
    expect(q('change-request-already')!.textContent).toContain('already on record');
    expect(q('change-request-recorded')).toBeNull();
    expect(q('change-request-error')).toBeNull();
  });

  it('shows a refusal with its machine-readable reason', async () => {
    const onSubmit = outcome({
      state: 'refused', message: 'Requesting blueprint changes requires contract.approve.',
      refusal: 'insufficient_permission',
    });
    render(<BlueprintChangeRequest revision={2} onSubmit={onSubmit} />);
    await typeAndSubmit('please change this');
    expect(q('change-request-refused')!.textContent).toContain('contract.approve');
    expect(q('change-request-refusal')!.textContent).toBe('insufficient_permission');
    expect(q('change-request-recorded')).toBeNull();
  });

  it('surfaces a failure instead of appearing to have sent it', async () => {
    const onSubmit = outcome({ state: 'error', message: 'network down' });
    render(<BlueprintChangeRequest revision={2} onSubmit={onSubmit} />);
    await typeAndSubmit('please change this');
    expect(q('change-request-error')!.textContent).toContain('network down');
    expect(q('change-request-recorded')).toBeNull();
    expect(q('change-request-already')).toBeNull();
  });
});

describe('the client calls /api paths and never throws', () => {
  // Without the `/api` prefix the dev server answers index.html with a 200, which a mocked suite
  // cannot tell from a real response. This repo has shipped that exact bug.

  it('compare calls an /api path and passes the bounds it was given', async () => {
    api.get.mockResolvedValue({ data: compared() });
    const out = await fetchRevisionCompare('p-1', 'delivery', 1, 3);
    const [url, config] = api.get.mock.calls[0];
    expect(url.startsWith('/api/')).toBe(true);
    expect(url).toContain('/revisions/compare');
    expect(config.params).toEqual({ kind: 'delivery', from: 1, to: 3 });
    expect(out.state).toBe('compared');
  });

  it('compare omits absent bounds rather than sending undefined', async () => {
    api.get.mockResolvedValue({ data: compared() });
    await fetchRevisionCompare('p-1', 'student');
    expect(api.get.mock.calls[0][1].params).toEqual({ kind: 'student' });
  });

  it('compare passes the server REFUSAL states through, keeping the available list', async () => {
    // Flattening these into a generic error would lose the one piece of information that makes
    // the refusal actionable.
    api.get.mockImplementation(() => Promise.reject({
      response: { data: { state: 'revision_not_found', requested: [9], available: [2, 1] } },
    }));
    const out = await fetchRevisionCompare('p-1', 'student', 9, 1);
    expect(out.state).toBe('revision_not_found');
    if (out.state !== 'revision_not_found') throw new Error('unreachable');
    expect(out.available).toEqual([2, 1]);
  });

  it('compare reports a disabled feature explicitly', async () => {
    api.get.mockImplementation(() => Promise.reject({
      response: { data: { lifecycleDisabled: true, error: 'off', remedy: 'set the flag' } },
    }));
    expect((await fetchRevisionCompare('p-1', 'student')).state).toBe('disabled');
  });

  it('request-changes POSTs to an /api path with the revision in the body', async () => {
    api.post.mockResolvedValue({ data: { applied: true, revision: 4 } });
    const out = await requestBlueprintChanges('p-1', 'student', 4, 'fix it');
    const [url, body] = api.post.mock.calls[0];
    expect(url.startsWith('/api/')).toBe(true);
    expect(url).toContain('/request-changes');
    expect(body).toEqual({ kind: 'student', revision: 4, text: 'fix it' });
    expect(out).toEqual({ state: 'recorded', applied: true, revision: 4 });
  });

  it('request-changes reports applied:false as a RECORDED outcome, not an error', async () => {
    api.post.mockResolvedValue({ data: { applied: false, revision: 4 } });
    const out = await requestBlueprintChanges('p-1', 'student', 4, 'fix it');
    expect(out).toEqual({ state: 'recorded', applied: false, revision: 4 });
  });

  it('request-changes turns a refusal into its own state', async () => {
    api.post.mockImplementation(() => Promise.reject({
      response: { data: { error: 'nope', refusal: 'insufficient_permission' } },
    }));
    const out = await requestBlueprintChanges('p-1', 'student', 4, 'fix it');
    expect(out).toEqual({ state: 'refused', message: 'nope', refusal: 'insufficient_permission' });
  });
});

describe('the page MOUNTS both panels, so neither is a producer with no consumer', () => {
  // A component can be finished, tested and never rendered anywhere. This repo has shipped that
  // exact shape, which is why the claim under test is "the page shows it", not "the file exists".

  const lifecycleStatus = {
    projectId: 'p-1', kind: 'delivery', stage: 'awaiting_blueprint_approval',
    condition: null, conditionReason: null,
    completedStages: ['discovery'], stages: ['discovery', 'awaiting_blueprint_approval'],
    nextStage: null, blockers: [], nextActorRole: 'architect', nextAction: 'Approve or return it.',
    viewerPersonas: ['owner'], permittedActions: ['request_changes'],
  };

  const mountPage = async (comparePayload: unknown) => {
    api.get.mockImplementation((url: string) => (
      String(url).includes('/revisions/compare')
        ? Promise.resolve({ data: comparePayload })
        : Promise.resolve({ data: lifecycleStatus })
    ));
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/project-lifecycle/p-1?kind=delivery']}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
  };

  it('renders the compare panel and a change-request aimed at the newer revision', async () => {
    await mountPage(compared({
      diff: { collections: [col('sources', { revised: ['req-1'] })], changed: true, unreadable: [] },
    }));
    expect(q('lifecycle-page')).not.toBeNull();
    expect(q('compare-panel')).not.toBeNull();
    expect(q('compare-revised-sources')!.textContent).toContain('req-1');
    // Aimed at `to`, the revision being reviewed — not at the older side of the comparison.
    expect(q('change-request-revision')!.textContent).toBe('2');
  });

  it('offers NO change-request panel when there is no revision to file against', async () => {
    // Offering one anyway would record a request against whatever revision turned up next.
    await mountPage({ state: 'no_manifest' });
    expect(q('compare-no-manifest')).not.toBeNull();
    expect(q('change-request')).toBeNull();
  });

  it('files against the only revision when the blueprint has never been revised', async () => {
    await mountPage({ state: 'single_revision', only: { id: 'm-1', revision: 1, status: 'approved', contentSha256: 'a' } });
    expect(q('change-request-revision')!.textContent).toBe('1');
  });

  it('a submitted request POSTs and then RE-READS the status, so the header is not stale', async () => {
    await mountPage(compared());
    const readsBefore = api.get.mock.calls.length;
    api.post.mockResolvedValue({ data: { applied: true, revision: 2 } });

    await type('tighten the acceptance criteria');
    await act(async () => { (q('change-request-submit') as HTMLButtonElement).click(); });

    expect(api.post.mock.calls[0][1]).toEqual({
      kind: 'delivery', revision: 2, text: 'tighten the acceptance criteria',
    });
    // The condition moved to awaiting_input; leaving the header stale would tell the reviewer
    // their request had no effect.
    expect(api.get.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(q('change-request-recorded')).not.toBeNull();
  });

  it('does NOT re-read when the request was already on record', async () => {
    await mountPage(compared());
    const readsBefore = api.get.mock.calls.length;
    api.post.mockResolvedValue({ data: { applied: false, revision: 2 } });

    await type('same words as last time');
    await act(async () => { (q('change-request-submit') as HTMLButtonElement).click(); });

    expect(q('change-request-already')).not.toBeNull();
    expect(api.get.mock.calls.length).toBe(readsBefore);
  });

  it('survives a compare payload whose state this build does not recognise', async () => {
    // The response is JSON and is cast, so a server on a different build can send a state this
    // page has never heard of. Without the fallback the reviewer gets a blank screen.
    await mountPage({ state: 'something_new_from_a_newer_server' });
    expect(q('compare-unrecognized')).not.toBeNull();
    expect(q('lifecycle-page')).not.toBeNull();
    expect(q('change-request')).toBeNull();
  });
});

describe('revisionUnderReview picks the revision a reviewer is actually looking at', () => {
  it('is the NEWER side of a comparison', () => {
    expect(revisionUnderReview(compared())).toBe(2);
  });

  it('is the only revision when there is just one', () => {
    expect(revisionUnderReview({
      state: 'single_revision', only: { id: 'm', revision: 7, status: null, contentSha256: null },
    })).toBe(7);
  });

  it('is null for every state with no revision to file against', () => {
    const noTarget: CompareResult[] = [
      { state: 'no_manifest' },
      { state: 'revision_not_found', requested: [9], available: [1] },
      { state: 'error', message: 'boom' },
      { state: 'disabled', detail: { lifecycleDisabled: true, error: 'off', remedy: 'flag' } },
    ];
    const wrong = noTarget.filter((r) => revisionUnderReview(r) !== null).map((r) => r.state);
    expect(wrong).toEqual([]);
    expect(revisionUnderReview(null)).toBeNull();
    // Non-vacuity: an empty list would make the filter above pass without checking anything.
    expect(noTarget.length).toBe(4);
  });
});

describe('selecting a changed id reveals that record’s connections', () => {
  // The producer-to-consumer proof for the linked views: the traversal service and its panel are
  // both finished and tested, which says nothing about whether any screen can reach them. The
  // selection starts from the compare list because the ids a reviewer just read are the ids they
  // want to follow — a separate picker would make them retype one they are looking at.

  const lifecycleStatus = {
    projectId: 'p-1', kind: 'delivery', stage: 'awaiting_blueprint_approval',
    condition: null, conditionReason: null,
    completedStages: ['discovery'], stages: ['discovery', 'awaiting_blueprint_approval'],
    nextStage: null, blockers: [], nextActorRole: 'architect', nextAction: 'Approve or return it.',
    viewerPersonas: ['owner'], permittedActions: ['request_changes'],
  };

  const comparePayload = compared({
    diff: {
      collections: [col('sources', { revised: ['REQ-1'] })],
      changed: true,
      unreadable: [],
    },
  });

  const mount = async (linkedPayload: unknown) => {
    api.get.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/linked')) return Promise.resolve({ data: linkedPayload });
      if (u.includes('/revisions/compare')) return Promise.resolve({ data: comparePayload });
      return Promise.resolve({ data: lifecycleStatus });
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/project-lifecycle/p-1?kind=delivery']}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
  };

  const linkedFor = (over: Record<string, unknown> = {}) => ({
    state: 'linked',
    revision: 2,
    entity: { id: 'REQ-1', viewKind: 'requirements', collection: 'sources' },
    groups: [{ target: 'proposal_sections', via: 'track_proposal_section', ids: ['L.3.1'] }],
    unlinked: null,
    ...over,
  });

  it('shows no connections panel until something is selected', async () => {
    await mount(linkedFor());
    expect(q('compare-panel')).not.toBeNull();
    expect(q('linked-panel')).toBeNull();
    // And the id is a control, not plain text, because the page passed a selection handler.
    expect(q('compare-select-REQ-1')).not.toBeNull();
  });

  it('clicking a changed id fetches and renders that record’s connections', async () => {
    await mount(linkedFor());
    await act(async () => { (q('compare-select-REQ-1') as HTMLButtonElement).click(); });

    const linkedCall = api.get.mock.calls.find((c: any[]) => String(c[0]).includes('/linked'))!;
    expect(linkedCall[1].params).toEqual({ kind: 'delivery', entityId: 'REQ-1' });
    expect(q('linked-panel')).not.toBeNull();
    expect(q('linked-entity')!.textContent).toBe('REQ-1');
    expect(q('linked-ids-proposal_sections')!.textContent).toContain('L.3.1');
  });

  it('renders the explicit no-edge state for a record with no connections', async () => {
    // The common case, not the rare one: the manifest carries only three kinds of edge.
    await mount(linkedFor({
      entity: { id: 'REQ-1', viewKind: 'requirements', collection: 'sources' },
      groups: [],
      unlinked: { kind: 'no_edge_recorded', detail: 'This blueprint records no connections for a requirements record.' },
    }));
    await act(async () => { (q('compare-select-REQ-1') as HTMLButtonElement).click(); });
    expect(q('linked-no_edge_recorded')!.textContent).toContain('no connections');
    expect(q('linked-groups')).toBeNull();
  });

  it('surfaces a failed connections read without disturbing the rest of the page', async () => {
    api.get.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/linked')) return Promise.reject({ response: { data: { error: 'traversal blew up' } } });
      if (u.includes('/revisions/compare')) return Promise.resolve({ data: comparePayload });
      return Promise.resolve({ data: lifecycleStatus });
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/project-lifecycle/p-1?kind=delivery']}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
    await act(async () => { (q('compare-select-REQ-1') as HTMLButtonElement).click(); });
    expect(q('linked-error')!.textContent).toContain('traversal blew up');
    // The compare panel and the header are untouched: one failed read is not a failed page.
    expect(q('compare-panel')).not.toBeNull();
    expect(q('lifecycle-page')).not.toBeNull();
  });
});

describe('VISIBLE ACTIONS FOLLOW THE SERVER, not a role check written here', () => {
  // Before `permittedActions` existed the page offered the change-request panel to everyone,
  // including an observer whose submit came back 403. That is the disagreement between visible
  // actions and server permissions that LC-14 forbids, and it was introduced by P5-T3 and found
  // by writing this test. The page now offers the panel only when the server says the caller may.

  const statusWith = (permittedActions: string[]) => ({
    projectId: 'p-1', kind: 'delivery', stage: 'awaiting_blueprint_approval',
    condition: null, conditionReason: null,
    completedStages: ['discovery'], stages: ['discovery', 'awaiting_blueprint_approval'],
    viewerPersonas: permittedActions.length > 0 ? ['owner'] : ['viewer'],
    permittedActions,
    nextStage: null, blockers: [], nextActorRole: 'architect', nextAction: 'Approve or return it.',
  });

  const mount = async (permittedActions: string[]) => {
    api.get.mockImplementation((url: string) => (
      String(url).includes('/revisions/compare')
        ? Promise.resolve({ data: compared() })
        : Promise.resolve({ data: statusWith(permittedActions) })
    ));
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/project-lifecycle/p-1?kind=delivery']}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
  };

  it('OFFERS the change-request panel when the server permits the action', async () => {
    await mount(['request_changes']);
    expect(q('change-request')).not.toBeNull();
  });

  it('WITHHOLDS it when the server does not, rather than showing a button that 403s', async () => {
    await mount([]);
    expect(q('change-request')).toBeNull();
    // The rest of the page is unaffected: a viewer still sees where the project stands.
    expect(q('lifecycle-page')).not.toBeNull();
    expect(q('compare-panel')).not.toBeNull();
  });

  it('FAILS CLOSED when the field is absent entirely, rather than throwing', async () => {
    // The status arrives through an unvalidated cast, so a frontend deployed ahead of its
    // backend - a failure mode this repo has shipped - would hit `undefined.includes` and
    // white-screen the page. A missing field must withhold the action, not break the surface.
    api.get.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/revisions/compare')) return Promise.resolve({ data: compared() });
      const { permittedActions, ...withoutTheField } = statusWith(['request_changes']);
      return Promise.resolve({ data: withoutTheField });
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/project-lifecycle/p-1?kind=delivery']}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
    expect(q('change-request')).toBeNull();
    // The page still renders: the absent field withheld one control, it did not break the view.
    expect(q('lifecycle-page')).not.toBeNull();
    expect(q('compare-panel')).not.toBeNull();
  });

  it('withholds it when the caller holds OTHER actions but not this one', async () => {
    // Not "has any permission" — the specific action is what gates the specific panel.
    await mount(['execute_story', 'advance_design']);
    expect(q('change-request')).toBeNull();
  });
});
