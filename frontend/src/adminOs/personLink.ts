/**
 * One place that decides where a person's name links to.
 *
 * Ali, 2026-09-09: "Everytime we are on the admin side of the app and you see a
 * lead/student/person's name, then clicking on them should take you to the 360
 * dashboard which shows everything."
 *
 * ── WHY A HELPER RATHER THAN A HARD-CODED PATH AT EACH SITE ─────────────────
 *
 * There were fourteen places building `/admin/leads/${id}` by hand. Changing
 * them to `/admin/people/...` by hand would leave the next one to drift, and the
 * surfaces do not all hold the same identifier: most carry a lead id, a few an
 * email, cohort and attendance views only an enrolment id. This function is the
 * single answer to "given what this row knows, where does the name go?".
 *
 * ── REF SHAPES ──────────────────────────────────────────────────────────────
 *
 * Email is preferred because it is the key the profile is actually built on and
 * needs no server round-trip to resolve. The `lead:` and `enrollment:` forms are
 * resolved by the API (backend/src/services/adminOs/personRef.ts).
 *
 * Returns null when a row carries no usable identifier, so a caller can render
 * plain text rather than a link that would 404.
 */

export interface PersonRef {
  email?: string | null;
  leadId?: number | string | null;
  enrollmentId?: string | null;
}

/** The 360 URL for whatever this row knows, or null when it knows nothing usable. */
export function personPath(ref: PersonRef): string | null {
  const email = typeof ref.email === 'string' ? ref.email.trim() : '';
  // A usable address, not merely a non-empty string. Rows carry '' and 'null'.
  if (email && email.includes('@') && !email.startsWith('@')) {
    return `/admin/people/${encodeURIComponent(email.toLowerCase())}`;
  }

  if (ref.leadId !== null && ref.leadId !== undefined && String(ref.leadId).trim() !== '') {
    const id = String(ref.leadId).trim();
    if (/^\d+$/.test(id)) return `/admin/people/${encodeURIComponent(`lead:${id}`)}`;
  }

  const enrollmentId = typeof ref.enrollmentId === 'string' ? ref.enrollmentId.trim() : '';
  if (/^[0-9a-fA-F-]{36}$/.test(enrollmentId)) {
    return `/admin/people/${encodeURIComponent(`enrollment:${enrollmentId}`)}`;
  }

  return null;
}

/**
 * What the profile page should send to the API for a `:ref` route param.
 *
 * The route carries one segment for every shape, so the page does not need to
 * know which kind it holds — the server parses it. This exists so the page and
 * the links cannot disagree about the encoding.
 */
export function refForApi(routeParam: string | undefined): string {
  if (!routeParam) return '';
  try {
    return decodeURIComponent(routeParam);
  } catch {
    // A malformed escape sequence. Pass it through rather than throwing inside
    // a render — the API will reject it and the page shows "not found".
    return routeParam;
  }
}
