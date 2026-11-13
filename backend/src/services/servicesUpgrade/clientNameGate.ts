/**
 * SV0.2 - the client-name gate. Colaberry's whitepapers describe clients anonymously ("a major utility company").
 * The Services catalog, the Gov AI prompt and every proposal must stay that way unless Ali records written consent.
 *
 * This module deliberately commits NO client names and NO hashes of them (a hash of a short company name is
 * reversible by guessing). The names are read at runtime from CLIENT_NAMES_FILE, an untracked file outside the repo,
 * one name per line. Without that file the extractor refuses to run, so the gate can never be silently skipped.
 */
import fs from 'fs';

export class ClientNameGateError extends Error {}

export function loadClientNames(file: string | undefined): string[] {
  if (!file) throw new ClientNameGateError('CLIENT_NAMES_FILE is required (untracked list of confidential client names)');
  if (!fs.existsSync(file)) throw new ClientNameGateError(`CLIENT_NAMES_FILE not found: ${file}`);
  const names = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  if (names.length === 0) throw new ClientNameGateError('CLIENT_NAMES_FILE is empty');
  return names;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive whole-word hits. Returns the matched names (never the surrounding text, so a report stays safe). */
export function findClientNameHits(text: string, names: string[]): string[] {
  const hits: string[] = [];
  for (const n of names) {
    const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(n)}([^A-Za-z0-9]|$)`, 'i');
    if (re.test(text) && !hits.includes(n)) hits.push(n);
  }
  return hits;
}

/** Hard gate for anything that will be committed: throws on any hit, naming the field (not the client). */
export function assertNoClientNames(fields: Record<string, string>, names: string[]): void {
  for (const [field, value] of Object.entries(fields)) {
    if (findClientNameHits(value, names).length > 0) throw new ClientNameGateError(`confidential client name found in field "${field}"`);
  }
}
