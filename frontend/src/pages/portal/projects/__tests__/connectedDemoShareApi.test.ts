/**
 * The client's status-to-sentence mapping, which is the whole reason this module exists.
 *
 * The panel's tests construct a `ConnectedDemoShareRequestError` directly, so they prove what the
 * panel does with each failure and nothing about which failure a given status produces. A mutation
 * that deleted the 422 branch therefore survived: the panel still displayed a message, just the
 * wrong one. 422 is the branch that matters, because it means the student's own data model was
 * refused and they can fix it, where "something went wrong" sends them to support instead.
 */
// Prefixed `mock`, which is the only out-of-scope name babel-jest lets a hoisted factory close
// over. Without the prefix CRA refuses the whole suite with "not allowed to reference any
// out-of-scope variables", which reads like a mocking problem and is a naming one.
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../../../../utils/api', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}));

import {
  getConnectedDemoShare,
  setConnectedDemoShare,
  ConnectedDemoShareRequestError,
} from '../connectedDemoShareApi';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const httpError = (status: number, body?: unknown) => ({ response: { status, data: body } });

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('the happy path', () => {
  it('reads state by project id', async () => {
    mockGet.mockResolvedValue({ data: { project_id: PROJECT, enabled: false, url: null, has_spec: false, event_count: 0 } });
    const state = await getConnectedDemoShare(PROJECT);
    expect(mockGet).toHaveBeenCalledWith('/api/portal/project/demo/share', { params: { project_id: PROJECT } });
    expect(state.enabled).toBe(false);
  });

  it('puts no data_model on the WIRE when there is none', async () => {
    /*
     * Asserted after serialization, not on the object. The body is sent as JSON and
     * `JSON.stringify` drops an undefined value, so `{data_model: undefined}` and omitting the key
     * are the same request. Asserting the object shape instead would pin a difference nobody can
     * observe, which is how a test comes to look rigorous while proving nothing.
     */
    mockPost.mockResolvedValue({ data: {} });
    await setConnectedDemoShare(PROJECT, false);
    const wire = JSON.parse(JSON.stringify(mockPost.mock.calls[0][1]));
    expect(wire).toEqual({ project_id: PROJECT, enabled: false });
    expect('data_model' in wire).toBe(false);
  });

  it('includes data_model when one is given', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const data_model = { app_name: 'Dispatch console' };
    await setConnectedDemoShare(PROJECT, true, data_model);
    expect(mockPost).toHaveBeenCalledWith('/api/portal/project/demo/share', {
      project_id: PROJECT, enabled: true, data_model,
    });
  });

  it('includes a data_model that is falsy but present, which undefined-checking gets wrong', async () => {
    mockPost.mockResolvedValue({ data: {} });
    await setConnectedDemoShare(PROJECT, true, null);
    expect(mockPost.mock.calls[0][1]).toHaveProperty('data_model', null);
  });
});

describe('each status becomes its own sentence', () => {
  const cases: ReadonlyArray<[number, string, RegExp]> = [
    [400, 'needs_data_model', /command-center\/data-model\.json/],
    [422, 'refused_content', /could not be turned into a demo|./],
    [404, 'not_found', /could not be found/],
    [403, 'forbidden', /not yours to publish/],
    [500, 'unknown', /Something went wrong/],
    [0, 'unknown', /Something went wrong/],
  ];

  it.each(cases)('%i maps to %s', async (status, failure, pattern) => {
    mockPost.mockRejectedValue(httpError(status));
    await expect(setConnectedDemoShare(PROJECT, true)).rejects.toMatchObject({ failure });
    try {
      await setConnectedDemoShare(PROJECT, true);
    } catch (err) {
      expect((err as ConnectedDemoShareRequestError).message).toMatch(pattern);
    }
  });

  it('422 is its OWN failure, not folded into unknown', async () => {
    // The mutation that survived: deleting the 422 branch still produced a message, so asserting
    // "a message appeared" proved nothing. The class is what the panel's wording depends on.
    mockPost.mockRejectedValue(httpError(422, { error: 'spec carries restricted project data' }));
    await expect(setConnectedDemoShare(PROJECT, true)).rejects.toMatchObject({
      failure: 'refused_content',
    });
  });

  it('422 prefers the server\'s own explanation, because it names what to fix', async () => {
    mockPost.mockRejectedValue(httpError(422, { error: 'spec carries restricted project data' }));
    await expect(setConnectedDemoShare(PROJECT, true)).rejects.toThrow('spec carries restricted project data');
  });

  it('422 still says something useful when the server sends no explanation', async () => {
    mockPost.mockRejectedValue(httpError(422, {}));
    await expect(setConnectedDemoShare(PROJECT, true)).rejects.toThrow(/could not be turned into a demo/);
  });

  it('a network error with no response at all is unknown, not a crash', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));
    await expect(setConnectedDemoShare(PROJECT, true)).rejects.toMatchObject({ failure: 'unknown' });
  });

  it('the read side maps the same way, so the two halves cannot disagree', async () => {
    mockGet.mockRejectedValue(httpError(404));
    await expect(getConnectedDemoShare(PROJECT)).rejects.toMatchObject({ failure: 'not_found' });
    mockGet.mockRejectedValue(httpError(403));
    await expect(getConnectedDemoShare(PROJECT)).rejects.toMatchObject({ failure: 'forbidden' });
  });
});
