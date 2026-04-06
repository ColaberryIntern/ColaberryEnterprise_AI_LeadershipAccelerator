/**
 * Reality Verifier
 * Verifies claims from validation report against actual system state (GitHub repo).
 */
import { ParsedValidation } from './validationParser';

export interface VerificationResult {
  verified: boolean;
  filesVerified: number;
  filesMissing: string[];
  routesVerified: number;
  routesMissing: string[];
  dbVerified: number;
  dbMissing: string[];
  discrepancies: string[];
  coverageScore: number; // 0-100
}

/**
 * Verify validation report claims against the GitHub file tree.
 */
export async function verifyAgainstRepo(
  enrollmentId: string, validation: ParsedValidation
): Promise<VerificationResult> {
  const result: VerificationResult = {
    verified: false, filesVerified: 0, filesMissing: [], routesVerified: 0,
    routesMissing: [], dbVerified: 0, dbMissing: [], discrepancies: [], coverageScore: 0,
  };

  try {
    // Get current file tree from GitHub
    const { getConnection } = await import('../../services/githubService');
    const conn = await getConnection(enrollmentId);
    const fileTree: string[] = [];
    if (conn?.file_tree_json?.tree) {
      for (const item of conn.file_tree_json.tree) {
        if (item.type === 'blob') fileTree.push(item.path);
      }
    }
    const fileSet = new Set(fileTree.map((f: string) => f.toLowerCase()));

    // Verify files created
    const allFiles = [...validation.filesCreated, ...validation.filesModified];
    for (const f of allFiles) {
      if (fileSet.has(f.toLowerCase()) || fileSet.has(`src/${f}`.toLowerCase()) || fileSet.has(`backend/${f}`.toLowerCase()) || fileSet.has(`frontend/${f}`.toLowerCase())) {
        result.filesVerified++;
      } else {
        result.filesMissing.push(f);
        result.discrepancies.push(`File not found in repo: ${f}`);
      }
    }

    // Verify routes — check if route files exist
    for (const route of validation.routes) {
      // Extract likely route file from route definition (e.g., "GET /api/admin/foo" → look for fooRoutes.ts)
      const parts = route.split('/').filter(Boolean);
      const routeName = parts[parts.length - 1];
      const hasRouteFile = fileTree.some((f: string) => f.toLowerCase().includes(routeName?.toLowerCase() || '') && f.includes('route'));
      if (hasRouteFile) result.routesVerified++;
      else { result.routesMissing.push(route); result.discrepancies.push(`Route may not be registered: ${route}`); }
    }

    // Verify database — check if model files exist
    for (const table of validation.database) {
      const hasModel = fileTree.some((f: string) => {
        const name = f.split('/').pop()?.replace('.ts', '') || '';
        return name.toLowerCase() === table.toLowerCase() && f.includes('models/');
      });
      if (hasModel) result.dbVerified++;
      else { result.dbMissing.push(table); result.discrepancies.push(`Model not found: ${table}`); }
    }

    // Calculate coverage
    const totalClaims = allFiles.length + validation.routes.length + validation.database.length;
    const totalVerified = result.filesVerified + result.routesVerified + result.dbVerified;
    result.coverageScore = totalClaims > 0 ? Math.round((totalVerified / totalClaims) * 100) : 0;
    result.verified = result.discrepancies.length === 0 && validation.status === 'COMPLETE';

  } catch (err: any) {
    result.discrepancies.push(`Verification error: ${err.message}`);
  }

  return result;
}
