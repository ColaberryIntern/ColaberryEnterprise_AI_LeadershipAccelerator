/**
 * contentPolicy - what a demo spec is allowed to CONTAIN, enforced where it is WRITTEN.
 *
 * ## Why this exists at the write boundary and not only at the response
 *
 * The public demo route (`demoRoutes.ts`) builds its response from a named-field allow-list, and
 * a sentinel test proves no non-allowlisted `projects` column reaches the served bytes. But
 * `demo_spec` must itself be ON that allow-list for the feature to work at all: it is the thing
 * being rendered. So `demo_spec` is precisely the one field a response-side sentinel is blind to,
 * and a response-side control cannot be the only control.
 *
 * This is the repo's own rule, not a new one. `careerPortfolioPublicProjection` /
 * `caseStudyProjectSource.ts:29-31`:
 *
 *   "DATA_SOURCE_MAP section 4 names raw untyped JSONB blobs as the exact exposure the existing
 *    public portfolio route already has and this feature must not repeat; a column never loaded
 *    cannot leak."
 *
 * and on one specific column (:35-38):
 *
 *   "`organization_name` ... free text a student typed at intake, carrying no consent and no
 *    provenance - a candidate for review, never a publishable value."
 *
 * ## What this can and cannot do
 *
 * It catches a restricted value COPIED into a spec, at any depth, and it catches a field name
 * that is not on the allow-list. It CANNOT catch prose derived from a restricted value: a
 * narrative field that paraphrases the client's business problem passes both checks. That
 * residual is why publication is a deliberate human act behind an authenticated control rather
 * than an automatic consequence of generation. Stated here so nobody reads this module as a
 * guarantee it does not provide.
 */

/**
 * Columns on `projects` whose contents must never be copied into a demo spec.
 *
 * Free text typed by a student or a client, or machine state that describes the real engagement
 * rather than the fictional scenario. The demo is meant to be a plausible illustration, not a
 * republication of the brief.
 */
export const RESTRICTED_PROJECT_FIELDS = [
  'organization_name',
  'primary_business_problem',
  'requirements_document',
  'claude_md_content',
  'project_variables',
  'data_sources',
  'executive_summary',
  'automation_goal',
  'portfolio_cache',
  'readiness_score_breakdown',
  'share_token',
  'demo_share_token',
  'external_owner',
  'approval_notes',
] as const;

/**
 * Top-level keys a spec may carry. Anything else is refused, so the policy FAILS CLOSED as the
 * spec format grows: a new key has to be added here deliberately rather than inherited silently.
 */
export const ALLOWED_SPEC_KEYS = [
  'schema_version',
  'environment',
  'app',
  'events',
  'screens',
  'entities',
  'nav',
  'agents',
  'people',
  'guardrails',
  'systems',
  'coverage',
  'source',
] as const;

export interface ContentProblem {
  path: string;
  message: string;
}

/** Walk every string in a nested structure, reporting its JSON path. */
function walkStrings(
  node: unknown,
  path: string,
  visit: (value: string, at: string) => void,
): void {
  if (typeof node === 'string') {
    visit(node, path);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkStrings(child, `${path}[${i}]`, visit));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walkStrings(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

/**
 * Check a candidate spec's CONTENT against the policy.
 *
 * `restrictedValues` is the map of restricted column name -> that project's actual value, so the
 * check is against what THIS project would leak rather than against a generic pattern. A value
 * shorter than 4 characters is skipped: matching on "AI" or "ops" would refuse every legitimate
 * spec and teach people to bypass the policy, which is worse than the leak it prevents.
 */
export function checkDemoSpecContent(
  candidate: unknown,
  restrictedValues: Partial<Record<string, string | null | undefined>> = {},
): ContentProblem[] {
  const problems: ContentProblem[] = [];

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return [{ path: '(root)', message: 'spec must be an object' }];
  }

  // 1. Fail closed on unknown top-level keys.
  for (const key of Object.keys(candidate as Record<string, unknown>)) {
    if (!(ALLOWED_SPEC_KEYS as readonly string[]).includes(key)) {
      problems.push({
        path: key,
        message: `key "${key}" is not on ALLOWED_SPEC_KEYS; add it deliberately or remove it`,
      });
    }
  }

  // 2. No restricted project value may appear anywhere, at any depth.
  const needles = Object.entries(restrictedValues)
    .filter(([name]) => (RESTRICTED_PROJECT_FIELDS as readonly string[]).includes(name))
    .map(([name, value]) => ({ name, value: String(value ?? '').trim() }))
    .filter((n) => n.value.length >= 4);

  if (needles.length) {
    walkStrings(candidate, '', (value, at) => {
      const hay = value.toLowerCase();
      for (const n of needles) {
        if (hay.includes(n.value.toLowerCase())) {
          problems.push({
            path: at || '(root)',
            message: `contains the project's ${n.name}, which is not publishable`,
          });
        }
      }
    });
  }

  return problems;
}

/** True only when the spec's content is publishable under this policy. */
export function isDemoSpecContentClean(
  candidate: unknown,
  restrictedValues: Partial<Record<string, string | null | undefined>> = {},
): boolean {
  return checkDemoSpecContent(candidate, restrictedValues).length === 0;
}
