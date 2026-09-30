import portalApi from '../utils/portalApi';
import api from '../utils/api';

/**
 * certificationApi — certification claims (docs/POINTS_LADDER_DECISIONS.md, D4).
 * Student side rides the portal client; the review queue rides the admin client.
 * Files are fetched as blobs so the auth header travels with the request; a bare
 * <a href> to the file route would arrive unauthenticated.
 */

export type CertificationStatus = 'pending' | 'approved' | 'rejected';

export interface CertificationClaim {
  id: string;
  track: string;
  status: CertificationStatus;
  original_name: string | null;
  credential_id: string | null;
  passed_on: string | null;
  note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
}

export interface AdminCertificationClaim extends CertificationClaim {
  enrollment_id: string;
}

export const TRACK_LABELS: Record<string, string> = {
  cca_f: 'Claude Certified Architect – Foundations (CCA-F)',
};

export async function listMyCertifications(): Promise<CertificationClaim[]> {
  const { data } = await portalApi.get<{ certifications: CertificationClaim[] }>('/api/portal/certifications');
  return data.certifications;
}

export interface SubmitCertificationInput {
  file: File;
  credentialId?: string;
  passedOn?: string;
  note?: string;
}

export async function submitCertification(input: SubmitCertificationInput): Promise<CertificationClaim> {
  const form = new FormData();
  form.append('file', input.file);
  if (input.credentialId) form.append('credential_id', input.credentialId);
  if (input.passedOn) form.append('passed_on', input.passedOn);
  if (input.note) form.append('note', input.note);
  const { data } = await portalApi.post<CertificationClaim>('/api/portal/certifications', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Object URL for the student's own uploaded file; caller revokes it. */
export async function fetchMyCertificationFileUrl(id: string): Promise<string> {
  const res = await portalApi.get(`/api/portal/certifications/${encodeURIComponent(id)}/file`, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function fetchCertificationQueue(status: CertificationStatus | 'all' = 'pending'): Promise<AdminCertificationClaim[]> {
  const { data } = await api.get<{ certifications: AdminCertificationClaim[] }>('/api/admin/cert-prep/certifications', { params: { status } });
  return data.certifications;
}

export interface ReviewOutcome {
  certification: AdminCertificationClaim;
  milestone_latched: boolean;
  promotion: { level: string; rank: number; promoted: boolean } | null;
}

export async function reviewCertification(id: string, decision: 'approved' | 'rejected', note?: string): Promise<ReviewOutcome> {
  const { data } = await api.post<ReviewOutcome>(
    `/api/admin/cert-prep/certifications/${encodeURIComponent(id)}/review`,
    { decision, ...(note ? { note } : {}) },
  );
  return data;
}

/** Object URL for a claimant's uploaded file (staff); caller revokes it. */
export async function fetchCertificationFileUrl(id: string): Promise<string> {
  const res = await api.get(`/api/admin/cert-prep/certifications/${encodeURIComponent(id)}/file`, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
}
