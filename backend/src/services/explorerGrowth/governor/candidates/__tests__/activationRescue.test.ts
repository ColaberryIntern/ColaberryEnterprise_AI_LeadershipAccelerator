/**
 * C99: splitting the 72h-timer half of ACTIVATING out as NOT_STARTED must not change who activation rescue proposes.
 * The same learner gets the same candidate (same campaign, score, channel, asset type) whether stored as the old
 * timer-only ACTIVATING or the new NOT_STARTED. The state is echoed in the rationale and the asset request, and the
 * asset resolver maps both states to the same stage, so those echoes cannot change which asset is picked either.
 */
import { activationRescue } from '../activationRescue';
import { PRIMARY_STATE_TO_STAGE } from '../../../content/assetPurposeMap';
import type { Candidate, GovernorContext } from '../../types';
import type { ExplorerPrimaryState } from '../../../../../types/explorerGrowth';

const NOW = new Date('2026-11-02T12:00:00Z');

function ctx(state: ExplorerPrimaryState, over: Partial<GovernorContext> = {}): GovernorContext {
  return {
    primary_state: state,
    overlays: [],
    affinities: [{ tag: 'genai', confidence: 0.6 }],
    asOf: NOW,
    readout: { lastEngagementAt: null },
    contactability: { email: { eligible: true }, in_app: { eligible: true } },
    ...over,
  } as unknown as GovernorContext;
}

/** The candidate with the echoed state removed: everything that decides who is contacted, with what, and how. */
function decisive(c: Candidate | null) {
  if (!c) return null;
  return {
    ...c,
    rationale: c.rationale.filter((r) => !r.startsWith('state=')),
    required_assets: (c.required_assets ?? []).map(({ state: _state, ...rest }) => rest),
  };
}

describe('activationRescue and NOT_STARTED (C99)', () => {
  it.each(['NEW_EXPLORER', 'NOT_STARTED', 'ACTIVATING'] as ExplorerPrimaryState[])('proposes rescue for %s', (s) => {
    expect(activationRescue(ctx(s))).not.toBeNull();
  });

  it('NOT_STARTED gets exactly the candidate a timer-only ACTIVATING got (never engaged)', () => {
    expect(decisive(activationRescue(ctx('NOT_STARTED')))).toEqual(decisive(activationRescue(ctx('ACTIVATING'))));
  });

  it('NOT_STARTED gets exactly the candidate a timer-only ACTIVATING got (lapsed, dormant)', () => {
    const lapsed = {
      overlays: ['DORMANT'],
      readout: { lastEngagementAt: new Date(NOW.getTime() - 20 * 86_400_000) },
    } as unknown as Partial<GovernorContext>;
    expect(decisive(activationRescue(ctx('NOT_STARTED', lapsed)))).toEqual(decisive(activationRescue(ctx('ACTIVATING', lapsed))));
  });

  it('the echoed state resolves to the same asset stage', () => {
    expect(PRIMARY_STATE_TO_STAGE.NOT_STARTED).toBe(PRIMARY_STATE_TO_STAGE.ACTIVATING);
  });

  it('still proposes nothing once a card is done, or with no reachable channel', () => {
    expect(activationRescue(ctx('ACTIVE_LEARNER'))).toBeNull();
    const unreachable = {
      contactability: { email: { eligible: false }, in_app: { eligible: false } },
    } as unknown as Partial<GovernorContext>;
    expect(activationRescue(ctx('NOT_STARTED', unreachable))).toBeNull();
  });
});
