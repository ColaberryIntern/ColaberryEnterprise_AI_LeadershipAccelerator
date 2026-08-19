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

// A YouTube link isn't a playable <video> file — pull the 11-char video id from
// the common URL shapes (watch?v=, youtu.be/, shorts/, embed/) so we can show
// the real YouTube thumbnail instead of a broken tile.
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
export function youtubeThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

// Post and comment bodies are stored and rendered as plain text, so an
// Eventbrite link in an event announcement — or the inbox on an AI Internship
// post — arrived as inert characters a student had to select and copy by hand.
// `linkify` splits a body into typed segments so the renderer can emit real
// anchors. It stays pure (no JSX) to keep this module dependency-free and
// unit-testable.
export type BodySegment =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'email'; value: string; href: string };

// Leftmost-first alternation: an explicit http(s) URL wins over a bare `www.`
// host, which wins over an email. Whitespace, angle brackets and parentheses
// all terminate a match, so "(details at https://evt.br/x)" cannot swallow the
// closing paren, and every href built below is structurally http(s)/mailto —
// a `javascript:` payload cannot survive this shape.
const LINK_RE = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

// Sentence punctuation trails a link far more often than it belongs to one:
// "register at https://evt.br/x." must not put the full stop inside the href.
const TRAILING_PUNCT = /[.,;:!?"'\]}]+$/;

function toLinkSegment(token: string): BodySegment | null {
  if (/^https?:\/\//i.test(token)) return { kind: 'url', value: token, href: token };
  if (/^www\./i.test(token)) return { kind: 'url', value: token, href: `https://${token}` };
  if (token.includes('@')) return { kind: 'email', value: token, href: `mailto:${token}` };
  return null;
}

export function linkify(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  if (!body) return segments;

  // Adjacent text runs are merged so a body with no links yields exactly one
  // segment and the renderer emits a single text node, as it did before.
  const pushText = (value: string) => {
    if (!value) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.kind === 'text') prev.value += value;
    else segments.push({ kind: 'text', value });
  };

  let cursor = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(body)) !== null) {
    const raw = match[0];
    const tail = raw.match(TRAILING_PUNCT)?.[0] ?? '';
    const token = tail ? raw.slice(0, raw.length - tail.length) : raw;

    pushText(body.slice(cursor, match.index));
    cursor = match.index + raw.length;

    const segment = token ? toLinkSegment(token) : null;
    if (segment) segments.push(segment);
    else pushText(token);
    pushText(tail);
  }
  pushText(body.slice(cursor));

  return segments;
}
