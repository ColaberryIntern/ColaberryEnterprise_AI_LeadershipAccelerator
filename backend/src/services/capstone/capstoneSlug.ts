/**
 * capstoneSlug — the public URL segment for a student's Capstone Record.
 *
 * PURE. The slug is the address a student puts in front of a hiring manager, so
 * three properties matter more than prettiness:
 *
 *   STABLE   — once published it must never change. A renamed project must not
 *              silently break a link already sitting in someone's inbox, which
 *              is why nothing here recomputes a slug that already exists.
 *   UNIQUE   — enforced at the database too (`uq_capstone_records_slug`), but
 *              collisions are resolved here so the common case never round-trips
 *              through a constraint violation.
 *   SAFE     — it comes from a student's own name and project title, which are
 *              free text. Anything not [a-z0-9-] is collapsed, so the segment
 *              cannot carry a path, a query, or an encoded surprise.
 */

/** Longest we will emit before the disambiguating suffix. Keeps URLs readable. */
const MAX_BASE = 60;

export function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    // Strip accents rather than dropping the letter: "Muwwakkil" and "Okoye"
    // survive intact, and a name with diacritics does not become a shorter,
    // stranger word.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE)
    .replace(/-+$/g, '');
}

/**
 * Build the candidate slug from a name and a project.
 *
 * Both are optional because both genuinely can be missing — a student who never
 * named their project still needs an address. Falls back through name, then
 * project, then a neutral constant, so this never returns an empty string.
 */
export function buildCapstoneSlug(fullName?: string | null, projectName?: string | null): string {
  const name = slugify(fullName ?? '');
  const project = slugify(projectName ?? '');
  const joined = [name, project].filter(Boolean).join('-').slice(0, MAX_BASE).replace(/-+$/g, '');
  return joined || 'capstone';
}

/**
 * Resolve a candidate against slugs already taken.
 *
 * Appends `-2`, `-3`, … rather than a random suffix: a person reading the URL
 * can still tell whose it is, and the sequence is reproducible in a test. The
 * candidate itself is returned untouched when free, so the overwhelmingly common
 * case produces the clean form.
 */
export function resolveUniqueSlug(candidate: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(candidate)) return candidate;
  for (let n = 2; n < 1000; n++) {
    const next = `${candidate}-${n}`;
    if (!used.has(next)) return next;
  }
  // A thousand students sharing one name and project is not a real scenario, but
  // returning something colliding would be worse than an obviously odd slug.
  return `${candidate}-${Date.now().toString(36)}`;
}
