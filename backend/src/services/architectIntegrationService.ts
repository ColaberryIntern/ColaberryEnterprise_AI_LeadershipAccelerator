import { ProjectSystemContract } from '../models';
import { getProjectByEnrollment } from './projectService';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// 1. Fetch contract from AI Project Architect and store
// ---------------------------------------------------------------------------

export async function fetchAndStoreContract(
  enrollmentId: string,
  slug: string
): Promise<ProjectSystemContract> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // Fetch from external AI Project Architect
  const url = `${env.aiProjectArchitectUrl}/api/system-design-contract?slug=${encodeURIComponent(slug)}`;
  console.log(`[ArchitectIntegration] Fetching contract from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch design contract: ${response.status} ${response.statusText}`);
  }

  const contract: any = await response.json();

  // Extract validation and readiness status
  const validationStatus = contract.validation?.is_valid ? 'valid' : 'invalid';
  const readinessStatus = contract.build_readiness?.ready ? 'ready' : 'not_ready';

  // Upsert — one contract per project
  const existing = await ProjectSystemContract.findOne({
    where: { project_id: project.id },
  });

  if (existing) {
    existing.contract_json = contract;
    existing.validation_status = validationStatus;
    existing.readiness_status = readinessStatus;
    await existing.save();
    console.log(`[ArchitectIntegration] Updated contract for project ${project.id}`);
    return existing;
  }

  const stored = await ProjectSystemContract.create({
    project_id: project.id,
    contract_json: contract,
    validation_status: validationStatus,
    readiness_status: readinessStatus,
  });

  console.log(`[ArchitectIntegration] Stored new contract for project ${project.id}`);
  return stored;
}

// ---------------------------------------------------------------------------
// 2. Get stored contract
// ---------------------------------------------------------------------------

export async function getStoredContract(
  enrollmentId: string
): Promise<ProjectSystemContract | null> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) return null;

  return ProjectSystemContract.findOne({
    where: { project_id: project.id },
  });
}

// ---------------------------------------------------------------------------
// 3. Lock contract (confirm build)
// ---------------------------------------------------------------------------

export async function lockContract(
  enrollmentId: string
): Promise<ProjectSystemContract> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const contract = await ProjectSystemContract.findOne({
    where: { project_id: project.id },
  });

  if (!contract) throw new Error('No contract found. Generate one first.');
  if (contract.locked_at) throw new Error('Contract is already locked.');

  contract.locked_at = new Date();
  await contract.save();

  console.log(`[ArchitectIntegration] Contract locked for project ${project.id}`);
  return contract;
}
