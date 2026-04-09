/**
 * Contract Validator — cross-references claimed implementation against actual state.
 * Catches when Claude Code claims to have created routes/files that don't exist.
 */

export interface ContractViolation {
  type: 'missing_file' | 'missing_route' | 'wrong_status';
  claimed: string;
  actual: string;
  severity: 'critical' | 'warning';
  message: string;
}

export interface ValidationClaims {
  filesCreated: string[];
  filesModified: string[];
  routes: string[];
  database: string[];
  status: string;
}

/**
 * Validate that claimed files exist in the repo file tree.
 * Uses fuzzy matching — checks if any file in the tree ends with the claimed filename.
 */
export function validateContracts(
  claims: ValidationClaims,
  repoFileTree: string[]
): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const treeSet = new Set(repoFileTree.map(f => f.toLowerCase()));

  // Check claimed files exist
  for (const claimed of [...claims.filesCreated, ...claims.filesModified]) {
    const claimedLower = claimed.toLowerCase();
    const claimedName = (claimed.split('/').pop() || '').toLowerCase();

    // Exact path match or filename match anywhere in tree
    const found = treeSet.has(claimedLower) ||
      repoFileTree.some(f => f.toLowerCase().endsWith(claimedName));

    if (!found) {
      violations.push({
        type: 'missing_file',
        claimed,
        actual: 'not found in repo',
        severity: 'critical',
        message: `Claimed file "${claimed}" does not exist in the repository`,
      });
    }
  }

  // Check status claim
  if (claims.status === 'COMPLETE' && violations.length > 0) {
    violations.push({
      type: 'wrong_status',
      claimed: 'COMPLETE',
      actual: `${violations.length} missing files`,
      severity: 'warning',
      message: `Status claimed COMPLETE but ${violations.length} files are missing`,
    });
  }

  return violations;
}
