/**
 * Project Reconciliation Engine
 *
 * Compares database state with CLAUDE.md and PROJECT_STATE.json in the
 * participant's GitHub repo to detect drift and trigger auto-sync.
 */
import { getProjectByEnrollment } from './projectService';
import { getConnection, readFileFromRepo } from './githubService';
import { generateClaudeMd, generateProjectState, pushClaudeMdToRepo } from './claudeMdService';
import { getRequirementsStatus } from './requirementsMatchingService';

export interface ReconciliationReport {
  claudeMdStatus: 'current' | 'stale' | 'missing';
  projectStateStatus: 'current' | 'stale' | 'missing';
  requirementsDrift: Array<{ key: string; dbStatus: string; repoStatus: string }>;
  lastSyncAt: string | null;
  recommendedAction: 'sync' | 'none';
  details: string;
}

// Debounce: don't sync more than once per 5 minutes
const lastSyncTimes = new Map<string, number>();
const SYNC_DEBOUNCE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// 1. Reconcile — compare DB state with repo files
// ---------------------------------------------------------------------------

export async function reconcile(enrollmentId: string): Promise<ReconciliationReport> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const connection = await getConnection(enrollmentId);
  const report: ReconciliationReport = {
    claudeMdStatus: 'missing',
    projectStateStatus: 'missing',
    requirementsDrift: [],
    lastSyncAt: connection?.last_sync_at?.toISOString() || null,
    recommendedAction: 'none',
    details: '',
  };

  if (!connection) {
    report.details = 'No GitHub repository connected';
    report.recommendedAction = 'none';
    return report;
  }

  // Check CLAUDE.md existence and staleness
  const repoClaude = await readFileFromRepo(enrollmentId, 'CLAUDE.md');
  if (!repoClaude) {
    report.claudeMdStatus = 'missing';
    report.recommendedAction = 'sync';
  } else {
    // Check if auto-generated timestamp is recent (within 1 hour)
    const timestampMatch = repoClaude.match(/Last updated: (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    if (timestampMatch) {
      const lastUpdate = new Date(timestampMatch[1]).getTime();
      const ageMs = Date.now() - lastUpdate;
      report.claudeMdStatus = ageMs < 60 * 60 * 1000 ? 'current' : 'stale';
    } else {
      report.claudeMdStatus = 'stale'; // no timestamp = manually created or very old
    }
  }

  // Check PROJECT_STATE.json
  const repoState = await readFileFromRepo(enrollmentId, 'PROJECT_STATE.json');
  if (!repoState) {
    report.projectStateStatus = 'missing';
    report.recommendedAction = 'sync';
  } else {
    try {
      const parsed = JSON.parse(repoState);
      const lastActivity = new Date(parsed.last_activity).getTime();
      const ageMs = Date.now() - lastActivity;
      report.projectStateStatus = ageMs < 60 * 60 * 1000 ? 'current' : 'stale';
    } catch {
      report.projectStateStatus = 'stale';
    }
  }

  // Check requirements drift (DB vs repo checklist in CLAUDE.md)
  if (repoClaude) {
    try {
      const reqStatus = await getRequirementsStatus(project.id);
      for (const req of (reqStatus.requirements || [])) {
        // Look for the requirement in CLAUDE.md
        const reqLine = repoClaude.match(new RegExp(`\\[([x ~])\\].*${escapeRegex(req.requirement_key)}`));
        if (reqLine) {
          const repoStatus = reqLine[1] === 'x' ? 'matched' : reqLine[1] === '~' ? 'partial' : 'unmatched';
          if (repoStatus !== req.status && req.status !== 'verified') {
            report.requirementsDrift.push({
              key: req.requirement_key,
              dbStatus: req.status,
              repoStatus,
            });
          }
        }
      }
    } catch {}
  }

  // Determine recommendation
  if (report.claudeMdStatus !== 'current' || report.projectStateStatus !== 'current' || report.requirementsDrift.length > 0) {
    report.recommendedAction = 'sync';
    const reasons = [];
    if (report.claudeMdStatus === 'missing') reasons.push('CLAUDE.md missing from repo');
    if (report.claudeMdStatus === 'stale') reasons.push('CLAUDE.md is stale');
    if (report.projectStateStatus === 'missing') reasons.push('PROJECT_STATE.json missing');
    if (report.projectStateStatus === 'stale') reasons.push('PROJECT_STATE.json is stale');
    if (report.requirementsDrift.length > 0) reasons.push(`${report.requirementsDrift.length} requirement(s) drifted`);
    report.details = reasons.join('; ');
  } else {
    report.details = 'All files current and in sync';
  }

  return report;
}

// ---------------------------------------------------------------------------
// 2. Auto-sync — push updated files if debounce allows
// ---------------------------------------------------------------------------

export async function autoSync(enrollmentId: string): Promise<boolean> {
  const lastSync = lastSyncTimes.get(enrollmentId) || 0;
  if (Date.now() - lastSync < SYNC_DEBOUNCE_MS) {
    return false; // debounced
  }

  try {
    const connection = await getConnection(enrollmentId);
    if (!connection || !connection.access_token_encrypted) return false;

    await pushClaudeMdToRepo(enrollmentId);
    lastSyncTimes.set(enrollmentId, Date.now());
    return true;
  } catch (err) {
    console.error('[Reconciliation] Auto-sync failed:', (err as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
