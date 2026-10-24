jest.mock('../../../config/env', () => ({ env: { portalPointsAwardEnabled: true } }));
jest.mock('../../pointsService', () => ({ award: jest.fn() }));
jest.mock('../../progression/pointsConfigService', () => ({ getTypeXp: jest.fn() }));

import { award } from '../../pointsService';
import { getTypeXp } from '../../progression/pointsConfigService';
import { env } from '../../../config/env';
import {
  payForRecordedType,
  payForSharedType,
  recordedTypeRate,
  sharedTypeRate,
  PRESENTATION_RECORDING_XP_KEY,
  PRESENTATION_SHARE_XP_KEY,
} from '../presentationRecordingPoints';

const mockAward = award as unknown as jest.Mock;
const mockRate = getTypeXp as unknown as jest.Mock;
const mutableEnv = env as unknown as { portalPointsAwardEnabled: boolean };

/**
 * PAYING FOR A RECORDED PRESENTATION TYPE.
 *
 * Ali asked for points per video. The risk in "points per video" is not that it
 * fails to pay — it is that it pays too easily. This repo has already had that
 * bug: `joinBooking` paid for attendance until somebody noticed a learner can
 * mint their own practice room, making "book, join, repeat" a faucet.
 *
 * The same shape with a record button is "record, stop, repeat". So most of
 * what follows is about the idempotency key being the TYPE.
 */

const ENROL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeEach(() => {
  jest.clearAllMocks();
  mutableEnv.portalPointsAwardEnabled = true;
  mockRate.mockResolvedValue({ learning: 0, builder: 30, community: 10 });
  mockAward.mockResolvedValue({ awarded: true, points: 30 });
});

describe('the faucet guard', () => {
  it('keys the award on the TYPE, not the recording', async () => {
    await payForRecordedType(ENROL, 'working_system_demo', { recordingId: 'rec-1' });
    expect(mockAward).toHaveBeenCalledWith(ENROL, expect.objectContaining({
      eventKey: 'presentation_type:working_system_demo',
    }));
  });

  it('asks for the SAME key for a second take of the same type', async () => {
    // award() is idempotent per (enrollment, event_key), so an identical key is
    // exactly what makes the second take free. This asserts the key, which is
    // the part this module controls.
    await payForRecordedType(ENROL, 'working_system_demo', { recordingId: 'rec-1' });
    await payForRecordedType(ENROL, 'working_system_demo', { recordingId: 'rec-2' });
    const keys = mockAward.mock.calls.map((c) => c[1].eventKey);
    expect(keys).toEqual([
      'presentation_type:working_system_demo',
      'presentation_type:working_system_demo',
    ]);
  });

  it('reports nothing awarded when the ledger says it was already paid', async () => {
    mockAward.mockResolvedValue({ awarded: false, points: 0 });
    const r = await payForRecordedType(ENROL, 'working_system_demo');
    expect(r).toEqual({ awarded: false, builder: 0, community: 0 });
  });

  it('uses a DIFFERENT key for a different type, so seven types can pay seven times', async () => {
    const types = [
      'project_introduction', 'ai_visual_presentation', 'working_system_demo',
      'final_showcase', 'architecture_review', 'stakeholder_update', 'client_handoff',
    ];
    for (const t of types) await payForRecordedType(ENROL, t);
    const keys = mockAward.mock.calls.map((c) => c[1].eventKey);
    expect(new Set(keys).size).toBe(7);
  });
});

