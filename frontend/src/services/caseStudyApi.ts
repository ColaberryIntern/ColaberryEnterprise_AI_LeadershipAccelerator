import type {
  CaseStudyBuiltByType,
  CaseStudySortKey,
  CaseStudyVerificationMethod,
  PublicCaseStudyDetailResponse,
  PublicCaseStudyListResponse,
  PublicCaseStudyTaxonomyResponse,
  PublicVerificationClass,
} from './caseStudyPublicTypes';

/**
 * caseStudyApi - the read client for `/api/public/case-studies*`.
 *
 * WHY NOT `utils/api`. That axios instance attaches `localStorage.admin_token`
 * to every request and, on a 401, clears it and can navigate the window to
 * `/admin/login`. Right for the admin desk, wrong here twice: a public page must
 * not put a bearer token on an anonymous GET, and a visitor must never be pushed
 * into an admin login by a page they were only reading.
 *
 * FAILURE-FIRST (the four questions).
 *   1. ON FAILURE: every failure throws `CaseStudyRequestError` with a stable
 *      `errorClass`, or `CaseStudyNotFoundError` for a miss. Nothing returns an
 *      empty list on error, so a page can never say "nothing is published here"
 *      when the truth was "the request failed" - the collapse
 *      `caseStudyAdminApi.ts` records from the admin leads page.
 *   2. RETRY: none, deliberately. The server states the same policy: a public
 *      GET is cheap for the reader to repeat, and retrying here turns an outage
 *      into a stampede across every open tab.
 *   3. RECOVERY: the caller renders a failure state with a retry control.
 *   4. HANDLED: timeout, caller cancellation, offline/DNS, a 400 with named
 *      parameters, 404, 429, 5xx, and a 200 whose body is not the promised
 *      shape. NOT handled: anything reaching the caller as another error type.
 *
 * SURFACE. Not a parameter. The server resolves it from the request and returns
 * the resolved profile on every response, so no client can ask for a surface it
 * was not served - and no string in this file names one.
 */

/* ------------------------------------------------------------- endpoints --- */

/** Every call is bounded: an unbounded `fetch` leaves a loading state forever. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

const BASE = '/api/public';
const INDEX_PATH = `${BASE}/case-studies`;
const TAXONOMY_PATH = `${BASE}/case-study-taxonomy`;
const COLLECTION_PATH = `${BASE}/case-study-collections`;

const apiOrigin = (): string => process.env.REACT_APP_API_URL || '';

/* ---------------------------------------------------------------- errors --- */

/**
 * A stable class, never a raw message. The server returns a byte-identical 404
 * for "no such slug" and "published, but not on this surface"; this type
 * preserves that indistinguishability on the client, so no caller can turn the
 * difference into something a visitor could probe.
 */
export class CaseStudyNotFoundError extends Error {
  readonly errorClass = 'NotFound';

  constructor(readonly path: string) {
    super('Not found');
    this.name = 'CaseStudyNotFoundError';
  }
}

export type CaseStudyErrorClass =
  | 'ValidationError'
  | 'RateLimitError'
  | 'UpstreamUnavailable'
  | 'TimeoutError'
  | 'NetworkError'
  | 'ContractViolation'
  | 'UnknownError';

export class CaseStudyRequestError extends Error {
  constructor(
    readonly errorClass: CaseStudyErrorClass,
    message: string,
    /** Named by a 400 so a caller can point at the control that produced it. */
    readonly invalidParameters: readonly string[] = [],
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'CaseStudyRequestError';
  }
}

const GENERIC_FAILURE = 'We could not load these project records. Please try again.';

/** `Record<ErrorClass, …>`: a new failure class cannot ship without its words. */
const FAILURE_COPY: Record<CaseStudyErrorClass, string> = {
  ValidationError: 'Those filters could not be read.',
  RateLimitError: 'Too many requests just now. Please try again in a moment.',
  TimeoutError: 'That took too long to load. Please try again.',
  NetworkError: 'We could not reach the server. Check your connection and try again.',
  UpstreamUnavailable: GENERIC_FAILURE,
  ContractViolation: GENERIC_FAILURE,
  UnknownError: GENERIC_FAILURE,
};

/** House wording, so "it failed" and "there is nothing here" never read alike. */
export function describeCaseStudyError(err: unknown): string {
  if (err instanceof CaseStudyNotFoundError) return 'That project record is not available.';
  if (!(err instanceof CaseStudyRequestError)) return GENERIC_FAILURE;
  if (err.errorClass === 'ValidationError' && err.invalidParameters.length > 0) {
    return `Those filters could not be read (${err.invalidParameters.join(', ')}).`;
  }
  return FAILURE_COPY[err.errorClass];
}

/* ------------------------------------------------------- filter state ------ */

