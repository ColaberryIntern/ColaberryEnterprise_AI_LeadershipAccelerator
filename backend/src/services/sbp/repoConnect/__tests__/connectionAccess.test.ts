/**
 * connectionAccess — "unknown" is not "yes".
 *
 * ── WHAT THIS SUITE IS FOR ───────────────────────────────────────────────────
 *
 * `isWritableConnection` used to read an unrecorded permission as writable. The
 * reasoning was back-compat: `platform_can_push` was captured at exactly one
 * moment (`startConnect`), every row predating that capture is missing it, and
 * demoting live builds on a guess would break working repos to fix a reporting
 * problem.
 *
 * The 2026-08-19 audit settled it against that reading. Eleven of twelve student
 * repositories turned out to be READ-ONLY to the platform — 200, public, not
 * archived, simply not a collaborator with push — and every one of them had been
 * answering "writable" off an absent key. The permissive default was not
 * protecting working repos. It was queueing commits GitHub was always going to
 * refuse, against repos that could never accept them, and reporting nothing at
 * all when they failed. "We have never checked" had been reading as "yes, go
 * ahead" for nine months.
 *
 * So the default is inverted here, and the refusal is NAMED so a skipped write
 * stops being indistinguishable from a student who never connected a repo.
 *
 * PURE suite — no models, no network, no mocks. That is the point of the module.
 */
import {
  isWritableConnection,
  writeAccessOf,
  writeAccessPatch,
  writeBlockReason,
  storedConnect,
} from '../connectionAccess';

/** A row as the database hands it back. `connect` lives inside `status_json`. */
const row = (connect: Record<string, unknown> | undefined, top: Record<string, unknown> = {}) => ({
  repo_owner: 'a-student',
  repo_name: 'nightshift',
  status_json: { ...top, ...(connect ? { connect } : {}) },
});

const connected = (over: Record<string, unknown> = {}) =>
  row({ state: 'connected', method: 'byo', ...over });

describe('writeAccessOf — reporting is unchanged', () => {
  it('reads a recorded permission in both directions', () => {
    expect(writeAccessOf(connected({ platform_can_push: true }))).toBe('push');
    expect(writeAccessOf(connected({ platform_can_push: false }))).toBe('pull_only');
  });

  /**
   * Deliberately still `null`, not `pull_only`. The VIEW must keep saying "we do
   * not know", because the panel renders the read-only explanation off
   * `write_access === 'pull_only'` and telling a student their repo is read-only
   * when nobody ever asked GitHub would be a lie with a to-do list attached.
   *
   * Not-knowing stops meaning yes in `writeBlockReason`, not here.
   */
  it('still answers null for a permission nobody ever recorded', () => {
    expect(writeAccessOf(connected())).toBeNull();
    expect(writeAccessOf(row(undefined))).toBeNull();
  });

  it('ignores a non-boolean, however it got there', () => {
    expect(writeAccessOf(connected({ platform_can_push: 'true' }))).toBeNull();
    expect(writeAccessOf(connected({ platform_can_push: null }))).toBeNull();
  });
});

describe('writeBlockReason — the refusal, with its cause attached', () => {
  it('names an unrecorded permission as ignorance, not as a refusal by the student', () => {
    // The distinction the logs never had. `access_unknown` is OUR bookkeeping
    // failing; `pull_only` is the student's deliberate choice. They need
    // different responses and used to produce identical silence.
    expect(writeBlockReason(connected())).toBe('access_unknown');
  });

  it('names a repo GitHub refuses', () => {
    expect(writeBlockReason(connected({ platform_can_push: false }))).toBe('pull_only');
  });

  it('names an unbound project', () => {
    expect(writeBlockReason(null)).toBe('no_repo');
    expect(writeBlockReason({ status_json: {} })).toBe('no_repo');
    expect(writeBlockReason({ repo_owner: 'a-student', repo_name: null, status_json: {} })).toBe('no_repo');
  });

  it('names a provisioned repo the student has not pushed to yet', () => {
    // Owner and name ARE set, so an existence check says writable; there is no
    // branch for a commit to sit on and the write 404s on a missing ref.
    expect(writeBlockReason(row({ state: 'awaiting_push', platform_can_push: true })))
      .toBe('not_connected');
  });

  it('answers null — no reason to refuse — for a connected repo we can push', () => {
    expect(writeBlockReason(connected({ platform_can_push: true }))).toBeNull();
  });

  /**
   * Ordering is load-bearing. A pull-only repo that is ALSO mid-connect must
   * report the permission, because that is the fact an operator has to act on;
   * `not_connected` resolves itself on the next push and would bury it.
   */
  it('reports the permission ahead of the connect state', () => {
    expect(writeBlockReason(row({ state: 'awaiting_push', platform_can_push: false })))
      .toBe('pull_only');
  });
});

