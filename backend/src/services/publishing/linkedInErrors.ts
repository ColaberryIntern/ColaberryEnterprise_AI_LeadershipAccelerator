/**
 * How a LinkedIn HTTP status becomes a retry decision. Shared by the post call and the image
 * upload steps so the two cannot drift: a 429 on `initializeUpload` must back off exactly as
 * a 429 on `/rest/posts` does, or one path burns attempts the other would have saved.
 */

/**
 * Which HTTP statuses must never be retried.
 *
 * Getting this wrong is expensive in both directions: retrying a 422 burns every attempt and
 * dead-letters anyway, while NOT retrying a 503 silently loses a scheduled post. 429 is
 * transient on purpose - it means slow down, not stop.
 */
export function isPermanentStatus(status: number): boolean {
  if (status === 429) return false;              // rate limited: back off and retry
  if (status === 426) return true;               // sunset API version: needs a code change
  return status >= 400 && status < 500;          // auth, permission, validation
}

export function providerCodeOf(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const key of ['code', 'serviceErrorCode', 'status']) {
      if (typeof b[key] === 'string') return b[key] as string;
      if (typeof b[key] === 'number') return String(b[key]);
    }
  }
  return null;
}

export function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const m = (body as Record<string, unknown>).message;
    if (typeof m === 'string' && m.trim() !== '') return m;
  }
  return fallback;
}

export function headerValue(headers: Record<string, string>, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}
