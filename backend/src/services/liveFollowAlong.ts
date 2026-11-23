/**
 * liveFollowAlong.ts — the "follow along" card a live deck pushes to every
 * attendee's phone or computer, one per slide.
 *
 * WHY. Until 2026-11-23 a phone only changed when the instructor reached a
 * poll or a prompt; on every other slide it showed a status grid. Ali asked for
 * a class a beginner can follow without seeing the projector: each slide says,
 * in plain words, what is happening now and what to do. The deck already
 * broadcasts its position on every advance, so the card rides on that same
 * write (BroadcastState.follow) and on both reads (signed-in companion state
 * and the guest pass).
 *
 * TRUST BOUNDARY. The broadcast endpoint is kit-token gated, but the card is
 * rendered on attendee screens, so it is treated as untrusted text: every
 * field is coerced to a string, trimmed and capped, lists are capped, and
 * nothing here is ever rendered as HTML (the frontend prints text nodes).
 * A malformed card is dropped (null), never a 400: a bad card must not stop
 * the instructor's slide from advancing.
 */

export interface FollowAlong {
  /** Short position label, e.g. "Hands-on 2 of 5". */
  step?: string;
  /** One emoji or symbol shown large beside the heading. */
  icon?: string;
  heading: string;
  body?: string;
  bullets?: string[];
  /** Open the "Get Claude" install helper by default on this slide. */
  install?: boolean;
}

export const FOLLOW_LIMITS = { step: 40, icon: 8, heading: 140, body: 600, bullet: 220, bullets: 6 } as const;

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Coerce an untrusted card into a safe FollowAlong, or null when it has no heading. */
export function sanitizeFollowAlong(raw: unknown): FollowAlong | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const heading = clip(r.heading, FOLLOW_LIMITS.heading);
  if (!heading) return null;
  const card: FollowAlong = { heading };
  const step = clip(r.step, FOLLOW_LIMITS.step);
  if (step) card.step = step;
  const icon = clip(r.icon, FOLLOW_LIMITS.icon);
  if (icon) card.icon = icon;
  const body = clip(r.body, FOLLOW_LIMITS.body);
  if (body) card.body = body;
  if (Array.isArray(r.bullets)) {
    const bullets = r.bullets.map((b) => clip(b, FOLLOW_LIMITS.bullet)).filter(Boolean).slice(0, FOLLOW_LIMITS.bullets);
    if (bullets.length) card.bullets = bullets;
  }
  if (r.install === true) card.install = true;
  return card;
}
