/**
 * Portfolio Enhancement Service
 *
 * Keeps portfolio, executive deliverable, and maturity score synchronized
 * with project progress. Triggered when artifacts change.
 *
 * Read-driven update system:
 * - Regenerates portfolio structure
 * - Regenerates executive report
 * - Recomputes maturity score
 * - Caches results on the Project record
 *
 * Idempotent, non-destructive, safe to rerun.
 * Never deletes or modifies artifacts.
 */
import Project from '../models/Project';
import { generatePortfolio, PortfolioStructure } from './portfolioGenerationService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RefreshResult {
  project_id: string;
  portfolio_updated: boolean;
  executive_updated: boolean;
  maturity_score: number;
  portfolio_updated_at: string;
  executive_updated_at: string | null;
  artifact_count: number;
  average_score: number | null;
}

// ─── Maturity Score ─────────────────────────────────────────────────────────

const CATEGORY_WEIGHTS: Record<string, number> = {
  strategy: 25,
  governance: 25,
  architecture: 25,
  implementation: 25,
};

function computeMaturityScore(portfolio: PortfolioStructure): number {
  let score = 0;
  const categories: Record<string, number> = {
    strategy: portfolio.strategy.length,
    governance: portfolio.governance.length,
    architecture: portfolio.architecture.length,
    implementation: portfolio.implementation.length,
  };

  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (categories[cat] > 0) {
      // Base credit for having artifacts in the category
      let categoryScore = weight * 0.6;

      // Quality bonus: scale remaining 40% by average score in the category
      const catArtifacts = (portfolio as any)[cat] as Array<{ score: number | null }>;
      const scored = catArtifacts.filter(a => a.score != null);
      if (scored.length > 0) {
        const avgScore = scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length;
        categoryScore += weight * 0.4 * (avgScore / 100);
      } else {
        // No scores yet — give partial credit
        categoryScore += weight * 0.2;
      }

      score += categoryScore;
    }
  }

  return Math.round(score);
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Refresh all cached project outputs: portfolio, executive deliverable, maturity score.
 * Idempotent — safe to call multiple times. Never modifies artifacts.
 */
export async function refreshProjectOutputs(enrollmentId: string): Promise<RefreshResult> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  if (!project) {
    throw new Error(`No project found for enrollment: ${enrollmentId}`);
  }

  const now = new Date();

  // 1. Regenerate portfolio
  let portfolioResult;
  try {
    portfolioResult = await generatePortfolio(enrollmentId);
  } catch (err: any) {
    console.error('[PortfolioEnhancement] Portfolio generation failed:', err.message);
    throw err;
  }

  const portfolio = portfolioResult.portfolio_structure;

  // 2. Cache portfolio structure
  const portfolioCache = {
    portfolio_structure: portfolio,
    readme_content: portfolioResult.readme_content,
    file_hierarchy: portfolioResult.file_hierarchy,
    cached_at: now.toISOString(),
  };

  await project.update({
    portfolio_cache: portfolioCache,
    portfolio_updated_at: now,
  });

  // 3. Regenerate executive deliverable (non-blocking — skip LLM to keep it fast)
  let executiveUpdatedAt: string | null = null;
  try {
    const { generateExecutiveDeliverable } = await import('./executiveDeliverableService');
    const execResult = await generateExecutiveDeliverable(enrollmentId, { useLLMEnhancement: false });

    await project.update({
      executive_summary: execResult.executive_report_markdown,
      executive_updated_at: now,
    });
    executiveUpdatedAt = now.toISOString();
  } catch (err: any) {
    console.error('[PortfolioEnhancement] Executive deliverable refresh failed:', err.message);
    // Non-critical — portfolio still updated
  }

  // 4. Compute maturity score
  const maturityScore = computeMaturityScore(portfolio);
  await project.update({ maturity_score: maturityScore });

  // 5. Run intervention detection (non-blocking)
  import('./mentorInterventionService').then(svc =>
    svc.detectProjectInterventions(project.id)
  ).catch(err => console.error('[PortfolioEnhancement] Intervention detection failed:', err.message));

  return {
    project_id: project.id,
    portfolio_updated: true,
    executive_updated: !!executiveUpdatedAt,
    maturity_score: maturityScore,
    portfolio_updated_at: now.toISOString(),
    executive_updated_at: executiveUpdatedAt,
    artifact_count: portfolio.total_artifacts,
    average_score: portfolio.average_score,
  };
}
