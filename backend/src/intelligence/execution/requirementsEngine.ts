/**
 * Requirements Engine
 * Determines requirement status from graph evidence, not keyword matching.
 * VERIFIED = real implementation evidence (files + graph edges)
 * AUTO-MATCHED = keyword match only
 * PLANNED = in execution plan but not implemented
 * UNMAPPED = no association
 */
import { ContextGraph } from '../graph/graphTypes';
import { RequirementsMap } from '../../models';

export interface RequirementState {
  id: string;
  key: string;
  status: 'verified' | 'auto_matched' | 'planned' | 'unmapped';
  evidence: string[];
  confidence: number;
}

/**
 * Recalculate requirement states from graph evidence.
 * Updates RequirementsMap rows in the database.
 */
export async function recalculateRequirementStates(
  projectId: string, graph: ContextGraph, verifiedFiles: string[]
): Promise<{ verified: number; auto_matched: number; planned: number; unmapped: number }> {
  const counts = { verified: 0, auto_matched: 0, planned: 0, unmapped: 0 };
  const verifiedSet = new Set(verifiedFiles.map(f => f.toLowerCase()));

  const requirements = await RequirementsMap.findAll({ where: { project_id: projectId } });

  for (const req of requirements) {
    const files = (req.github_file_paths || []) as string[];
    const realFiles = files.filter(f => {
      const name = (f.split('/').pop() || '').toLowerCase();
      return !name.startsWith('.') && !['package.json', 'tsconfig.json', '.gitignore', '.env.example', 'readme.md'].includes(name);
    });

    // Check if any of the matched files were just verified by the execution
    const hasVerifiedFile = realFiles.some(f => verifiedSet.has(f.toLowerCase()));

    // Check graph for implementation evidence
    const reqNode = graph.getNode(`req:${req.id}`);
    const hasGraphEvidence = reqNode ? graph.getEdgesFrom(reqNode.id).some(e => e.type === 'matched_to') : false;

    if (hasVerifiedFile) {
      req.status = 'verified';
      req.verified_by = 'execution_sync';
      (req as any).verification_status = 'verified_complete';
      counts.verified++;
    } else if (realFiles.length > 0 && (req.confidence_score || 0) >= 0.7) {
      req.status = 'matched'; // auto_matched in display
      counts.auto_matched++;
    } else if (hasGraphEvidence) {
      req.status = 'partial';
      counts.planned++;
    } else {
      req.status = 'unmatched';
      counts.unmapped++;
    }

    await req.save();
  }

  return counts;
}
