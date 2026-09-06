import * as fs from 'fs';
import * as path from 'path';
import {
  CASE_STUDY_EVENT_TYPES,
  EVENT_TYPE_MAX_LENGTH,
  WAR_ROOM_PAGE_EVENT_TYPES,
  toSqlInList,
} from '../../constants/caseStudyEventTypes';
import { VALID_EVENT_TYPES, validateEventShape, validateTrackEvent } from '../tracking/trackingEventValidation';

/**
 * The ingest allowlist and the column it has to fit in (T019 AC1, AC7).
 *
 * WHY A TEST AND NOT A REVIEW. `page_events.event_type` is `STRING(30)` - a
 * plain varchar with no ENUM and no CHECK constraint. Nothing in the request
 * path measures the name: the allowlist tests membership, `validateEventShape`
 * tests the URL lengths, and neither looks at how long the event type is. A
 * 31-character name therefore passes every guard in the application and fails
 * inside `PageEvent.create`, on the highest-write path in the system, where the
 * error surfaces as a 204 because `handleTrackEvent` catches and swallows it.
 * The bound is invisible right up to the point where it silently eats traffic,
 * so it is asserted over the ARRAY rather than counted by eye per name.
 */

describe('VALID_EVENT_TYPES - the 30-character column bound (AC1)', () => {
  it('every accepted event type fits page_events.event_type STRING(30)', () => {
    const tooLong = VALID_EVENT_TYPES.filter((t) => t.length > EVENT_TYPE_MAX_LENGTH);
    expect(tooLong).toEqual([]);
  });

  it('the bound is the real column width', () => {
    // Guards against someone "fixing" a failure by raising the constant.
    expect(EVENT_TYPE_MAX_LENGTH).toBe(30);
  });

  it('every Case Study event type fits, checked independently of the allowlist', () => {
    for (const type of CASE_STUDY_EVENT_TYPES) {
      expect(type.length).toBeLessThanOrEqual(EVENT_TYPE_MAX_LENGTH);
    }
  });

  it('names are lowercase snake_case, so they are safe as SQL literals and stable as JSON keys', () => {
    for (const type of VALID_EVENT_TYPES) {
      expect(type).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('contains no duplicates', () => {
    expect(new Set(VALID_EVENT_TYPES).size).toBe(VALID_EVENT_TYPES.length);
  });
});

describe('VALID_EVENT_TYPES - the seven Case Study events (AC1)', () => {
  it('registers exactly the seven names the spec defines', () => {
    expect([...CASE_STUDY_EVENT_TYPES]).toEqual([
      'case_study_view',
      'case_study_filter',
      'case_study_card_click',
      'case_study_repo_click',
      'case_study_artifact_click',
      'case_study_cta_click',
      'case_study_share',
    ]);
  });

  it('accepts each one at the ingest', () => {
    for (const type of CASE_STUDY_EVENT_TYPES) {
      expect(
        validateEventShape({ event_type: type, page_url: 'https://x.ai/stories/a', page_path: '/stories/a' }),
      ).toBeNull();
    }
  });

  it('still rejects an unknown type, so the allowlist is doing work', () => {
    expect(
      validateEventShape({ event_type: 'case_study_hover', page_url: 'https://x.ai/stories', page_path: '/stories' }),
    ).toMatch(/^event_type must be one of: /);
  });

  it('leaves the pre-existing types accepted', () => {
    // The Case Study entries are appended, not substituted. A spread that
    // replaced the array would pass every test above and break all tracking.
    for (const type of ['pageview', 'scroll', 'cta_click', 'payment_attempt']) {
      expect(
        validateEventShape({ event_type: type, page_url: 'https://x.ai/', page_path: '/' }),
      ).toBeNull();
    }
  });
});

describe('validateTrackEvent - the /api/t/event contract is unchanged', () => {
  const valid = {
    fingerprint: 'fp-1',
    event_type: 'case_study_view',
    page_url: 'https://x.ai/stories/a',
    page_path: '/stories/a',
  };

  it('accepts a well-formed body', () => {
    expect(validateTrackEvent(valid)).toBeNull();
  });

  it('checks fingerprint before event_type, with the original message', () => {
    // Order matters: callers and the existing frontend assert on these strings.
    expect(validateTrackEvent({ ...valid, fingerprint: '', event_type: 'nope' })).toBe(
      'fingerprint is required (string, max 64 chars)',
    );
  });

  it('rejects an over-long fingerprint', () => {
    expect(validateTrackEvent({ ...valid, fingerprint: 'x'.repeat(65) })).toBe(
      'fingerprint is required (string, max 64 chars)',
    );
  });

  it('rejects an over-long page_url and page_path at the column widths', () => {
    expect(validateTrackEvent({ ...valid, page_url: `https://x.ai/${'a'.repeat(500)}` })).toBe(
      'page_url is required (string, max 500 chars)',
    );
    expect(validateTrackEvent({ ...valid, page_path: `/${'a'.repeat(255)}` })).toBe(
      'page_path is required (string, max 255 chars)',
    );
  });
});

describe('War Room feed allowlist (AC7)', () => {
  it('carries all seven Case Study events', () => {
    // cohortRoutes filters `pe.event_type IN (...)` BEFORE the CASE that builds
    // the label, so a missing entry is not an unlabelled row - it is no row.
    for (const type of CASE_STUDY_EVENT_TYPES) {
      expect(WAR_ROOM_PAGE_EVENT_TYPES).toContain(type);
    }
  });

  it('keeps every event type the feed displayed before this change', () => {
    for (const type of [
      'pageview', 'cta_click', 'form_start', 'form_submit',
      'demo_start', 'demo_complete', 'demo_skip', 'scroll', 'booking_modal_opened',
    ]) {
      expect(WAR_ROOM_PAGE_EVENT_TYPES).toContain(type);
    }
  });

  it('renders as quoted SQL literals', () => {
    const sql = toSqlInList(WAR_ROOM_PAGE_EVENT_TYPES);
    expect(sql).toContain("'case_study_view'");
    expect(sql).toContain("'pageview'");
    expect(sql.split(', ')).toHaveLength(WAR_ROOM_PAGE_EVENT_TYPES.length);
  });

  it('throws rather than interpolating anything that could alter the statement', () => {
    expect(() => toSqlInList(["x' OR '1'='1"])).toThrow(/unsafe event_type literal/);
    expect(() => toSqlInList([])).toThrow(/empty IN/);
  });

  it('is actually wired into the feed query, not merely declared', () => {
    // A constant nobody interpolates is a comment. This reads the source file
    // because the query is a raw `sequelize.query` template literal - there is
    // no exported value to assert on, and running it would need a database.
    //
    // The query moved out of routes/admin/cohortRoutes.ts on 2026-09-06, when the
    // Command Center needed the same feed and a second copy of 4,000 characters
    // of union SQL would have drifted from the first. This test caught that move,
    // which is exactly what it is for - so it follows the query rather than being
    // relaxed.
    const feedSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'services', 'adminOs', 'warRoomFeedService.ts'),
      'utf8',
    );
    expect(feedSource).toContain('pe.event_type IN (${toSqlInList(WAR_ROOM_PAGE_EVENT_TYPES)})');
    // And the hardcoded list it replaced is gone, so the two cannot drift.
    expect(feedSource).not.toContain("'demo_skip', 'scroll', 'booking_modal_opened')");
  });

  it('has exactly one copy of the feed query', () => {
    // The reason the query was extracted. Two copies of the allowlist filter
    // would let one be updated and the other quietly keep serving the old set,
    // and the test above would still pass by reading whichever copy it happened
    // to point at.
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'routes', 'admin', 'cohortRoutes.ts'),
      'utf8',
    );
    expect(routeSource).not.toContain('pe.event_type IN (');
  });
});
