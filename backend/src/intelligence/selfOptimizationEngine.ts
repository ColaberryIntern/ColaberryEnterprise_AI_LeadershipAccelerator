/**
 * Self-Optimization Engine — identifies weak processes and generates improvement recommendations.
 */
import Capability from '../models/Capability';
import { scoreAllProcesses, ProcessScores } from './processScoringEngine';
import { generateImprovementPrompt, GeneratedPrompt, PromptTarget } from './promptGenerator';

export interface OptimizationRecommendation {
  process_id: string;
  process_name: string;
  weakest_dimension: string;
  score: number;
  recommendation: string;
  generated_prompt: GeneratedPrompt;
  priority: number;
}

const DIMENSION_TO_TARGET: Record<string, PromptTarget> = {
  determinism: 'backend_improvement',
  reliability: 'backend_improvement',
  observability: 'monitoring_gap',
  ux_exposure: 'frontend_exposure',
  automation: 'agent_enhancement',
  ai_maturity: 'agent_enhancement',
  human_dependency: 'autonomy_upgrade',
};

const THRESHOLD = 50; // dimensions below this are optimization targets

export async function identifyOptimizationTargets(limit: number = 10): Promise<OptimizationRecommendation[]> {
  const allScores = await scoreAllProcesses();
  const recommendations: OptimizationRecommendation[] = [];

  for (const { id, name, scores } of allScores) {
    // Find weakest dimension
    const dimensions = Object.entries(scores).filter(([k]) => k !== 'overall');
    const weakest = dimensions.sort((a, b) => a[1] - b[1])[0];

    if (weakest && weakest[1] < THRESHOLD) {
      const target = DIMENSION_TO_TARGET[weakest[0]] || 'backend_improvement';
      try {
        const prompt = await generateImprovementPrompt(id, target);
        recommendations.push({
          process_id: id,
          process_name: name,
          weakest_dimension: weakest[0],
          score: weakest[1],
          recommendation: `Improve ${weakest[0]} (currently ${weakest[1]}/100) — ${prompt.title}`,
          generated_prompt: prompt,
          priority: 100 - weakest[1], // lower score = higher priority
        });
      } catch {}
    }
  }

  return recommendations.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

export async function runOptimizationScan(): Promise<{
  total_processes: number;
  weak_processes: number;
  recommendations: OptimizationRecommendation[];
}> {
  const processes = await Capability.findAll({ where: { process_type: 'platform_process' } });
  const recs = await identifyOptimizationTargets(20);
  return {
    total_processes: processes.length,
    weak_processes: recs.length,
    recommendations: recs,
  };
}
