/**
 * Counts on the Revenue Room, formatted so they read as quantities.
 *
 * Ali, 25 Nov 2026, looking at the campaign cards: "format the numbers with commas".
 *
 * `10343` reads as a part number. `10,343` reads as ten thousand. The page is scanned rather
 * than studied, and an unseparated five-figure number is the one most likely to be taken for a
 * smaller one at a glance.
 *
 * ── WHY A HELPER AND NOT toLocaleString AT EACH SITE ─────────────────────────────────────
 *
 * Two reasons it is worth a module. `toLocaleString()` with no locale follows the RUNTIME's
 * locale, so the same build renders `10,343` on one machine and `10.343` on another, and the
 * second is a different number to an American reader. Pinning `en-US` here means the page
 * cannot quietly change meaning with the viewer.
 *
 * And a count can be legitimately absent: `null` means nobody recorded this, which the Revenue
 * Room never renders as zero. The caller decides the words; this refuses to invent a digit.
 */
export function fmtCount(n: number | null | undefined): string | null {
  // ONE guard, not two. `Number.isFinite` is already false for null, undefined and NaN, so an
  // explicit null check in front of it was a branch no input could reach — which the mutation
  // check found by deleting it and watching every test still pass.
  if (!Number.isFinite(n as number)) return null;
  return Math.trunc(n as number).toLocaleString('en-US');
}

/**
 * The same, for a place that must always print something.
 *
 * Takes the words to use when the number is absent, so an unrecorded count still reads as an
 * absence rather than as a dash or a zero.
 */
export function fmtCountOr(n: number | null | undefined, absent: string): string {
  return fmtCount(n) ?? absent;
}