/**
 * The URL-addressable state of the index (spec section 22). Every field is a
 * query parameter and nothing else is, so reload, back and forward restore the
 * page: the URL is the only place this state lives.
 *
 * `repo_visibility` is absent on purpose. The server accepts it and drops it for
 * public audiences, because answering "show me the ones backed by private
 * repositories" leaks the fact itself. A client that cannot express the
 * parameter cannot send it by accident.
 */
export interface CaseStudyFilterState {
  readonly capability: readonly string[];
  readonly industry: readonly string[];
  readonly stack: readonly string[];
  readonly program: readonly string[];
  readonly deliverable: readonly string[];
  readonly builtBy: readonly CaseStudyBuiltByType[];
  readonly verification: readonly PublicVerificationClass[];
  readonly verificationMethod: readonly CaseStudyVerificationMethod[];
  readonly status: readonly string[];
  readonly featured: boolean | null;
  readonly sort: CaseStudySortKey | null;
  readonly page: number | null;
  readonly limit: number | null;
}

export const EMPTY_CASE_STUDY_FILTERS: CaseStudyFilterState = Object.freeze({
  capability: [],
  industry: [],
  stack: [],
  program: [],
  deliverable: [],
  builtBy: [],
  verification: [],
  verificationMethod: [],
  status: [],
  featured: null,
  sort: null,
  page: null,
  limit: null,
});

/** `Record<keyof …>` so a new state field stops the build until its parameter
 *  name is decided, and cannot become a filter the URL does not carry. */
const PARAM_OF: Record<keyof CaseStudyFilterState, string> = {
  capability: 'capability',
  industry: 'industry',
  stack: 'stack',
  program: 'program',
  deliverable: 'deliverable',
  builtBy: 'built_by',
  verification: 'verification',
  verificationMethod: 'verification_method',
  status: 'status',
  featured: 'featured',
  sort: 'sort',
  page: 'page',
  limit: 'limit',
};

const LIST_FIELDS = [
  'capability', 'industry', 'stack', 'program', 'deliverable',
  'builtBy', 'verification', 'verificationMethod', 'status',
] as const;

type ListField = (typeof LIST_FIELDS)[number];

/** Comma-joined, matching the spec's example (`?capability=agents&stack=Claude,MCP`).
 *  The server reads comma lists and repeated keys alike, so either URL works. */
export function serializeCaseStudyFilters(state: CaseStudyFilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of LIST_FIELDS) {
    const values = (state[field] as readonly string[]).filter((v) => v.length > 0);
    if (values.length > 0) params.set(PARAM_OF[field], values.join(','));
  }
  if (state.featured !== null) params.set(PARAM_OF.featured, state.featured ? 'true' : 'false');
  if (state.sort) params.set(PARAM_OF.sort, state.sort);
  if (state.page !== null && state.page > 1) params.set(PARAM_OF.page, String(state.page));
  if (state.limit !== null) params.set(PARAM_OF.limit, String(state.limit));
  return params;
}

const readList = (params: URLSearchParams, key: string): string[] => {
  const out: string[] = [];
  for (const raw of params.getAll(key)) {
    for (const part of raw.split(',')) {
      const value = part.trim();
      if (value.length > 0 && !out.includes(value)) out.push(value);
    }
  }
  return out;
};

const readPositiveInt = (params: URLSearchParams, key: string): number | null => {
  const raw = params.get(key);
  const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Reads state back out of a URL. Unknown values are kept verbatim, not dropped:
 * the SERVER decides whether a facet exists, and a client that discarded an
 * unrecognised value would widen the query to the whole surface while the URL
 * still claimed to be filtered.
 */
export function parseCaseStudyFilters(search: string | URLSearchParams): CaseStudyFilterState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const lists = {} as Record<ListField, string[]>;
  for (const field of LIST_FIELDS) lists[field] = readList(params, PARAM_OF[field]);
  const featured = params.get(PARAM_OF.featured);
  const sort = params.get(PARAM_OF.sort);
  return {
    capability: lists.capability,
    industry: lists.industry,
    stack: lists.stack,
    program: lists.program,
    deliverable: lists.deliverable,
    builtBy: lists.builtBy as CaseStudyBuiltByType[],
    verification: lists.verification as PublicVerificationClass[],
    verificationMethod: lists.verificationMethod as CaseStudyVerificationMethod[],
    status: lists.status,
    featured: featured === 'true' ? true : featured === 'false' ? false : null,
    sort: sort ? (sort as CaseStudySortKey) : null,
    page: readPositiveInt(params, PARAM_OF.page),
    limit: readPositiveInt(params, PARAM_OF.limit),
  };
}

/** True when nothing is narrowing the list - which is what tells an empty
 *  result "nothing is published" apart from "your filters excluded it". */
export function hasActiveCaseStudyFilters(state: CaseStudyFilterState): boolean {
  return LIST_FIELDS.some((field) => (state[field] as readonly string[]).length > 0)
    || state.featured !== null;
}

/** Add or remove one facet value, returning a new state. Page resets to 1,
 *  because keeping page 7 while the result set changes shows an empty page. */
