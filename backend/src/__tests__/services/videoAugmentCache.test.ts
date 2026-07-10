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

  it('cache miss: generates once and saves to card.metadata.augment (preserving other metadata)', async () => {
    (chatJson as jest.Mock).mockResolvedValue({ parsed: { summary: 'fresh' }, cost_usd: 0.01 });
    const card = { id: 'c2', type: 'video', title: 'V', metadata: { video: { url: 'x' } } };
    const r = await videoAugment(card as any);
    expect(r.cached).toBe(false);
    expect(r.augment).toEqual({ summary: 'fresh' });
    expect(chatJson).toHaveBeenCalledTimes(1);
    expect((TimelineCard as any).update).toHaveBeenCalledWith(
      { metadata: { video: { url: 'x' }, augment: { summary: 'fresh' } } },
      { where: { id: 'c2' } },
    );
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
