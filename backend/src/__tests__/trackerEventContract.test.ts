/**
 * The tracker and the signal detector must agree on payload key names.
 *
 * WHY THIS EXISTS. This contract has already failed silently once, in production, for
 * the lifetime of a file. The platform tracker emitted `event_data.depth` while
 * `behavioralSignalService` read `event_data.depth_percent`. Both sides were correct in
 * isolation, both were covered by their own tests, and the mismatch produced no error:
 * the read simply returned `undefined`, the `>= 75` comparison was false, and three
 * lead signals worth 75 points never fired. Nothing in a build, a type check or a
 * screenshot can see that.
 *
 * The same shape of bug is still live elsewhere and is recorded here rather than
 * hidden: `extended_time_on_page` has never fired for any visitor on any surface,
 * because no `time_on_page` row in production carries `event_data.seconds`.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. It asserts that every key the detector reads
 * is a key some tracker emits, and vice versa, by reading both files as text. It does
 * NOT execute the tracker, so it cannot prove a value is correct — only that the two
 * sides are still spelling the same thing. That is precisely the failure that happened,
 * so it is the failure worth pinning.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SDK = path.join(REPO_ROOT, 'packages', 'tracking-sdk', 'track-v2.js');
const DETECTOR = path.join(REPO_ROOT, 'backend', 'src', 'services', 'behavioralSignalService.ts');

/**
 * Each entry is one payload key that must survive the whole trip. `emittedAs` is the
 * literal the tracker writes; `readAs` is the literal the detector reads. They are
 * spelled out separately so a rename on either side fails here rather than in silence.
 */
const CONTRACTS = [
  {
    signal: 'deep_scroll_* (25/30/20 points)',
    event: 'scroll',
    emittedAs: 'depth_percent',
    readAs: 'depth_percent',
  },
  {
    // Not consumed by the detector, but by journeyTimelineService for its label. Kept
    // in the same list because the two keys carry ONE number and dropping either one
    // silently breaks a different consumer.
    signal: 'journey timeline label',
    event: 'scroll',
    emittedAs: 'depth',
    readAs: null,
  },
  {
    signal: 'extended_time_on_page (15 points)',
    event: 'time_on_page',
    emittedAs: 'seconds',
    readAs: 'seconds',
  },
];

describe('tracker / signal-detector payload contract', () => {
  const sdk = fs.readFileSync(SDK, 'utf8');
  const detector = fs.readFileSync(DETECTOR, 'utf8');

  it('finds both files with real content — a green run over nothing proves nothing', () => {
    expect(sdk.length).toBeGreaterThan(1000);
    expect(detector.length).toBeGreaterThan(1000);
    expect(CONTRACTS.length).toBeGreaterThanOrEqual(3);
  });

  it.each(CONTRACTS.map((c) => [`${c.event}.${c.emittedAs} -> ${c.signal}`, c] as const))(
    '%s: the tracker still emits it',
    (_label, contract) => {
      expect(sdk).toContain(`${contract.emittedAs}:`);
    },
  );

  it.each(
    CONTRACTS.filter((c) => c.readAs).map(
      (c) => [`${c.event}.${c.readAs} -> ${c.signal}`, c] as const,
    ),
  )('%s: the detector still reads it', (_label, contract) => {
    expect(detector).toContain(contract.readAs as string);
  });

  it('scroll carries BOTH keys, because two consumers read one number', () => {
    // The original bug in one assertion. Emitting only `depth` revives the timeline
    // label and leaves the lead signals dead; emitting only `depth_percent` does the
    // reverse. Neither failure raises anything.
    const scrollCall = sdk.match(/track\('scroll',\s*\{[^}]*\}/);
    expect(scrollCall).not.toBeNull();
    expect(scrollCall![0]).toContain('depth:');
    expect(scrollCall![0]).toContain('depth_percent:');
  });

  it('the tracker emits the events the engagement signals are derived from', () => {
    // Phase 3 exists because these two were absent. If either disappears, four signals
    // go quietly unreachable on every brand site again.
    expect(sdk).toContain("track('scroll'");
    expect(sdk).toContain("track('time_on_page'");
  });

  it('does not emit heartbeat, which nothing consumes', () => {
    // Deliberate omission, asserted so it stays deliberate. The server accepts the
    // type, but `recordPageEvent` never touches the session row and the only writer of
    // `duration_seconds` is reachable solely via POST /api/t/heartbeat, which no client
    // calls. Emitting it would add a row per visitor per interval and change no score.
    expect(sdk).not.toContain("track('heartbeat'");
  });

  it('honours Do Not Track before doing anything else', () => {
    const dntIndex = sdk.indexOf('doNotTrack');
    const firstSend = sdk.indexOf('function send(');
    expect(dntIndex).toBeGreaterThan(-1);
    // The check must precede any send path, not sit decoratively below it.
    expect(dntIndex).toBeLessThan(firstSend);
  });
});
