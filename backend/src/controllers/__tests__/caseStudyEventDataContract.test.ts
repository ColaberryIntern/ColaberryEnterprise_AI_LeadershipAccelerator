import * as fs from 'fs';
import * as path from 'path';
import { CASE_STUDY_EVENT_TYPES, FORBIDDEN_EVENT_DATA_KEYS } from '../../constants/caseStudyEventTypes';

/**
 * The `event_data` payload contract, pinned across the package boundary
 * (T019 AC3, AC5).
 *
 * WHY A FILE READ AND NOT AN IMPORT. The emitter lives in the frontend package
 * and the allowlist lives in the backend package; neither can import the other,
 * and the two are compiled by different toolchains. Left unpinned, the failure
 * mode is silent in both directions: rename an event backend-side and the
 * browser's calls start 400ing into a `.catch(() => {})`; drop a key from the
 * frontend's forbidden list and personal data starts landing in a JSONB column
 * that nothing sanitises and nobody prunes.
 *
 * WHY THE FORBIDDEN LIST IS ENFORCED AT THE SOURCE. `utils/piiRedaction.ts` is
 * applied to LOG LINES ONLY - one call in the entire tracking path, redacting a
 * console statement. `recordPageEvent` writes `event_data` to JSONB verbatim.
 * There is no server-side net, and adding one would change the ingest contract
 * that other callers depend on. The browser is the last place the payload can
 * be cleaned, so the browser is where the guard has to be - and this test is
 * what stops the two copies of the rule from drifting apart.
 */

const FRONTEND_EMITTER = path.resolve(
  __dirname, '..', '..', '..', '..', 'frontend', 'src', 'utils', 'caseStudyTracking.ts',
);
const FRONTEND_TRACKER = path.resolve(
  __dirname, '..', '..', '..', '..', 'frontend', 'src', 'utils', 'tracker.ts',
);

function read(file: string): string {
  expect(fs.existsSync(file)).toBe(true);
  return fs.readFileSync(file, 'utf8');
}

/** Pull the string literals out of a named `export const X = [ ... ]` array. */
function literalsInExportedArray(source: string, name: string): string[] {
  const start = source.indexOf(`export const ${name}`);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf('[', start);
  const close = source.indexOf('];', open);
  expect(close).toBeGreaterThan(open);
  return (source.slice(open, close).match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));
}

describe('the browser emitter names the same seven events as the ingest (AC1)', () => {
  it('frontend list matches backend list exactly, in order', () => {
    const emitted = literalsInExportedArray(read(FRONTEND_EMITTER), 'CASE_STUDY_EVENT_TYPES');
    expect(emitted).toEqual([...CASE_STUDY_EVENT_TYPES]);
  });
});

describe('the browser emitter forbids everything the backend contract forbids (AC5)', () => {
  const frontendForbidden = literalsInExportedArray(read(FRONTEND_EMITTER), 'FORBIDDEN_EVENT_DATA_KEYS');

  it('covers every key on the backend list', () => {
    const missing = FORBIDDEN_EVENT_DATA_KEYS.filter((k) => !frontendForbidden.includes(k));
    expect(missing).toEqual([]);
  });

  it('bans personal data', () => {
    for (const key of ['email', 'name', 'phone', 'ip_address', 'company', 'lead_id']) {
      expect(FORBIDDEN_EVENT_DATA_KEYS).toContain(key);
      expect(frontendForbidden).toContain(key);
    }
  });

  it('bans private repository identity', () => {
    // A Case Study can be built from a repo the public is not entitled to know
    // exists. Owner, name, URL and token-shaped fields are out even though none
    // of them is PII in the legal sense.
    for (const key of ['repo_url', 'repo_name', 'repo_owner', 'repo_full_name', 'clone_url', 'github_token']) {
      expect(FORBIDDEN_EVENT_DATA_KEYS).toContain(key);
      expect(frontendForbidden).toContain(key);
    }
  });

  it('routes every emitter through the sanitiser rather than calling trackEvent directly', () => {
    // The guarantee is only worth what the call sites honour. Each emitter goes
    // through `emit`, and `emit` is the single place `trackEvent` is called.
    const source = read(FRONTEND_EMITTER);
    expect(source).toContain('trackEvent(eventType, sanitizeEventData(data))');
    expect(source.match(/trackEvent\(/g) ?? []).toHaveLength(1);
  });
});

describe('the tracker sends event_data where the ingest reads it (AC3, defect D-2)', () => {
  const tracker = read(FRONTEND_TRACKER);

  it('assembles an event_data key at all', () => {
    // The regression this guards: `grep event_data frontend/src` returned zero
    // hits, so `page_events.event_data` was null for every client event ever
    // recorded.
    expect(tracker).toContain('event_data');
  });

  it('keeps the top-level spread, which the ingest also reads', () => {
    // campaign_id, email, lid, timestamp, site_slug and the browser fields are
    // destructured from the body ROOT. Moving everything into event_data would
    // have traded one silent data loss for another.
    expect(tracker).toContain('...props');
  });

  it('emits scroll depth under both keys the two server consumers read', () => {
    // journeyTimelineService reads `depth`; behavioralSignalService reads
    // `depth_percent` for the >= 75 test behind the strength-20
    // deep_scroll_case_study signal.
    expect(tracker).toContain('depth: t, depth_percent: t');
  });
});
