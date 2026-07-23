/**
 * podcastMutePreference — sticky, cross-surface mute state for podcast (audio-only)
 * playback. A podcast always STARTS muted the first time a student encounters one
 * (autoplay policy + product requirement); once they unmute an episode, every
 * podcast plays unmuted from then on, until they mute one again — tracked in
 * localStorage so the Timeline feed tile and the card detail drawer never disagree.
 */

const KEY = 'tl-podcast-muted';

export function getPodcastMuted(): boolean {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setPodcastMuted(muted: boolean): void {
  try { window.localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* best-effort */ }
}
