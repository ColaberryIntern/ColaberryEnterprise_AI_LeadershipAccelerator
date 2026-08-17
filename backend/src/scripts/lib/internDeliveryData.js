// internDeliveryData.js
//
// Portfolio-grade harvest of intern delivery work across multiple Basecamp
// projects. This is the data layer for the Intern Delivery Command Center
// (backend/src/scripts/buildInternDeliveryDashboard.js).
//
// It is deliberately separate from lib/internActivityTracker.js:
//   - internActivityTracker answers "who has gone dark?" (attendance policing)
//   - this module answers "how is each project actually going?" (delivery)
//
// STRUCTURE DISCOVERED 2026-08-10 (probe against the live API):
//   todoset -> todolist (= a PROJECT, e.g. "TalentSignal Revenue Engine - BUILD")
//           -> group    (= a RELEASE, e.g. "R2 - Reliability & Trust"; itself a
//                          Todolist record, which is why GET /todolists/<parent>/
//                          todos.json returns [] for story-driven lists)
//           -> todo     (= a TASK)
// Story-driven lists put EVERY todo inside a group. Flat lists put them on the
// parent. We handle both: fetch the parent's todos AND every group's todos.
//
// Completion percentage comes from counting real todos (active + completed),
// not from Basecamp's completed_ratio string, because the ratio omits todos in
// nested groups on some list shapes.
//
// No secrets here. Token is resolved by the caller via lib/basecampToken.

const ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;

// ---------------------------------------------------------------------------
// Scope: which Basecamp projects feed this dashboard.
// ---------------------------------------------------------------------------
const PROJECT_SCOPE = [
  { bucketId: 24865175, todosetId: 4327600402, label: 'Internship / Apprenticeship', stream: 'Internship' },
  { bucketId: 47346103, todosetId: 9908475794, label: 'Gov Contracts', stream: 'Gov Contracts' },
];

// People who are never "interns" for the purposes of this report. Ali and Ram
// are the audience; CB System and the "+ai" twin accounts are bots.
const EXCLUDED_BC_IDS = new Set([
  17454835, // Ali Muwwakkil (the audience)
  17346350, // Ram Katamaraja (the audience)
  37708014, // CB System (bot)
  37184021, // Jackie Chalk (staff, work account)
  37179680, // Jackie Chalk (staff, personal account)
  52530300, // Ram AI
  52530301, // Samrawit Mekonen AI
  52530305, // Akiwam AI
  52530307, // Omolola Makinde AI
]);
// The "<Name> AI" twin accounts are all "<handle>+ai@". CB System is "+999@".
const EXCLUDED_EMAIL_PATTERNS = [/\+ai@/i, /\+999@/i];
// Known staff without a reliable ID on file. Kept deliberately short: the Gov
// Contracts crew are @colaberry.com but ARE in scope, so we cannot filter by
// email domain the way lib/internActivityTracker.js does.
const EXCLUDED_NAMES_LOWER = new Set(['milad', 'milad rezvani', 'milad r']);

function isExcludedPerson(person) {
  if (!person) return true;
  if (EXCLUDED_BC_IDS.has(person.id)) return true;
  const email = String(person.email_address || '');
  if (EXCLUDED_EMAIL_PATTERNS.some((re) => re.test(email))) return true;
  const name = String(person.name || '').trim().toLowerCase();
  if (EXCLUDED_NAMES_LOWER.has(name)) return true;
  // Twin bot accounts sometimes arrive with a null email; catch the naming form.
  if (/\sAI$/.test(String(person.name || '')) && !email) return true;
  return false;
}

// ---------------------------------------------------------------------------
// HTTP with bounded retry. Every outbound call has an explicit timeout and a
// capped backoff (CLAUDE.md Failure-First Design). 429s honour Retry-After.
//
// 401 IS RETRYABLE, AND THAT IS DELIBERATE.
// 2026-08-17: the 08:45 CT briefing died on a single 401 from
// /todosets/.../todolists.json. The token was not expired — the byte-identical
// token probed 200 at 08:00, failed at 08:45, and probed 200 again nine minutes
// later. A transient upstream auth failure took out the whole morning report
// because 401 fell through to the non-retryable branch.
//
// Two distinct causes hide behind a 401, so both are handled:
//   1. The token really is stale (CCPP rotated under a long-running process).
//      Re-resolving the token fixes it instantly -> auth.refresh().
//   2. Basecamp transiently rejects a valid token. Nothing to re-resolve;
//      only waiting helps -> a longer backoff than the 429 curve, because auth
//      blips observed here clear in minutes, not milliseconds.
// Refreshes are capped so a genuinely dead token fails fast instead of
// hammering CCPP, and the failure still surfaces as AuthError.
// ---------------------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 4;
const AUTH_MAX_ATTEMPTS = 4;              // 401 retries per request
const MAX_TOKEN_REFRESHES = 2;            // re-resolutions per harvest run
const AUTH_BACKOFF_MS = [5000, 20000, 45000];

