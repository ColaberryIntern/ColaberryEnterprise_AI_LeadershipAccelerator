/**
 * factoryGenerationEntry — the flag-guarded, ship-DARK entry to factory generation.
 *
 * factoryGenerate (T7) is the pure capability; this is the switch. While
 * ENABLE_FACTORY_GENERATION is off (the default), factoryGenerateIfEnabled is INERT: it makes no
 * model call and refuses with a FACTORY_GENERATION_DISABLED issue, so deploying the Phase-2 code
 * changes nothing in production until the flag is flipped. A live route/trigger (Phase 3+) will call
 * THIS entry, never factoryGenerate directly, so the dark switch is the single on/off point.
 */
import { FLAGS } from '../../config/featureFlags';
import {
  factoryGenerate,
  type FactoryGenerateInput,
  type FactoryGenerateOptions,
  type FactoryGenerateResult,
} from './factoryGenerate';
import { assembleFactoryProject } from './factoryAssemble';
import type { ValidationIssue } from './factoryValidate';

export const FACTORY_GENERATION_DISABLED: ValidationIssue = {
  code: 'FACTORY_GENERATION_DISABLED',
  message: 'the ENABLE_FACTORY_GENERATION feature flag is off',
  severity: 'error',
};

/**
 * Reads FLAGS.factoryGeneration at call time. FLAGS itself is computed from process.env once at
 * module load, so a genuine env change needs a process restart (standard); reading at call time is
 * what lets a test mutate the (mocked) flag between cases.
 */
export function isFactoryGenerationEnabled(): boolean {
  return FLAGS.factoryGeneration;
}

/**
 * The dark-switch entry. When the flag is off, refuse without any model call (accepted:false,
 * FACTORY_GENERATION_DISABLED); when on, delegate to the real pipeline unchanged.
 */
export async function factoryGenerateIfEnabled(
  input: FactoryGenerateInput,
  opts: FactoryGenerateOptions = {},
): Promise<FactoryGenerateResult> {
  if (!FLAGS.factoryGeneration) {
    const project = assembleFactoryProject({
      decomposition: { processes: [], tasks: [], assignments: [], transitions: [], roles: [] },
      blocks: [],
      requirements: input.requirements,
      tracks: input.tracks,
      deliveryProjectId: input.deliveryProjectId,
      allocation: input.allocation,
      role_map: input.role_map,
    });
    return { project, issues: [FACTORY_GENERATION_DISABLED], accepted: false, decomposeAttempts: 0, repairAttempts: 0, repairRejected: 0 };
  }
  return factoryGenerate(input, opts);
}
