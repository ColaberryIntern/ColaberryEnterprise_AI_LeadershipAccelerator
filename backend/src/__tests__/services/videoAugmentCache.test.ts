// Locks the class-wide cache for interactive video notes: generate ONCE, then
// every future student reuses the copy saved on the card (no repeat LLM cost).
jest.mock('../../services/runtime/runtimeAi', () => ({ chatText: jest.fn(), chatJson: jest.fn() }));
jest.mock('../../models/TimelineCard', () => ({ __esModule: true, default: { update: jest.fn().mockResolvedValue([1]) } }));
jest.mock('../../models/MentorTurn', () => ({ __esModule: true, default: { create: jest.fn() } }));

import { videoAugment } from '../../services/runtime/mentorService';
import { chatJson } from '../../services/runtime/runtimeAi';
import TimelineCard from '../../models/TimelineCard';

describe('videoAugment — class-wide cache', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cache hit: returns the saved augment, no LLM call, no write', async () => {
    const card = { id: 'c1', type: 'video', title: 'V', metadata: { augment: { summary: 'cached' } } };
    const r = await videoAugment(card as any);
    expect(r.cached).toBe(true);
    expect(r.augment).toEqual({ summary: 'cached' });
    expect(r.cost_usd).toBe(0);
    expect(chatJson).not.toHaveBeenCalled();
    expect((TimelineCard as any).update).not.toHaveBeenCalled();
  });

  it('cache miss: generates once and saves augment + augment_at (preserving other metadata)', async () => {
    (chatJson as jest.Mock).mockResolvedValue({ parsed: { summary: 'fresh' }, cost_usd: 0.01 });
    const card = { id: 'c2', type: 'video', title: 'V', metadata: { video: { url: 'x' } } };
    const r = await videoAugment(card as any);
    expect(r.cached).toBe(false);
    expect(r.augment).toEqual({ summary: 'fresh' });
    expect(chatJson).toHaveBeenCalledTimes(1);
    const [payload, where] = (TimelineCard as any).update.mock.calls[0];
    expect(payload.metadata.video).toEqual({ url: 'x' });          // other metadata preserved
    expect(payload.metadata.augment).toEqual({ summary: 'fresh' });
    expect(typeof payload.metadata.augment_at).toBe('string');     // stamped for the 30-day TTL
    expect(where).toEqual({ where: { id: 'c2' } });
  });

  it('fresh timestamped copy (within 30 days): cache hit, no LLM call, no write', async () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days old
    const card = { id: 'c4', type: 'video', title: 'V', metadata: { augment: { summary: 'still-good' }, augment_at: recent } };
    const r = await videoAugment(card as any);
    expect(r.cached).toBe(true);
    expect(r.augment).toEqual({ summary: 'still-good' });
    expect(chatJson).not.toHaveBeenCalled();
    expect((TimelineCard as any).update).not.toHaveBeenCalled();
  });

  it('expired copy (older than 30 days): regenerates and re-stamps', async () => {
    (chatJson as jest.Mock).mockResolvedValue({ parsed: { summary: 'refreshed' }, cost_usd: 0.01 });
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days old
    const card = { id: 'c5', type: 'video', title: 'V', metadata: { augment: { summary: 'stale' }, augment_at: old } };
    const r = await videoAugment(card as any);
    expect(r.cached).toBe(false);
    expect(r.augment).toEqual({ summary: 'refreshed' });
    expect(chatJson).toHaveBeenCalledTimes(1);
    expect(typeof (TimelineCard as any).update.mock.calls[0][0].metadata.augment_at).toBe('string');
  });

  it('force=true regenerates even when a cached copy exists', async () => {
    (chatJson as jest.Mock).mockResolvedValue({ parsed: { summary: 'new' }, cost_usd: 0.01 });
    const card = { id: 'c3', type: 'video', title: 'V', metadata: { augment: { summary: 'old' } } };
    const r = await videoAugment(card as any, true);
    expect(r.cached).toBe(false);
    expect(r.augment).toEqual({ summary: 'new' });
    expect(chatJson).toHaveBeenCalledTimes(1);
  });
});