export function toggleCaseStudyFacet(
  state: CaseStudyFilterState, field: ListField, value: string,
): CaseStudyFilterState {
  const current = state[field] as readonly string[];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...state, [field]: next, page: null } as CaseStudyFilterState;
}

/* ------------------------------------------------------------- requests --- */

export interface CaseStudyRequestOptions {
  /** Caller cancellation, e.g. a component unmounting mid-flight. */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

async function readInvalidParameters(response: Response): Promise<string[]> {
  try {
    const body: unknown = await response.json();
    const raw = isRecord(body) ? body.invalidParameters : undefined;
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

const failureFor = (status: number): CaseStudyErrorClass => {
  if (status === 400) return 'ValidationError';
  if (status === 429) return 'RateLimitError';
  return status >= 500 ? 'UpstreamUnavailable' : 'UnknownError';
};

/** One GET. Every timeout, abort and status decision lives here, so no endpoint
 *  below can ship without a bound. */
async function getJson<T>(
  path: string, params: URLSearchParams | null, options: CaseStudyRequestOptions,
): Promise<T> {
  const query = params && Array.from(params.keys()).length > 0 ? `?${params.toString()}` : '';
  const url = `${apiOrigin()}${path}${query}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onCallerAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onCallerAbort);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET', signal: controller.signal, credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (timedOut) {
      throw new CaseStudyRequestError('TimeoutError', `Request timed out after ${timeoutMs}ms`);
    }
    // A caller-cancelled request is not a failure to report; rethrow verbatim so
    // an unmount does not surface an error state on a page that has gone away.
    if (options.signal?.aborted) throw err;
    throw new CaseStudyRequestError('NetworkError', 'Network request failed');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }

  if (response.status === 404) throw new CaseStudyNotFoundError(path);
  if (!response.ok) {
    const errorClass = failureFor(response.status);
    const invalid = errorClass === 'ValidationError' ? await readInvalidParameters(response) : [];
    throw new CaseStudyRequestError(
      errorClass, `Request failed with status ${response.status}`, invalid, response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CaseStudyRequestError('ContractViolation', 'Response was not JSON');
  }
  return body as T;
}

/**
 * A 200 is no promise of the promised shape: a proxy error page, a truncated
 * payload and a stale deploy all arrive as 200. Each endpoint asserts the fields
 * it is about to render, so a bad body is a `ContractViolation` here rather than
 * a `TypeError` thrown from inside a component three frames later.
 */
function assertShape(body: unknown, required: readonly string[], what: string): void {
  if (!isRecord(body) || required.some((key) => body[key] === undefined)) {
    throw new CaseStudyRequestError('ContractViolation', `Unexpected ${what} response shape`);
  }
}

export async function fetchCaseStudyIndex(
  filters: CaseStudyFilterState = EMPTY_CASE_STUDY_FILTERS,
  options: CaseStudyRequestOptions = {},
): Promise<PublicCaseStudyListResponse> {
  const body = await getJson<PublicCaseStudyListResponse>(
    INDEX_PATH, serializeCaseStudyFilters(filters), options,
  );
  assertShape(body, ['surface', 'items', 'ledger', 'total'], 'index');
  return body;
}

/**
 * A saved collection is the same pipeline with a curated filter set applied
 * server-side, so a curated path can never show something the index would hide.
 * A missing collection is a 404, never a silently ignored filter.
 */
export async function fetchCaseStudyCollection(
  collectionSlug: string,
  filters: CaseStudyFilterState = EMPTY_CASE_STUDY_FILTERS,
  options: CaseStudyRequestOptions = {},
): Promise<PublicCaseStudyListResponse> {
  const body = await getJson<PublicCaseStudyListResponse>(
    `${COLLECTION_PATH}/${encodeURIComponent(collectionSlug)}`,
    serializeCaseStudyFilters(filters),
    options,
  );
  assertShape(body, ['surface', 'items', 'ledger', 'total'], 'collection');
  return body;
}

export async function fetchCaseStudyDetail(
  slug: string, options: CaseStudyRequestOptions = {},
): Promise<PublicCaseStudyDetailResponse> {
  const body = await getJson<PublicCaseStudyDetailResponse>(
    `${INDEX_PATH}/${encodeURIComponent(slug)}`, null, options,
  );
  assertShape(body, ['surface', 'caseStudy'], 'detail');
  return body;
}

export async function fetchCaseStudyTaxonomy(
  options: CaseStudyRequestOptions = {},
): Promise<PublicCaseStudyTaxonomyResponse> {
  const body = await getJson<PublicCaseStudyTaxonomyResponse>(TAXONOMY_PATH, null, options);
  assertShape(body, ['surface', 'facets'], 'taxonomy');
  return body;
}

/** TYPES ONLY, so a page can import the wire shapes beside the calls while the
 *  types module stays free of any runtime import cycle with the surface config. */
export type * from './caseStudyPublicTypes';
