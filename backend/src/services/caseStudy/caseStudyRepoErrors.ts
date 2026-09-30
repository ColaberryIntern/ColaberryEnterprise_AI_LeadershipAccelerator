/**
 * caseStudyRepoErrors — the error vocabulary of a Case Study's repo collection.
 *
 * Extracted from `caseStudyRepoCollection.ts` under the root CLAUDE.md rule that
 * the change which would cross the 500-line ceiling splits the file first. The
 * cut follows the convention already set by `sbp/repoConnect/connectErrors.ts`:
 * an error taxonomy is its own module, so that a route can import the classes it
 * must map to HTTP without importing the transactions, the model or the parser.
 *
 * WHY EACH CLASS CARRIES ITS OWN STATUS. The root CLAUDE.md observability rule is
 * that a generic `Error` is not an acceptable classification in a production path.
 * Pairing the class with a status here — rather than at each route — is what makes
 * `RepoCollectionFull` a 409 everywhere it is thrown, including from a caller
 * written after this file.
 */

export type CaseStudyRepoErrorClass =
  /** The pasted text is not a GitHub repo reference. Re-raised from the parser. */
  | 'InvalidRepoReference'
  /** The call itself was malformed — bad uuid, unknown role, missing field. */
  | 'CaseStudyRepoValidationError'
  /** The collection already holds `MAX_REPOS_PER_CASE_STUDY` repositories. */
  | 'RepoCollectionFull'
  /** No such repository in THIS Case Study's collection. */
  | 'CaseStudyRepoNotFound';

const HTTP_STATUS: Record<CaseStudyRepoErrorClass, number> = {
  InvalidRepoReference: 400, CaseStudyRepoValidationError: 400,
  RepoCollectionFull: 409, CaseStudyRepoNotFound: 404,
};

export class CaseStudyRepoError extends Error {
  public readonly error_class: CaseStudyRepoErrorClass;
  public readonly http_status: number;
  public readonly details: Record<string, unknown>;

  constructor(error_class: CaseStudyRepoErrorClass, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CaseStudyRepoError';
    this.error_class = error_class;
    this.http_status = HTTP_STATUS[error_class];
    this.details = details;
  }
}

export function isCaseStudyRepoError(err: unknown): err is CaseStudyRepoError {
  return err instanceof CaseStudyRepoError;
}
