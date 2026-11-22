import { sequelize } from '../../config/database';

/**
 * Career Prep v27, CP10.2: every statement the employer portal runs (clientAuth.ts and routes/hireClientRoutes.ts decide;
 * this only reads and writes). EVERY read takes the signed-in client's id and is scoped by it in SQL:
 *   candidates  only learners staff put forward to THIS client (hire_client_candidates);
 *   interviews  only interviews of those learners whose employer contact or interviewer is one of THIS client's members
 *               (so two clients interviewing the same learner never see each other's interviews);
 *   offers      only offers THIS client made (placement_offers.client_id).
 * No statement here selects placement_interviews.room_url or room_provider_id: the provider link never leaves the room
 * routes (execution contract, safety rules).
 */
const q = async <T>(sql: string, replacements: Record<string, unknown>): Promise<T[]> => (await sequelize.query(sql, { replacements }))[0] as T[];

export interface MemberRow { member_id: string; client_id: string; client_name: string; email: string }
export interface CandidateRow { enrollment_id: string; full_name: string | null; put_forward_at: Date | string }
export interface ClientInterviewRow {
  id: string; enrollment_id: string; full_name: string | null; company: string | null; position: string | null; state: string;
  starts_at: Date | string | null; minutes: number | null; recording_consent: string | null;
}
export interface ClientOfferRow {
  id: string; offer_group_id: string; version: number; enrollment_id: string; full_name: string | null; role: string; pay_basis: 'yearly' | 'hourly';
  salary_cents: string | number | null; hourly_rate_cents: number | null; hours_per_week: string | number | null; first_year_cents: string | number;
  fee_rate_bp: number; fee_cents: string | number; start_date: string | null; respond_by: Date | string | null; status: string;
  invoice_status: string | null; created_at: Date | string;
}

/** Sign-in links requested for this address in the last hour (the per-address rate limit). */
export async function recentLinkRequests(email: string): Promise<Date[]> {
  const rows = await q<{ created_at: Date }>("SELECT created_at FROM hire_client_signin_tokens WHERE email = :email AND created_at > NOW() - INTERVAL '1 hour'", { email });
  return rows.map((r) => new Date(r.created_at));
}

/** The memberships for an address, oldest first (a sign-in uses the first). Read only: a sign-in never creates one. */
export async function membershipsFor(email: string): Promise<MemberRow[]> {
  return q<MemberRow>(`SELECT m.id AS member_id, m.client_id, c.name AS client_name, m.email FROM hire_client_members m JOIN hire_clients c ON c.id = m.client_id
    WHERE m.email = :email ORDER BY m.created_at, m.id`, { email });
}

/** The session's member, still present (removing a member ends their sessions at the next request). */
export async function memberById(memberId: string, clientId: string): Promise<MemberRow | undefined> {
  return (await q<MemberRow>(`SELECT m.id AS member_id, m.client_id, c.name AS client_name, m.email FROM hire_client_members m JOIN hire_clients c ON c.id = m.client_id
    WHERE m.id = :memberId AND m.client_id = :clientId`, { memberId, clientId }))[0];
}

export async function insertSigninToken(email: string, tokenHash: string, expiresAt: Date): Promise<string> {
  const [row] = await q<{ id: string }>('INSERT INTO hire_client_signin_tokens (email, token_hash, expires_at) VALUES (:email, :tokenHash, :expiresAt) RETURNING id',
    { email, tokenHash, expiresAt });
  return String(row.id);
}

/** Spend a link: ONE conditional UPDATE, so two redemptions at once cannot both succeed. The email, or undefined. */
export async function consumeSigninToken(tokenHash: string): Promise<string | undefined> {
  const rows = await q<{ email: string }>(`UPDATE hire_client_signin_tokens SET consumed_at = NOW()
    WHERE token_hash = :tokenHash AND consumed_at IS NULL AND expires_at > NOW() RETURNING email`, { tokenHash });
  return rows[0]?.email;
}

export async function clientCandidates(clientId: string): Promise<CandidateRow[]> {
  return q<CandidateRow>(`SELECT cc.enrollment_id, e.full_name, cc.created_at AS put_forward_at FROM hire_client_candidates cc JOIN enrollments e ON e.id = cc.enrollment_id
    WHERE cc.client_id = :clientId ORDER BY cc.created_at DESC, cc.id DESC`, { clientId });
}

export async function clientCandidate(clientId: string, enrollmentId: string): Promise<CandidateRow | undefined> {
  return (await q<CandidateRow>(`SELECT cc.enrollment_id, e.full_name, cc.created_at AS put_forward_at FROM hire_client_candidates cc JOIN enrollments e ON e.id = cc.enrollment_id
    WHERE cc.client_id = :clientId AND cc.enrollment_id = :enrollmentId`, { clientId, enrollmentId }))[0];
}

export async function clientInterviews(clientId: string, interviewId?: string): Promise<ClientInterviewRow[]> {
  return q<ClientInterviewRow>(`SELECT i.id, i.enrollment_id, e.full_name, i.company, i.position, i.state, i.starts_at, i.minutes, i.recording_consent
    FROM placement_interviews i
    JOIN hire_client_candidates cc ON cc.enrollment_id = i.enrollment_id AND cc.client_id = :clientId
    JOIN enrollments e ON e.id = i.enrollment_id
    WHERE EXISTS (SELECT 1 FROM hire_client_members m WHERE m.client_id = :clientId
      AND (m.email = lower(btrim(i.contact_email)) OR EXISTS (SELECT 1 FROM unnest(i.interviewer_emails) x WHERE lower(btrim(x)) = m.email)))
    ${interviewId ? 'AND i.id = :interviewId' : ''}
    ORDER BY i.starts_at DESC NULLS FIRST, i.created_at DESC LIMIT 200`, { clientId, interviewId: interviewId ?? null });
}

export async function clientOffers(clientId: string): Promise<ClientOfferRow[]> {
  return q<ClientOfferRow>(`SELECT o.id, o.offer_group_id, o.version, o.enrollment_id, e.full_name, o.role, o.pay_basis, o.salary_cents, o.hourly_rate_cents,
      o.hours_per_week, o.first_year_cents, o.fee_rate_bp, o.fee_cents, o.start_date, o.respond_by, o.status, inv.status AS invoice_status, o.created_at
    FROM placement_offers o JOIN enrollments e ON e.id = o.enrollment_id LEFT JOIN placement_invoices inv ON inv.offer_id = o.id
    WHERE o.client_id = :clientId AND o.superseded_at IS NULL ORDER BY o.created_at DESC LIMIT 200`, { clientId });
}