describe('isWritableConnection — the inverted default', () => {
  /**
   * THE REGRESSION TEST FOR THE WHOLE AUDIT.
   *
   * On unmodified main this returns `true`: a legacy row with no `connect` key
   * fell through to `state === undefined` and was declared writable. Nine of the
   * rows corrected on 2026-08-19 were in exactly this shape.
   */
  it('refuses a legacy row whose permission was never recorded', () => {
    expect(isWritableConnection({
      repo_owner: 'ColaberryIntern', repo_name: 'old-one', status_json: { provisioned: true },
    })).toBe(false);
  });

  it('refuses a connected row whose permission was never recorded', () => {
    expect(isWritableConnection(connected())).toBe(false);
  });

  it('refuses a repo GitHub reported as pull-only', () => {
    expect(isWritableConnection(connected({ platform_can_push: false }))).toBe(false);
  });

  it('refuses an unbound project', () => {
    expect(isWritableConnection(null)).toBe(false);
    expect(isWritableConnection({ status_json: {} })).toBe(false);
  });

  it('allows exactly one thing: connected, and recorded as pushable', () => {
    expect(isWritableConnection(connected({ platform_can_push: true }))).toBe(true);
  });

  it('is exactly the absence of a block reason, so the two can never disagree', () => {
    const rows = [
      null,
      { status_json: {} },
      connected(),
      connected({ platform_can_push: false }),
      connected({ platform_can_push: true }),
      row({ state: 'awaiting_push', platform_can_push: true }),
      row(undefined),
    ];
    for (const r of rows) {
      expect(isWritableConnection(r)).toBe(writeBlockReason(r) === null);
    }
  });
});

describe('writeAccessPatch — one fact, never half-written', () => {
  /**
   * `platform_can_push` lives under `status_json.connect`; `provisioned` sits
   * beside `connect` at the top of `status_json`. Two keys, two nesting levels,
   * one fact — and `recordWriteAccess` wrote only the first, so the audit left
   * ten production rows reading `platform_can_push: false` next to
   * `provisioned: true`.
   *
   * The patch is the fix: there is no longer a way to name one without the other.
   */
  it('carries both keys for a repo we can push', () => {
    expect(writeAccessPatch(true)).toEqual({ platform_can_push: true, provisioned: true });
  });

  it('carries both keys for a repo we cannot', () => {
    expect(writeAccessPatch(false)).toEqual({ platform_can_push: false, provisioned: false });
  });

  it('never emits one key without the other', () => {
    for (const canPush of [true, false]) {
      expect(Object.keys(writeAccessPatch(canPush)).sort()).toEqual(['platform_can_push', 'provisioned']);
    }
  });

  it('agrees with isWritableConnection on a connected row', () => {
    // The invariant the two keys exist to preserve: whatever the patch records,
    // the writer's predicate reads back the same answer.
    for (const canPush of [true, false]) {
      const patch = writeAccessPatch(canPush);
      const applied = {
        repo_owner: 'a-student',
        repo_name: 'nightshift',
        status_json: {
          provisioned: patch.provisioned,
          connect: { state: 'connected', platform_can_push: patch.platform_can_push },
        },
      };
      expect(isWritableConnection(applied)).toBe(canPush);
      expect(storedConnect(applied).platform_can_push).toBe(patch.platform_can_push);
    }
  });
});
