// Shared helpers for the community-rooms services: structured logging (matches
// the Observability Framework line shape) and typed error factories carrying a
// stable error_class + HTTP status so controllers can map them uniformly.

export function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown> = {}): void {
  console[level](
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'community-rooms', event, ...ctx }),
  );
}

export interface TaggedError extends Error {
  error_class: string;
  status: number;
}

function tagged(message: string, error_class: string, status: number): TaggedError {
  return Object.assign(new Error(message), { error_class, status }) as TaggedError;
}

export const validationError = (m: string): TaggedError => tagged(m, 'ValidationError', 400);
export const notFoundError = (m: string): TaggedError => tagged(m, 'NotFoundError', 404);
export const forbiddenError = (m: string): TaggedError => tagged(m, 'ForbiddenError', 403);
export const conflictError = (m: string): TaggedError => tagged(m, 'ConflictError', 409);

export function slugify(input: string, suffix?: string): string {
  const base =
    (input || 'room')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'room';
  return suffix ? `${base}-${suffix}` : base;
}

// Short, collision-resistant token for member-created room slugs. Runtime-only
// (not a workflow script), so Date.now/Math.random are fine here.
export function shortToken(): string {
  return Date.now().toString(36).slice(-4) + Math.floor(Math.random() * 1_679_616).toString(36).padStart(4, '0');
}

// A source field can be longer than the capped VARCHAR column it's being
// mapped into (e.g. LiveSession.description is TEXT, unbounded, but
// CommunityRoom.topic is VARCHAR(255)) — truncate rather than let the insert
// fail. Found live in production: 25 of 30 real sessions had a description
// over 255 chars, so ensureRoomForSession had silently never succeeded for them.
export function truncated(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
