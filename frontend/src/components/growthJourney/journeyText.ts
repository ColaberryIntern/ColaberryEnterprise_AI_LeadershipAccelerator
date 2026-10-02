/**
 * Address masking for anything a Growth Journey admin read echoes to the screen.
 *
 * ── A VERBATIM EXTRACTION, NOT A REWRITE ────────────────────────────────────
 *
 * `ADDRESS` and `safeText` were written in `pages/admin/HandoffDetailPage.tsx`
 * (T613) and are moved here character for character, because T614's tabs are the
 * third, fourth and fifth call sites: `/classifications` echoes `evidence`,
 * `eligibility`, `intent` and a `decided_by` that the controller may populate from
 * `req.admin.email`; `/decisions` echoes `reason`; and the why modal echoes most of
 * its payload opaquely. Three places is this repo's threshold for lifting shared
 * logic, and a mask copy-pasted five times is a mask that gets fixed in four.
 *
 * `journeyText.test.ts` characterises the behaviour this file was extracted WITH,
 * including every shape it fails to catch, so the move can be shown to have changed
 * nothing and a later edit has to break a named test rather than slip through.
 *
 * ── WHAT THE MASK DOES NOT CATCH ────────────────────────────────────────────
 *
 * Stated here because the captions on the handoff page used to claim more than this
 * delivers. `\S+@\S+` needs non-space on both sides of an ASCII `@`, so it misses
 * `@handle` (no local part), `lead @example.com` (a space inside), `lead@` (no
 * domain) and `lead＠example.com` (U+FF20, a full-width at-sign).
 *
 * This is a LAST line of defence for a screen, not a privacy boundary. The boundary
 * is the API: `services/growthJourney/noAddress.ts` refuses any packet VALUE
 * containing `@` on the write path, and `safeField` masks `reason`,
 * `requested_by` and `approved_by` on `/decisions/transitions` and `/content/rules`
 * before they are serialised. The reads that mask nothing are the ones these
 * helpers exist for, and `responsePrivacy.phase6.test.ts` names them.
 */

/**
 * Any `local@domain`-looking run, masked. Deliberately greedy about what counts.
 *
 * Exported so a test can assert the pattern itself rather than only its effect,
 * and so a caller that needs to DETECT rather than mask does not write a second one.
 */
export const ADDRESS = /\S+@\S+/g;

/** A value as text, with addresses masked whatever shape they arrive in. */
export function safeText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return raw.replace(ADDRESS, '[redacted]');
}

/**
 * A DECIMAL column as it actually arrives, which is a string.
 *
 * `GrowthJourneyClassification.confidence` is `DECIMAL(4,3)`, and pg hands a DECIMAL
 * back as `"0.820"` rather than `0.82`. The `/classifications/:id/why` route coerces
 * it (`classificationWhyService.ts`); the LIST route does not. So a tab that called
 * `.toFixed()` on it would throw, and one that rendered it raw would show a
 * different number of digits than the detail view for the same row.
 */
export function decimalText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value);
}
