/**
 * executionPolicy — the default-deny list for delivery execution. PURE, no I/O.
 *
 * Master plan §Gate 8 lists eight things an execution run may never do. Gate 0's
 * EXECUTION_CAPABILITY_MAP found that **three of the eight were unenforceable** while
 * execution shared the backend container, because the process holding the Docker socket
 * also served public HTTP. ESC-4 resolved that: execution runs in a **GitHub Actions
 * runner**, off the VPS entirely, with a per-job token and GitHub's network policy.
 *
 * That decision is what makes this module meaningful rather than aspirational. The
 * capability boundary is now the runner's, and this module is the second layer: it
 * refuses to *construct* a run whose declared capabilities cross the line, so a
 * misconfiguration fails at plan time rather than at execution time.
 *
 * TWO LAYERS, NOT ONE. This module cannot stop a compromised runner — nothing in the
 * backend can. What it stops is the ordinary path: a story, an agent definition, or an
 * operator asking for a capability the plan forbids. Defence in depth means the runner
 * is the boundary and this is the gate; neither is sufficient alone, and saying so is
 * part of the control.
 */

/** The eight default-deny capabilities from master plan §Gate 8. */
export type DeniedCapability =
  | 'production_deploy'
  | 'production_database'
  | 'dns'
  | 'live_email'
  | 'cloud_resource_deletion'
  | 'push_to_protected_main'
  | 'unbounded_network'
  | 'secret_exfiltration';

export const DENIED_CAPABILITIES: readonly DeniedCapability[] = [
  'production_deploy',
  'production_database',
  'dns',
  'live_email',
  'cloud_resource_deletion',
  'push_to_protected_main',
  'unbounded_network',
  'secret_exfiltration',
];

/**
 * Why each is denied, and — per Gate 0 — which layer actually enforces it.
 *
 * `enforcedBy` is recorded because "we have a policy" and "the policy is enforced" are
 * different claims, and Gate 0 found three of these previously had no enforcer at all.
 */
export const DENIAL_RATIONALE: Record<
  DeniedCapability,
  { why: string; enforcedBy: 'runner_isolation' | 'no_provider' | 'branch_protection' | 'policy_gate' }
> = {
  production_deploy: {
    why: 'Master plan §20 does not authorize production deployment. No DeploymentProvider is implemented.',
    enforcedBy: 'no_provider',
  },
  production_database: {
    why: 'A run must never reach production data. The runner holds no production credentials.',
    enforcedBy: 'runner_isolation',
  },
  dns: { why: 'DNS changes are irreversible and outside delivery scope.', enforcedBy: 'runner_isolation' },
  live_email: {
    why: 'A run must not send mail as Colaberry or as a client. The runner holds no Mandrill key.',
    enforcedBy: 'runner_isolation',
  },
  cloud_resource_deletion: {
    why: 'Destructive and irreversible. The runner has no cloud credentials to delete with.',
    enforcedBy: 'runner_isolation',
  },
  push_to_protected_main: {
    why: 'Work lands via pull request. Branch protection on main rejects a direct push.',
    enforcedBy: 'branch_protection',
  },
  unbounded_network: {
    why: 'Untrusted repository content plus unbounded egress is an exfiltration path.',
    enforcedBy: 'runner_isolation',
  },
  secret_exfiltration: {
    why: 'Secrets must not leave the run. secret-scan.yml gates the commit path; the prompt envelope redacts.',
    enforcedBy: 'policy_gate',
  },
};

export interface ExecutionCapabilityRequest {
  /** Capabilities the run declares it needs. Anything on the denied list is refused. */
  requested: string[];
  /** Network hosts the run declares it will reach. Empty = no egress beyond the runner's default. */
  networkAllowlist?: string[];
  /** Branch the run will push to. */
  targetBranch?: string | null;
  /** True when the caller asserts the workspace is an isolated runner rather than the backend. */
  isolatedRunner: boolean;
}

export interface PolicyViolation {
  capability: string;
  rule: string;
  detail: string;
}

/** The branch that must never receive a direct push. */
export const PROTECTED_BRANCH = 'main';

export function isDeniedCapability(capability: string): capability is DeniedCapability {
  return (DENIED_CAPABILITIES as readonly string[]).includes(capability);
}

/**
 * Evaluate a run's declared capabilities against the default-deny list.
 *
 * Returns every violation rather than the first — an operator fixing a run configuration
 * should see the whole list, not discover them one deploy at a time.
 */
export function evaluateExecutionPolicy(
  request: ExecutionCapabilityRequest,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const add = (capability: string, rule: string, detail: string) =>
    violations.push({ capability, rule, detail });

  for (const capability of request.requested ?? []) {
    if (isDeniedCapability(capability)) {
      add(capability, 'denied_capability', DENIAL_RATIONALE[capability].why);
    }
  }

  // The ESC-4 invariant. A run that is not on an isolated runner is refused outright,
  // because the S-01 finding is precisely that the non-isolated path cannot enforce
  // three of the eight rules no matter what this function returns.
  if (!request.isolatedRunner) {
    add(
      'unbounded_network',
      'execution_not_isolated',
      'Execution must run in an isolated runner (ESC-4). Three default-deny rules are ' +
        'unenforceable when execution shares the internet-facing backend container (S-01).',
    );
  }

  if (request.targetBranch === PROTECTED_BRANCH) {
    add(
      'push_to_protected_main',
      'direct_push_to_protected_branch',
      `Work lands via pull request; '${PROTECTED_BRANCH}' is protected.`,
    );
  }

  // An empty allowlist means "the runner's default", which is bounded. A wildcard is
  // the thing that is not.
  const wildcards = (request.networkAllowlist ?? []).filter((h) => h === '*' || h === '0.0.0.0/0');
  if (wildcards.length > 0) {
    add(
      'unbounded_network',
      'wildcard_network_allowlist',
      `Wildcard egress (${wildcards.join(', ')}) is never permitted.`,
    );
  }

  return violations;
}

export interface PolicyDecision {
  allowed: boolean;
  violations: PolicyViolation[];
}

/** Fail-closed wrapper: any violation refuses the run. */
export function decideExecutionPolicy(
  request: ExecutionCapabilityRequest,
): PolicyDecision {
  const violations = evaluateExecutionPolicy(request);
  return { allowed: violations.length === 0, violations };
}
