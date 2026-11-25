/**
 * The ladder rules, tested without a database.
 *
 * The load-bearing case is the one that separates "waiting on you" from "blocked elsewhere". An
 * approval screen that calls every uncredited rung the approver's problem is worse than one that
 * says nothing, because it invites a decision that frees nothing. `platform.orchestration_health_watch`
 * on 25 Nov 2026 is exactly that shape: steps 3 and 4 wait on Ali, step 0.1 waits on a screen that
 * does not exist yet, and all three are uncredited.
 */
import {
  LADDER_STEPS,
  MIN_RUNGS,
  buildLadder,
  releasesSentence,
  rungOf,
  storyPrefixForCapability,
} from '../capabilityLadder';

const PREFIX = 'platform.CAP.orchestration_health_watch';
const CAP = 'platform.orchestration_health_watch';

/** The live board on 25 Nov 2026, verbatim: five credited, three not. */
function liveStories() {
  return [
    { story_id: `${PREFIX}.L0-CHOOSE`, verified_at: null },
    { story_id: `${PREFIX}.L0-SCOPE-SHEET`, verified_at: '2026-11-25 01:13:20.303+00' },
    { story_id: `${PREFIX}.L0-ASK-FOR-A-SCREEN`, verified_at: '2026-11-24 21:03:14.323+00' },
    { story_id: `${PREFIX}.L1-BY-HAND`, verified_at: '2026-11-23 16:22:11.381+00' },
    { story_id: `${PREFIX}.L2-IN-THE-APP`, verified_at: '2026-11-23 16:22:11.448+00' },
    { story_id: `${PREFIX}.L3-TOOL-REQUEST`, verified_at: null },
    { story_id: `${PREFIX}.L4-AGENT-WATCHED`, verified_at: null },
  ];
}

describe('storyPrefixForCapability', () => {
  it('qualifies the domain with the .CAP. segment the board uses', () => {
    expect(storyPrefixForCapability(CAP)).toBe(PREFIX);
  });

  it('replaces only the FIRST dot, so a dotted capability name survives', () => {
    expect(storyPrefixForCapability('platform.a.b')).toBe('platform.CAP.a.b');
  });

  it('refuses an id with no domain rather than guessing one', () => {
    expect(storyPrefixForCapability('orchestration_health_watch')).toBeNull();
    expect(storyPrefixForCapability('')).toBeNull();
    expect(storyPrefixForCapability('.leading')).toBeNull();
    expect(storyPrefixForCapability('trailing.')).toBeNull();
  });
});

describe('rungOf', () => {
  it('finds every declared rung', () => {
    for (const s of LADDER_STEPS) {
      expect(rungOf(`${PREFIX}.${s.suffix}`, PREFIX)?.step).toBe(s.step);
    }
  });

  it('is null for the capability row itself, an unknown suffix, and a foreign prefix', () => {
    expect(rungOf(PREFIX, PREFIX)).toBeNull();
    expect(rungOf(`${PREFIX}.L9-INVENTED`, PREFIX)).toBeNull();
    expect(rungOf('sales.CAP.something.L1-BY-HAND', PREFIX)).toBeNull();
  });

  it('does not match a prefix that is merely a string prefix of another capability', () => {
    expect(rungOf(`${PREFIX}_extra.L1-BY-HAND`, PREFIX)).toBeNull();
  });
});

