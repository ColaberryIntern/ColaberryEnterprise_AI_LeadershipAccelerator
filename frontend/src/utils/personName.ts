/**
 * How a person's name is shown (Campus round 3, C13: the greeting read "Welcome, ALI.").
 *
 * Names arrive exactly as they were stored: some all upper case ("ALI MUWWAKKIL"), some all lower ("jane doe"), most mixed. A name
 * stored ALL upper or ALL lower is title-cased, word by word, keeping the parts joined by a hyphen or an apostrophe ("MARY-JANE
 * O'BRIEN" -> "Mary-Jane O'Brien"). A name in MIXED case is left exactly as the person typed it ("DeShawn McDonald", "da Silva"),
 * because only they know its capitals. utils/titleCase.ts is not used here: it keeps all-caps words verbatim (acronyms), which is
 * right for course titles and wrong for people.
 */
const capWord = (w: string): string => w.split(/([-'’])/).map((p) => (/^[-'’]$/.test(p) || !p ? p : p[0].toUpperCase() + p.slice(1).toLowerCase())).join('');

export function displayName(raw: string | null | undefined): string {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return '';
  const letters = name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  const oneCase = letters === letters.toUpperCase() || letters === letters.toLowerCase();
  return oneCase ? name.split(' ').map(capWord).join(' ') : name;
}

/** The first name to greet someone by ("Welcome, Ali."), cased as above; '' when there is no name. */
export function displayFirstName(raw: string | null | undefined): string {
  return displayName(raw).split(' ')[0] ?? '';
}

/** Initials: first and last word, upper case; '?' when there is no name. */
export function nameInitials(raw: string | null | undefined): string {
  const parts = displayName(raw).split(' ').filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}
