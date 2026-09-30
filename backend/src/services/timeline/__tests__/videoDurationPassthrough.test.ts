/**
 * duration_seconds passthrough — the plumbing half of the duration-accuracy fix.
 * Three producers feed FeedVideo.video: a fixed authored card (videoFromMetadata),
 * a personalized testimonial (networkVideoService.toFeedVideo), and a personalized
 * podcast episode (podcastMediaService.toFeedVideo). All three must carry a real
 * per-video duration through to the frontend instead of dropping it on the floor
 * (the bug: only the flat, type-level `estimated_time` ever reached the player).
 */
import { videoFromMetadata } from '../timelineService';
import { toFeedVideo as networkToFeedVideo } from '../networkVideoService';
import { toFeedVideo as podcastToFeedVideo } from '../podcastMediaService';

describe('videoFromMetadata — fixed authored video cards', () => {
  it('passes through a real duration_seconds when present', () => {
    const v = videoFromMetadata({ video: { url: 'https://youtu.be/abc12345678', duration_seconds: 402 } });
    expect(v?.duration_seconds).toBe(402);
  });
  it('omits duration_seconds (null) when absent — never fabricates one', () => {
    const v = videoFromMetadata({ video: { url: 'https://youtu.be/abc12345678' } });
    expect(v?.duration_seconds).toBeNull();
  });
  it('treats a zero/negative stored duration as unknown, not a real value', () => {
    expect(videoFromMetadata({ video: { url: 'u', duration_seconds: 0 } })?.duration_seconds).toBeNull();
    expect(videoFromMetadata({ video: { url: 'u', duration_seconds: -10 } })?.duration_seconds).toBeNull();
  });
});

describe('networkVideoService.toFeedVideo — testimonial picks', () => {
  const row = (duration_seconds: number | null) => ({
    id: 'v1', category: 'testimonial', title: 'A story', description: null,
    host: 'youtube', provider_video_id: 'abc12345678', embed_url: null,
    watch_url: 'https://youtu.be/abc12345678', thumbnail_url: null, duration_seconds, tags: [],
  });

  it('passes through the network_videos real duration once ingestion populates it', () => {
    expect(networkToFeedVideo(row(180)).duration_seconds).toBe(180);
  });
  it('is null when the catalog row has no duration yet (pre-fix data, or Vimeo with no API)', () => {
    expect(networkToFeedVideo(row(null)).duration_seconds).toBeNull();
  });
});

describe('podcastMediaService.toFeedVideo — episode picks', () => {
  const row = (duration_seconds: number | null) => ({
    id: 'p1', title: 'Episode 1', description: null, audio_url: 'https://example.com/ep1.mp3',
    thumbnail_url: null, category: null, duration_seconds, tags: [],
  });

  it('passes through the already-correct RSS-derived duration', () => {
    expect(podcastToFeedVideo(row(1264)).duration_seconds).toBe(1264);
  });
  it('is null when the episode has no duration on file', () => {
    expect(podcastToFeedVideo(row(null)).duration_seconds).toBeNull();
  });
});