describe('buildLadder', () => {
  it('separates what the approver frees from what is blocked elsewhere', () => {
    const rungs = buildLadder(CAP, liveStories(), 'tool');
    expect(rungs).not.toBeNull();
    const byStep = Object.fromEntries((rungs as NonNullable<typeof rungs>).map((r) => [r.step, r]));

    expect(byStep['0.2'].state).toBe('credited');
    expect(byStep['1'].state).toBe('credited');
    expect(byStep['2'].state).toBe('credited');

    // The whole point: all three are uncredited, only two are his to free.
    expect(byStep['3'].state).toBe('waiting_on_you');
    expect(byStep['4'].state).toBe('waiting_on_you');
    expect(byStep['0.1'].state).toBe('blocked_elsewhere');

    expect(byStep['3'].released_by_this).toBe(true);
    expect(byStep['4'].released_by_this).toBe(true);
    expect(byStep['0.1'].released_by_this).toBe(false);
  });

  it('frees nothing on a CHANGE request, because access is not a rung', () => {
    const rungs = buildLadder(CAP, liveStories(), 'change');
    expect((rungs as NonNullable<typeof rungs>).every((r) => !r.released_by_this)).toBe(true);
    expect((rungs as NonNullable<typeof rungs>).find((r) => r.step === '3')?.state).toBe('blocked_elsewhere');
  });

  it('does not claim to free a rung that is already credited', () => {
    const stories = liveStories().map((s) => (s.story_id.endsWith('L3-TOOL-REQUEST')
      ? { ...s, verified_at: '2026-11-25 00:00:00+00' } : s));
    const rungs = buildLadder(CAP, stories, 'tool');
    const three = (rungs as NonNullable<typeof rungs>).find((r) => r.step === '3');
    expect(three?.state).toBe('credited');
    expect(three?.released_by_this).toBe(false);
  });

  it('returns rungs in climbing order whatever order the rows arrive in', () => {
    const rungs = buildLadder(CAP, [...liveStories()].reverse(), 'tool');
    expect((rungs as NonNullable<typeof rungs>).map((r) => r.step))
      .toEqual(['0.1', '0.2', '0.3', '1', '2', '3', '4']);
  });

  it('shows nothing for a capability with fewer than two rungs', () => {
    // executive.weekly_performance_report_email on 25 Nov 2026: the capability row and nothing else.
    expect(buildLadder('executive.weekly_performance_report_email', [], 'tool')).toBeNull();
    expect(buildLadder(CAP, [{ story_id: `${PREFIX}.L1-BY-HAND`, verified_at: null }], 'tool')).toBeNull();
    expect(MIN_RUNGS).toBe(2);
  });

  it('omits rungs the capability does not have rather than inventing empty ones', () => {
    const rungs = buildLadder(CAP, [
      { story_id: `${PREFIX}.L1-BY-HAND`, verified_at: null },
      { story_id: `${PREFIX}.L2-IN-THE-APP`, verified_at: null },
    ], 'tool');
    expect((rungs as NonNullable<typeof rungs>).map((r) => r.step)).toEqual(['1', '2']);
  });

  it('is null for a capability id it cannot resolve', () => {
    expect(buildLadder('nodomain', liveStories(), 'tool')).toBeNull();
  });

  it('ignores stories belonging to another capability', () => {
    const rungs = buildLadder(CAP, [
      ...liveStories(),
      { story_id: 'sales.CAP.other.L3-TOOL-REQUEST', verified_at: null },
    ], 'tool');
    expect((rungs as NonNullable<typeof rungs>).length).toBe(7);
  });
});

describe('releasesSentence', () => {
  it('names both steps and says why the second one waits', () => {
    const rungs = buildLadder(CAP, liveStories(), 'tool');
    expect(releasesSentence(rungs)).toBe(
      'Releases step 3 and step 4, and the later step cannot start until the earlier one is granted.',
    );
  });

  it('is a plain sentence for a single step', () => {
    const stories = liveStories().map((s) => (s.story_id.endsWith('L4-AGENT-WATCHED')
      ? { ...s, verified_at: '2026-11-25 00:00:00+00' } : s));
    expect(releasesSentence(buildLadder(CAP, stories, 'tool'))).toBe('Releases step 3.');
  });

  it('says nothing rather than something empty when nothing is freed', () => {
    expect(releasesSentence(null)).toBeNull();
    expect(releasesSentence(buildLadder(CAP, liveStories(), 'change'))).toBeNull();
  });
});