/**
 * Mutable token holder shared by every request in one harvest run. When one
 * request refreshes the token, all subsequent requests use the new value —
 * otherwise a mid-harvest rotation would fix one call and 401 the next 200.
 *
 * @param {string} initialToken
 * @param {(() => Promise<string>)|null} refreshFn  re-resolves from CCPP
 */
function createTokenSource(initialToken, refreshFn) {
  let current = initialToken;
  let inFlight = null;   // concurrent 401s share one refresh, not N
  let refreshes = 0;
  return {
    get: () => current,
    refreshCount: () => refreshes,
    canRefresh: () => typeof refreshFn === 'function' && refreshes < MAX_TOKEN_REFRESHES,
    /**
     * Re-resolve the token. Resolves true ONLY if the value actually changed —
     * a resolver that hands back the same string has not fixed anything, and
     * the caller must fall through to the backoff instead of instantly
     * replaying the identical request.
     * @returns {Promise<boolean>} whether the token rotated
     */
    async refresh() {
      if (inFlight) return inFlight;
      refreshes += 1;
      inFlight = (async () => {
        const previous = current;
        let next = null;
        try {
          next = await refreshFn();
        } catch (_e) {
          return false;   // resolver down: treat as "no rotation", never fatal
        }
        if (next && next !== previous) { current = next; return true; }
        return false;
      })();
      try {
        return await inFlight;
      } finally {
        inFlight = null;
      }
    },
  };
}

function authHeaders(token) {
  return {
    Authorization: 'Bearer ' + String(token).replace(/^Bearer\s+/i, ''),
    'User-Agent': 'Colaberry Intern Delivery Dashboard (ali@colaberry.com)',
    Accept: 'application/json',
  };
}

async function bcFetch(url, auth, { attempt = 1, authAttempt = 1, onProgress = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: authHeaders(auth.get()), signal: controller.signal });

    if (res.status === 401) {
      if (authAttempt >= AUTH_MAX_ATTEMPTS) {
        const err = new Error(`GET ${url} -> 401 after ${authAttempt} auth attempts`);
        err.error_class = 'AuthError';
        throw err;
      }
      // Cause 1: try a fresh token first — free and instant when it works.
      let rotated = false;
      if (auth.canRefresh()) {
        rotated = await auth.refresh();
        if (rotated && onProgress) onProgress(`  401 from Basecamp; token re-resolved, retrying (attempt ${authAttempt})`);
      }
      // Cause 2: no rotation available, so the only thing that helps is waiting.
      if (!rotated) {
        const waitMs = AUTH_BACKOFF_MS[Math.min(authAttempt - 1, AUTH_BACKOFF_MS.length - 1)];
        if (onProgress) onProgress(`  401 from Basecamp; waiting ${Math.round(waitMs / 1000)}s (attempt ${authAttempt})`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
      return bcFetch(url, auth, { attempt, authAttempt: authAttempt + 1, onProgress });
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_ATTEMPTS) {
        const err = new Error(`GET ${url} -> ${res.status} after ${attempt} attempts`);
        err.error_class = res.status === 429 ? 'RateLimitError' : 'UpstreamUnavailable';
        throw err;
      }
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, waitMs));
      return bcFetch(url, auth, { attempt: attempt + 1, authAttempt, onProgress });
    }
    return res;
  } catch (e) {
    if (e.name === 'AbortError' && attempt < MAX_ATTEMPTS) {
      return bcFetch(url, auth, { attempt: attempt + 1, authAttempt, onProgress });
    }
    if (e.name === 'AbortError') { e.error_class = 'TimeoutError'; }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Single GET. Returns null on 404/403 rather than throwing: a missing todolist
// must not take down the whole report.
async function bcGet(pathOrUrl, auth, { onProgress = null } = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
  const res = await bcFetch(url, auth, { onProgress });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) {
    const err = new Error(`GET ${url} -> ${res.status}`);
    err.error_class = 'UpstreamUnavailable';
    throw err;
  }
  return res.json();
}