describe('it fails closed', () => {
  it('pays nothing when the rate row is missing or zero', async () => {
    mockRate.mockResolvedValue({ learning: 0, builder: 0, community: 0 });
    const r = await payForRecordedType(ENROL, 'final_showcase');
    expect(r.awarded).toBe(false);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('pays nothing when awards are switched off', async () => {
    mutableEnv.portalPointsAwardEnabled = false;
    await payForRecordedType(ENROL, 'final_showcase');
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('pays nothing for a take with no type — which is what an unmatched one has', async () => {
    await payForRecordedType(ENROL, null);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('pays nothing when the owner is unknown', async () => {
    await payForRecordedType(null, 'final_showcase');
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('pays nothing, rather than throwing, when the rate lookup fails', async () => {
    mockRate.mockRejectedValue(new Error('db down'));
    await expect(payForRecordedType(ENROL, 'final_showcase')).resolves.toEqual({
      awarded: false, builder: 0, community: 0,
    });
  });
});

describe('a failed award never costs the recording', () => {
  it('swallows and reports nothing paid', async () => {
    mockAward.mockRejectedValue(new Error('points table locked'));
    await expect(payForRecordedType(ENROL, 'final_showcase', { recordingId: 'rec-9' }))
      .resolves.toEqual({ awarded: false, builder: 0, community: 0 });
  });
});

describe('what it pays', () => {
  it('pays the configured builder rate and reports the community rate', async () => {
    mockAward.mockResolvedValue({ awarded: true, points: 30 });
    const r = await payForRecordedType(ENROL, 'client_handoff');
    expect(r).toEqual({ awarded: true, builder: 30, community: 10 });
    expect(mockAward).toHaveBeenCalledWith(ENROL, expect.objectContaining({
      eventType: PRESENTATION_RECORDING_XP_KEY,
      points: 30,
    }));
  });

  it('carries the type and recording in the metadata, so a payment can be traced', async () => {
    await payForRecordedType(ENROL, 'client_handoff', { recordingId: 'rec-7', storyId: 'PREP-4' });
    expect(mockAward.mock.calls[0][1].metadata).toEqual({
      presentation_type: 'client_handoff', recording_id: 'rec-7', story_id: 'PREP-4',
    });
  });

  it('reads the rate from config rather than a constant', async () => {
    mockRate.mockResolvedValue({ learning: 0, builder: 45, community: 0 });
    mockAward.mockResolvedValue({ awarded: true, points: 45 });
    const r = await payForRecordedType(ENROL, 'client_handoff');
    expect(r.builder).toBe(45);
    expect(mockRate).toHaveBeenCalledWith(PRESENTATION_RECORDING_XP_KEY);
  });
});

describe('the sharing bonus', () => {
  beforeEach(() => {
    mockRate.mockResolvedValue({ learning: 0, builder: 15, community: 10 });
    mockAward.mockResolvedValue({ awarded: true, points: 15 });
  });

  it('pays on its own key, so sharing is extra rather than instead', async () => {
    const r = await payForSharedType(ENROL, 'working_system_demo', { showcaseId: 'show-1' });
    expect(r).toEqual({ awarded: true, builder: 15, community: 10 });
    expect(mockAward).toHaveBeenCalledWith(ENROL, expect.objectContaining({
      eventType: PRESENTATION_SHARE_XP_KEY,
      eventKey: 'presentation_shared:working_system_demo',
    }));
  });

  it('does not collide with the recording award for the same type', async () => {
    await payForRecordedType(ENROL, 'working_system_demo');
    await payForSharedType(ENROL, 'working_system_demo');
    const keys = mockAward.mock.calls.map((c) => c[1].eventKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('is capped at seven too — sharing, withdrawing and re-sharing pays once', async () => {
    await payForSharedType(ENROL, 'final_showcase', { showcaseId: 'show-1' });
    await payForSharedType(ENROL, 'final_showcase', { showcaseId: 'show-2' });
    const keys = mockAward.mock.calls.map((c) => c[1].eventKey);
    expect(keys).toEqual(['presentation_shared:final_showcase', 'presentation_shared:final_showcase']);
  });

  it('pays nothing when the bonus row is missing or zero', async () => {
    mockRate.mockResolvedValue({ learning: 0, builder: 0, community: 0 });
    expect(await payForSharedType(ENROL, 'final_showcase')).toEqual({ awarded: false, builder: 0, community: 0 });
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('pays nothing when awards are off, or the owner or type is unknown', async () => {
    mutableEnv.portalPointsAwardEnabled = false;
    await payForSharedType(ENROL, 'final_showcase');
    mutableEnv.portalPointsAwardEnabled = true;
    await payForSharedType(null, 'final_showcase');
    await payForSharedType(ENROL, null);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('never unpublishes a demo over a points failure', async () => {
    mockAward.mockRejectedValue(new Error('points table locked'));
    await expect(payForSharedType(ENROL, 'final_showcase', { showcaseId: 'show-1' }))
      .resolves.toEqual({ awarded: false, builder: 0, community: 0 });
  });

  it('records the showcase it was paid for', async () => {
    await payForSharedType(ENROL, 'client_handoff', { showcaseId: 'show-3', recordingId: 'rec-3' });
    expect(mockAward.mock.calls[0][1].metadata).toEqual({
      presentation_type: 'client_handoff', showcase_id: 'show-3', recording_id: 'rec-3',
    });
  });
});

describe('sharedTypeRate', () => {
  it('reports the bonus so the UI can advertise it', async () => {
    mockRate.mockResolvedValue({ learning: 0, builder: 15, community: 10 });
    await expect(sharedTypeRate()).resolves.toEqual({ builder: 15, community: 10 });
  });

  it('reports zero when config is unreachable', async () => {
    mockRate.mockRejectedValue(new Error('db down'));
    await expect(sharedTypeRate()).resolves.toEqual({ builder: 0, community: 0 });
  });
});

describe('recordedTypeRate — what the empty slot advertises', () => {
  it('reports the configured rate', async () => {
    await expect(recordedTypeRate()).resolves.toEqual({ builder: 30, community: 10 });
  });

  it('reports zero when awards are off, so the slot shows no badge', async () => {
    mutableEnv.portalPointsAwardEnabled = false;
    await expect(recordedTypeRate()).resolves.toEqual({ builder: 0, community: 0 });
  });

  it('reports zero rather than throwing when config is unreachable', async () => {
    mockRate.mockRejectedValue(new Error('db down'));
    await expect(recordedTypeRate()).resolves.toEqual({ builder: 0, community: 0 });
  });
});
