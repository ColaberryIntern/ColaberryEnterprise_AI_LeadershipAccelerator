/**
 * govCapabilityFitWithProof - the ONE entry point both Fit paths use (SV2.2): the Step 3 capability-fit route and
 * the automatic ZIP vetting. Keeping them on one function is what keeps "vetting path consistent" true: both see the
 * same evidence, the same possibleProof and the same (flagged) downgrade before anything downstream reads
 * `capabilities` (go/no-go, decideVerdict coverage, the saved fit_json).
 *
 *   1. List the tenant's ACTIVE services (growth stays excluded, Ali 2026-10-16) - exactly as before.
 *   2. Load proof (confirmed case studies + candidates). FAIL SOFT: a failure logs `gov_fit_proof_load_failed` and the
 *      fit runs exactly as it did before SV2 (no titles in the prompt, no proof fields, NO downgrade).
 *   3. assessCapabilityFit with each service's confirmed titles (omitted when none, so with zero links the prompt is
 *      byte-identical to the pre-SV2 prompt).
 *   4. applyFitProofRules with requireProof = the explicit option, else FLAGS.govFitRequireProof (default OFF).
 *
 * Returns the raw model capabilities too, so the before/after regression can apply the rules both ways from ONE
 * LLM call. A failed fit (`error`) is returned untouched for the caller to handle as before.
 */
import { FLAGS } from '../../config/featureFlags';
import { listServiceOfferings } from './serviceCatalog';
import { assessCapabilityFit, CapabilityFitResult, CapabilityItem, CapabilityServiceInput } from './govCapabilityFit';
import { applyFitProofRules, EMPTY_PROOF, ProofContext } from './govFitProofRules';

export interface FitWithProofInput {
  tenantId: string;
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  /** Override the flag (the regression script computes both states). Default FLAGS.govFitRequireProof. */
  requireProof?: boolean;
}

export interface FitWithProofDeps {
  loadProof?: (tenantId: string, activeServiceIds: string[]) => Promise<ProofContext>;
}

export interface FitWithProofOutput {
  fit: CapabilityFitResult;
  /** The model's sanitized capabilities BEFORE the proof rules. */
  rawCapabilities: CapabilityItem[];
  /** The active services the fit ran against (serviceCatalog DTOs). */
  services: Array<{ id: string; name: string; description?: string | null; category?: string | null; keywords?: string[] }>;
  proof: ProofContext;
}

async function defaultLoadProof(tenantId: string, ids: string[]): Promise<ProofContext> {
  const { loadFitProofContext } = await import('./govFitProofLoader');
  return loadFitProofContext(tenantId, ids);
}

export async function assessCapabilityFitWithProof(input: FitWithProofInput, deps: FitWithProofDeps = {}): Promise<FitWithProofOutput> {
  // any: serviceCatalog DTOs are untyped (toServiceOfferingDto returns any); only these five fields are read.
  const services: any[] = await listServiceOfferings({ tenantId: input.tenantId, status: 'active' }); // eslint-disable-line @typescript-eslint/no-explicit-any
  let proof: ProofContext = EMPTY_PROOF;
  try {
    proof = await (deps.loadProof ?? defaultLoadProof)(input.tenantId, services.map((s) => s.id));
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'gov_fit_proof_load_failed', outcome: 'partial',
      error_class: (err as Error)?.name ?? 'Error', context: { message: String((err as Error)?.message ?? err).slice(0, 200), fallback: 'fit without proof' },
    }));
  }
  const fitServices: CapabilityServiceInput[] = services.map((s) => {
    const base: CapabilityServiceInput = { id: s.id, name: s.name, description: s.description, category: s.category, keywords: s.keywords };
    const titles = proof.available ? (proof.evidenceByService[s.id] ?? []).map((e) => e.title) : [];
    return titles.length ? { ...base, evidenceTitles: titles } : base;
  });
  const fit = await assessCapabilityFit({ requirements: input.requirements, services: fitServices, title: input.title ?? null, buyer: input.buyer ?? null });
  if (fit.error) return { fit, rawCapabilities: fit.capabilities ?? [], services, proof };
  const requireProof = input.requireProof ?? Boolean(FLAGS.govFitRequireProof);
  return {
    fit: { ...fit, capabilities: applyFitProofRules(fit.capabilities, proof, { requireProof }), proof: { available: proof.available, requireProof } },
    rawCapabilities: fit.capabilities,
    services,
    proof,
  };
}