// Paginated GET following Link rel="next".
async function bcGetAll(pathOrUrl, auth, { maxPages = 40, onProgress = null } = {}) {
  let next = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
  const out = [];
  let pages = 0;
  while (next && pages < maxPages) {
    const res = await bcFetch(next, auth, { onProgress });
    if (res.status === 404 || res.status === 403) break;
    if (!res.ok) break;
    const page = await res.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const link = res.headers.get('link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
    pages += 1;
  }
  return out;
}

// Bounded-concurrency map. Basecamp rate-limits at 50 req/10s per IP.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function appUrl(bucketId, kind, id) {
  return `https://app.basecamp.com/${ACCOUNT_ID}/buckets/${bucketId}/${kind}/${id}`;
}

const DAY_MS = 86400000;
function utcMidnight(d) {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}
function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

// A "release group" is the story-build R0..R14 / P0..P3 convention. Milestone
// approval groups are treated separately because they are Ali/Ram gates, not
// intern work, and must not drag an intern's completion percentage down.
function classifyGroup(name) {
  const n = String(name || '');
  if (/milestone\s+approvals?|high-level\s+approvals?|phase\s+gates/i.test(n)) return 'approval_gate';
  if (/^\s*[RP]\d+\b/i.test(n)) return 'release';
  return 'other';
}

