import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import LinkedRecords from '../LinkedRecords';
import { fetchLinkedRecords, type LinkedResult } from '../../../services/linkedRecordsApi';

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
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

const render = (ui: React.ReactElement) => { act(() => { root.render(ui); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

const linked = (over: Partial<Extract<LinkedResult, { state: 'linked' }>> = {}): LinkedResult => ({
  state: 'linked',
  revision: 2,
  entity: { id: 'REQ-1', viewKind: 'requirements', collection: 'sources' },
  groups: [],
  unlinked: null,
  ...over,
});

describe('connections are shown WITH the edge they came through', () => {
  it('lists each group’s ids and names the mapping that produced it', () => {
    render(<LinkedRecords entityId="REQ-1" result={linked({
      groups: [
        { target: 'proposal_sections', via: 'track_proposal_section', ids: ['L.3.1', 'M.2'] },
        { target: 'downstream_stories', via: 'track_solution_story', ids: ['STORY-7'] },
      ],
    })} />);

    expect(q('linked-ids-proposal_sections')!.textContent).toContain('L.3.1');
    expect(q('linked-ids-proposal_sections')!.textContent).toContain('M.2');
    expect(q('linked-ids-downstream_stories')!.textContent).toContain('STORY-7');
    // The route the connection came through: a reviewer must be able to tell a traversed edge
    // from an inference.
    expect(q('linked-via-proposal_sections')!.textContent).toContain('proposal section mapping');
    expect(q('linked-view-kind')!.textContent).toBe('requirements');
  });

  it('shows no empty-state message when there ARE connections', () => {
    render(<LinkedRecords entityId="REQ-1" result={linked({
      groups: [{ target: 'delivery_role', via: 'assignment_role', ids: ['DELIVERY_OWNER'] }],
    })} />);
    expect(q('linked-groups')).not.toBeNull();
    expect(q('linked-no_edge_recorded')).toBeNull();
    expect(q('linked-entity_not_in_manifest')).toBeNull();
  });
});

describe('the THREE kinds of nothing are three different messages', () => {
  it('an id absent from the blueprint says so, and names the id', () => {
    render(<LinkedRecords entityId="nope-1" result={linked({
      entity: null,
      unlinked: { kind: 'entity_not_in_manifest', detail: 'No record with id nope-1 appears in any collection.' },
    })} />);
    expect(q('linked-entity_not_in_manifest')!.textContent).toContain('nope-1');
    expect(q('linked-no_edge_recorded')).toBeNull();
    // No view-kind badge, because there is no record to classify.
    expect(q('linked-view-kind')).toBeNull();
  });

  it('a present record with no edges carries the SERVER’S explanation', () => {
    // Not a generic phrase written in the component: the server knows which edges exist.
    render(<LinkedRecords entityId="PROC-1" result={linked({
      entity: { id: 'PROC-1', viewKind: 'workflow', collection: 'processes' },
      unlinked: {
        kind: 'no_edge_recorded',
        detail: 'This blueprint records no connections for a workflow record. '
          + 'The only edges it carries today are requirement-to-proposal-section, '
          + 'requirement-to-story, and assignment-to-role.',
      },
    })} />);
    const box = q('linked-no_edge_recorded')!;
    expect(box.textContent).toContain('requirement-to-proposal-section');
    expect(q('linked-view-kind')!.textContent).toBe('workflow');
    expect(q('linked-entity_not_in_manifest')).toBeNull();
  });

  it('a project with no blueprint is its own state, not an unconnected record', () => {
    render(<LinkedRecords entityId="REQ-1" result={{ state: 'no_manifest' }} />);
    expect(q('linked-no-manifest')).not.toBeNull();
    expect(q('linked-panel')).toBeNull();
  });

  it('makes a MISSING explanation visible rather than inventing one', () => {
    // If the server ever returns no groups and no reason, that is a defect, and the panel says
    // "unknown" instead of quietly implying the record stands alone.
    render(<LinkedRecords entityId="X-1" result={linked({ groups: [], unlinked: null })} />);
    expect(q('linked-unexplained')!.textContent).toContain('did not say why');
  });
});

describe('failure and disabled states are surfaced, never blank', () => {
  it('names the flag when the feature is off', () => {
    render(<LinkedRecords entityId="REQ-1" result={{
      state: 'disabled',
      detail: { lifecycleDisabled: true, error: 'off', remedy: 'set ENABLE_PROJECT_LIFECYCLE=true' },
    }} />);
    expect(q('linked-disabled')!.textContent).toContain('ENABLE_PROJECT_LIFECYCLE');
  });

  it('surfaces an error instead of a quiet panel', () => {
    render(<LinkedRecords entityId="REQ-1" result={{ state: 'error', message: 'boom' }} />);
    expect(q('linked-error')!.textContent).toContain('boom');
  });

  it('survives a state this build does not recognise', () => {
    render(<LinkedRecords entityId="REQ-1" result={{ state: 'from_a_newer_server' } as unknown as LinkedResult} />);
    expect(q('linked-unrecognized')).not.toBeNull();
  });

  it('survives a linked result whose groups are not an array', () => {
    render(<LinkedRecords entityId="REQ-1" result={{ state: 'linked', groups: 'nope' } as unknown as LinkedResult} />);
    expect(q('linked-unrecognized')).not.toBeNull();
  });
});

describe('the client calls an /api path and never throws', () => {
  it('sends entityId as a QUERY parameter, not a path segment', async () => {
    // Assignment ids are composite (`ROLE:responsibility`), so one containing a slash would
    // split a path segment in two and 404.
    api.get.mockResolvedValue({ data: linked() });
    const out = await fetchLinkedRecords('p-1', 'delivery', 'DELIVERY_OWNER:Approve / sign');
    const [url, config] = api.get.mock.calls[0];
    expect(url.startsWith('/api/')).toBe(true);
    expect(url).toContain('/linked');
    expect(url).not.toContain('Approve');
    expect(config.params).toEqual({ kind: 'delivery', entityId: 'DELIVERY_OWNER:Approve / sign' });
    expect(out.state).toBe('linked');
  });

  it('passes the no_manifest refusal through rather than flattening it to an error', async () => {
    api.get.mockImplementation(() => Promise.reject({ response: { data: { state: 'no_manifest' } } }));
    expect((await fetchLinkedRecords('p-1', 'student', 'x')).state).toBe('no_manifest');
  });

  it('reports a disabled feature explicitly', async () => {
    api.get.mockImplementation(() => Promise.reject({
      response: { data: { lifecycleDisabled: true, error: 'off', remedy: 'flag' } },
    }));
    expect((await fetchLinkedRecords('p-1', 'student', 'x')).state).toBe('disabled');
  });

  it('turns an unknown failure into an error state, not a throw', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('network down')));
    const out = await fetchLinkedRecords('p-1', 'student', 'x');
    expect(out.state).toBe('error');
    if (out.state !== 'error') throw new Error('unreachable');
    expect(out.message).toContain('Could not read');
  });
});
