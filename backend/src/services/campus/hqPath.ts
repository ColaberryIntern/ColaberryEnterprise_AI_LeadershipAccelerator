/**
 * Campus HQ: the one format an employee's HQ page may take, a SIDEBAR path (see hqPresence.ts). Letters and hyphens only, so
 * a detail route (a numeric or UUID id carries digits) can never be stored or served. A test reads frontend adminNav.ts and
 * proves every internal sidebar path passes, so a nav path with a digit would fail the build first.
 *
 * Its own module, with no imports, so the campus routes can validate their response without loading the presence writers.
 */
export const HQ_PATH = /^\/admin(?:\/[a-z][a-z-]*){1,3}$/;
