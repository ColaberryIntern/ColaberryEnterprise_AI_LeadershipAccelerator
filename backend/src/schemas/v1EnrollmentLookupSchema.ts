import { z } from 'zod';

// Contract for GET /api/v1/enrollments/lookup?email=... (service-token auth).
// Consumer: Repo2Reputation's login gate (Kes). It only needs to know whether an
// email belongs to an Accelerator student, so the query is a single email and the
// response never carries more than cohort name, status and tier.
export const v1EnrollmentLookupQuerySchema = z.object({
  email: z.string().trim().email('Invalid email').max(255),
});

export type V1EnrollmentLookupQuery = z.infer<typeof v1EnrollmentLookupQuerySchema>;

export interface V1EnrollmentLookupRow {
  cohort: string | null;
  status: 'active' | 'completed' | 'withdrawn' | 'suspended';
  tier: 'guest' | 'member';
}

export interface V1EnrollmentLookupResponse {
  email: string;
  // true when at least one enrollment is a paid member (tier 'member') that is
  // active or completed. Guests (free Explorer accounts) and withdrawn or
  // suspended members do not count.
  enrolled: boolean;
  enrollments: V1EnrollmentLookupRow[];
}
