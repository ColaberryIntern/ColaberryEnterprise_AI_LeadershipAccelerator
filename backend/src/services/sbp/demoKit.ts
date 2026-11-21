/**
 * demoKit - the four plan-independent files every connected-demo repo receives.
 *
 * ## What this is
 *
 * The demo ENGINE (one HTML file that renders whatever `demo-spec.json` describes), the SCAFFOLD
 * that derives a first spec from `.colaberry/plan.json` plus the Command Center's data model, the
 * STANDALONE builder that folds a spec into the engine for a double-clickable file, and the spec
 * CONTRACT that documents every field.
 *
 * ## Why it is a constant bundle
 *
 * Nothing here varies with the plan, so it costs four files per repo once and never churns a
 * sync - the same reasoning as `renderStudentDataContract()` and `capabilitySkillFiles()`. A
 * plan-shaped file would be rewritten on every regeneration and show up as noise in every diff.
 *
 * ## Why the bytes come from a generated module rather than the filesystem
 *
 * `backend/package.json` builds with plain `tsc`, which does not copy non-TS files into `dist/`.
 * The repo already paid for that lesson: `Dockerfile:63` says "tsc does not copy .json, so
 * without this the files are simply absent from the image", and line 69 is the explicit COPY that
 * repairs it for agent-domain capabilities. Taking that route here would mean editing the
 * Dockerfile, which this run's execution contract classes ESCALATE-tier. So the bytes are inlined
 * by `scripts/generateDemoKitAssets.js` into `demoKitAssets.generated.ts`, the readable files
 * under `demoKitAssets/` stay the source of truth, and `demoKit.drift.test.ts` fails CI if the
 * two ever diverge. One copy, enforced, with no infrastructure change.
 *
 * Pure. No I/O, so this is safe to call inside `renderDocs` and trivially testable.
 */
import {
  DEMO_KIT_ENGINE_HTML,
  DEMO_KIT_SCAFFOLD_MJS,
  DEMO_KIT_STANDALONE_MJS,
  DEMO_KIT_CONTRACT_MD,
} from './demoKitAssets.generated';
import {
  DEMO_KIT_ENGINE_PATH,
  DEMO_KIT_SCAFFOLD_PATH,
  DEMO_KIT_STANDALONE_PATH,
  DEMO_KIT_CONTRACT_PATH,
} from './connectedDemoStory';

export interface DemoKitFile {
  /** Repo-relative, forward slashes. Every one sits under `docs/demo-kit/`. */
  path: string;
  content: string;
}

/**
 * The four files, in a FIXED order.
 *
 * Fixed because `renderDocs` must be byte-identical across calls and across shuffled inputs; a
 * bundle that reordered itself would break that determinism from the inside, and the shuffle test
 * would not catch it because the shuffle is applied to the PLAN, not to this list.
 */
export function demoKitFiles(): DemoKitFile[] {
  return [
    { path: DEMO_KIT_ENGINE_PATH, content: DEMO_KIT_ENGINE_HTML },
    { path: DEMO_KIT_SCAFFOLD_PATH, content: DEMO_KIT_SCAFFOLD_MJS },
    { path: DEMO_KIT_STANDALONE_PATH, content: DEMO_KIT_STANDALONE_MJS },
    { path: DEMO_KIT_CONTRACT_PATH, content: DEMO_KIT_CONTRACT_MD },
  ];
}