function releaseIndex(name) {
  const m = String(name || '').match(/^\s*[RP](\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

// Pull every todo for a list, including todos nested inside its groups.
async function collectListTodos(bucketId, list, auth) {
  const groups = (await bcGet(`/buckets/${bucketId}/todolists/${list.id}/groups.json`, auth)) || [];
  const containers = [
    { id: list.id, name: null, kind: 'root', position: 0 },
    ...(Array.isArray(groups) ? groups : []).map((g) => ({
      id: g.id, name: g.title || g.name, kind: classifyGroup(g.title || g.name), position: g.position || 0,
    })),
  ];

  const perContainer = await mapLimit(containers, 6, async (c) => {
    const active = await bcGetAll(`/buckets/${bucketId}/todolists/${c.id}/todos.json`, auth);
    const done = await bcGetAll(`/buckets/${bucketId}/todolists/${c.id}/todos.json?completed=true`, auth);
    return [...active, ...done].map((t) => ({
      id: t.id,
      title: stripHtml(t.content || t.title || '').slice(0, 220),
      notes: stripHtml(t.description || '').slice(0, 600),
      completed: !!t.completed,
      completedAt: t.completed ? (t.completion && t.completion.created_at) || t.updated_at || null : null,
      createdAt: t.created_at || null,
      updatedAt: t.updated_at || null,
      dueOn: t.due_on || null,
      startsOn: t.starts_on || null,
      commentsCount: t.comments_count || 0,
      assignees: (t.assignees || []).map((a) => ({ id: a.id, name: a.name, email: a.email_address || null })),
      url: t.app_url || appUrl(bucketId, 'todos', t.id),
      groupId: c.id,
      groupName: c.name,
      groupKind: c.kind,
      groupPosition: c.position,
      releaseIndex: releaseIndex(c.name),
    }));
  });

  // De-dup: a todo can surface both on the root fetch and a group fetch.
  const seen = new Set();
  const todos = [];
  for (const t of perContainer.flat()) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    todos.push(t);
  }
  return { todos, groups: containers.filter((c) => c.kind !== 'root') };
}

// Every comment in a bucket inside the lookback window, via the per-recording
// comments endpoint. We only ask for todos that actually have comments, which
// cuts the call count by roughly 70% on these projects.
async function collectComments(bucketId, todos, auth, cutoffMs) {
  const withComments = todos.filter((t) => t.commentsCount > 0);
  const results = await mapLimit(withComments, 8, async (t) => {
    const raw = await bcGetAll(`/buckets/${bucketId}/recordings/${t.id}/comments.json`, auth, { maxPages: 12 });
    return raw
      .filter((c) => new Date(c.created_at).getTime() >= cutoffMs)
      .map((c) => ({
        id: c.id,
        todoId: t.id,
        todoTitle: t.title,
        todoUrl: t.url,
        authorId: c.creator && c.creator.id,
        authorName: (c.creator && c.creator.name) || 'unknown',
        authorEmail: (c.creator && c.creator.email_address) || null,
        createdAt: c.created_at,
        text: stripHtml(c.content).slice(0, 2400),
        url: c.app_url || appUrl(bucketId, 'comments', c.id),
      }));
  });
  return results.flat();
}

/**
 * Harvest the full delivery picture.
 *
 * @param {object}  opts
 * @param {string}  opts.token         Basecamp access token (required)
 * @param {function} [opts.refreshToken] Optional async () => string that re-resolves
 *   the token from CCPP. Supplied, a mid-harvest 401 self-heals instead of
 *   killing the run; omitted, 401s still get a bounded wait-and-retry.
 * @param {number}  opts.lookbackDays  Activity window. Default 14 (Ali's rule).
 * @param {number}  opts.historyDays   Comment history for trend maths. Default 28.
 * @param {function} opts.onProgress   Optional progress callback(msg)
 * @returns {Promise<object>} raw snapshot consumed by internDeliveryMetrics
 */
async function harvestDelivery({ token, refreshToken = null, lookbackDays = 14, historyDays = 28, onProgress = () => {} } = {}) {
  if (!token) throw Object.assign(new Error('Basecamp token required'), { error_class: 'AuthError' });
  const auth = createTokenSource(token, refreshToken);
  const now = Date.now();
  const historyCutoff = now - historyDays * DAY_MS;

  const projects = [];
  const allComments = [];
  const peopleById = new Map();

  // Register a person once, from whichever surface first mentions them.
  function registerPerson(p, stream) {
    if (!p || !p.id || isExcludedPerson(p)) return;
    if (!peopleById.has(p.id)) {
      peopleById.set(p.id, {
        id: p.id,
        name: p.name || p.title || `Basecamp user ${p.id}`,
        email: p.email_address || p.email || null,
        streams: new Set(),
      });
    }
    const entry = peopleById.get(p.id);
    if (!entry.email && (p.email_address || p.email)) entry.email = p.email_address || p.email;
    if (stream) entry.streams.add(stream);
  }

  for (const scope of PROJECT_SCOPE) {
    onProgress(`harvesting ${scope.label} (${scope.bucketId})`);
    // people.json IS PAGINATED. A single-page GET silently truncates the roster
    // at 15 and every assignee past that reads as "unassigned" downstream.
    // (Same landmine that broke @-mention resolution in the CB dispatcher.)
    const people = await bcGetAll(`/projects/${scope.bucketId}/people.json`, auth, { onProgress });
    onProgress(`  ${people.length} people on the project roster`);
    for (const p of people) registerPerson(p, scope.stream);

    const lists = (await bcGet(`/buckets/${scope.bucketId}/todosets/${scope.todosetId}/todolists.json`, auth, { onProgress })) || [];
    const listArray = Array.isArray(lists) ? lists : [];
    onProgress(`  ${listArray.length} todolists`);

    for (const list of listArray) {
      const { todos, groups } = await collectListTodos(scope.bucketId, list, auth);
      if (todos.length === 0) continue;
      const comments = await collectComments(scope.bucketId, todos, auth, historyCutoff);
      allComments.push(...comments);

      // Belt and braces: someone can hold tasks or post updates while being off
      // the project roster (removed, or added via a group). Register them too,
      // otherwise their work silently reads as unassigned.
      for (const t of todos) {
        for (const a of t.assignees) registerPerson({ id: a.id, name: a.name, email_address: a.email }, scope.stream);
      }
      for (const c of comments) {
        registerPerson({ id: c.authorId, name: c.authorName, email_address: c.authorEmail }, scope.stream);
      }
      projects.push({
        projectId: list.id,
        name: stripHtml(list.name || list.title || ''),
        description: stripHtml(list.description || '').slice(0, 800),
        bucketId: scope.bucketId,
        bucketName: scope.label,
        stream: scope.stream,
        url: list.app_url || appUrl(scope.bucketId, 'todolists', list.id),
        createdAt: list.created_at || null,
        updatedAt: list.updated_at || null,
        groups,
        todos,
        comments,
      });
      onProgress(`  + ${stripHtml(list.name)} :: ${todos.length} tasks, ${comments.length} comments`);
    }
  }

  return {
    generatedAt: new Date(now).toISOString(),
    accountId: ACCOUNT_ID,
    lookbackDays,
    historyDays,
    scope: PROJECT_SCOPE,
    people: [...peopleById.values()].map((p) => ({ ...p, streams: [...p.streams] })),
    projects,
    commentCount: allComments.length,
  };
}

module.exports = {
  harvestDelivery,
  // exported for tests
  createTokenSource,
  bcFetch,
  AUTH_MAX_ATTEMPTS,
  MAX_TOKEN_REFRESHES,
  stripHtml,
  classifyGroup,
  releaseIndex,
  isExcludedPerson,
  utcMidnight,
  isoDay,
  DAY_MS,
  PROJECT_SCOPE,
};
