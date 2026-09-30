/**
 * watchProgressService.resolveAuthoritativeDurationS — the precedence logic that
 * decides which "ground truth" duration (if any) governs the 75% gate for a card:
 * a fixed authored video's real provider duration, else the specific
 * testimonial/podcast this student was assigned, else null (falls through to the
 * original client-trust ratchet, unchanged).
 */
jest.mock('../../timeline/networkVideoService', () => ({ getAssignedTestimonialDurationS: jest.fn() }));
jest.mock('../../timeline/podcastMediaService', () => ({ getAssignedPodcastDurationS: jest.fn() }));

import { resolveAuthoritativeDurationS } from '../watchProgressService';
import { getAssignedTestimonialDurationS } from '../../timeline/networkVideoService';
import { getAssignedPodcastDurationS } from '../../timeline/podcastMediaService';

const mockTestimonial = getAssignedTestimonialDurationS as jest.Mock;
const mockPodcast = getAssignedPodcastDurationS as jest.Mock;

const card = (type: string, metadata: any = {}) => ({ id: 'card-1', type, metadata } as any);

describe('resolveAuthoritativeDurationS', () => {
  beforeEach(() => { mockTestimonial.mockReset(); mockPodcast.mockReset(); });

  it('prefers a fixed video card\'s real duration over anything else', async () => {
    const c = card('video', { video: { url: 'https://youtu.be/abc12345678', duration_seconds: 402 } });
    await expect(resolveAuthoritativeDurationS(c, 'enr-1')).resolves.toBe(402);
    expect(mockTestimonial).not.toHaveBeenCalled();
  });

  it('falls through to the assigned testimonial lookup for testimonial cards with no fixed video', async () => {
    mockTestimonial.mockResolvedValue(180);
    const c = card('testimonial', {});
    await expect(resolveAuthoritativeDurationS(c, 'enr-1')).resolves.toBe(180);
    expect(mockTestimonial).toHaveBeenCalledWith('enr-1', 'card-1');
  });

  it('falls through to the assigned podcast lookup for podcast cards with no fixed link', async () => {
    mockPodcast.mockResolvedValue(1264);
    const c = card('podcast', {});
    await expect(resolveAuthoritativeDurationS(c, 'enr-1')).resolves.toBe(1264);
  });

  it('a testimonial card WITH a fixed pasted video uses that fixed duration, not the assignment lookup', async () => {
    const c = card('testimonial', { video: { url: 'https://youtu.be/abc12345678', duration_seconds: 90 } });
    await expect(resolveAuthoritativeDurationS(c, 'enr-1')).resolves.toBe(90);
    expect(mockTestimonial).not.toHaveBeenCalled();
  });

  it('returns null for a non-video type — never fabricates ground truth', async () => {
    const c = card('reflection', {});
    await expect(resolveAuthoritativeDurationS(c, 'enr-1')).resolves.toBeNull();
    expect(mockTestimonial).not.toHaveBeenCalled();
    expect(mockPodcast).not.toHaveBeenCalled();
  });

  it('returns null when the assignment lookup itself has nothing yet (unassigned, or not yet backfilled)', async () => {
    mockTestimonial.mockResolvedValue(null);
    const c = card('testimonial', {});
    await expect(resolveAuthoritativeDurationS(c, 'enr-1')).resolves.toBeNull();
  });
});
