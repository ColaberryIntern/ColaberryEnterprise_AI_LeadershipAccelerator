// Shared, pure formatters for the Community surface. Kept dependency-free so
// they're trivially unit-testable and reused across PostCard / Composer /
// EventStrip / the profile drawer rather than copy-pasted per component.

export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

// Relative "posted N ago" for feed timestamps. Falls back to an absolute
// month/day once a post is older than a week (Facebook-style).
export function timeAgo(iso: string, nowMs: number = Date.now()): string {
  const ms = nowMs - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Weekday + clock time for the event strip, e.g. "Mon 5:00 PM".
export function eventWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Human countdown to an upcoming event: "in 45m" / "in 3h" / "in 2d". Anything
// already started reads "now".
export function countdown(iso: string, nowMs: number = Date.now()): string {
  const diff = new Date(iso).getTime() - nowMs;
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

// URLs the composer stored as media that are actually video files, so the card
// renders a <video> rather than a broken <img>. Everything else renders as an
// image (the composer only accepts image/video URLs).
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(url);
}
