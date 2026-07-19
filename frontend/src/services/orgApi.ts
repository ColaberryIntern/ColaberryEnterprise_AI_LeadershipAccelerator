import portalApi from '../utils/portalApi';

/**
 * Organization / Manager API client — the "free-trial management layer".
 *
 * All the authed reads/writes go through `portalApi` (NOT the admin `api`
 * client): `portalApi` is the axios instance that attaches the PARTICIPANT JWT
 * from `localStorage['participant_token']` as `Authorization: Bearer …`, which is
 * exactly what the `/api/portal/org/*` routes require (requireParticipant +
 * requireOrgManager). `registerOrg` is a PUBLIC endpoint, but it rides the same
 * client harmlessly (no token → no auth header).
 *
 * Types mirror backend `orgService.ts` / `orgController.ts` response shapes 1:1.
 * The controller wraps roster in `{ members }`, feed in `{ feed }`, and invites
 * in `{ members }`; overview / member-detail / register are returned bare.
 */

// ── Register (PUBLIC) ────────────────────────────────────────────────────────

export interface OrgRegisterBody {
  name: string;
  company?: string;
  email: string;
}

export interface OrgRegisterResult {
  jwt: string;
  organization: { id: string; name: string; owner_enrollment_id: string };
  enrollment: { id: string; full_name: string; email: string; tier: string };
}

// ── Company rollup (overview) ────────────────────────────────────────────────

export interface OrgLevelBucket { rank: number; count: number; }
export interface OrgXpWeek { week: string; xp: number; }

export interface OrgOverview {
  member_count: number;
  /** Counts across the 9-level Builder ladder, ranks 0..8 (always length 9). */
  level_distribution: OrgLevelBucket[];
  avg_readiness: number;              // 0..100
  builder_xp_by_week: OrgXpWeek[];    // last ~8 ISO weeks, oldest → newest
  evidence_this_week: number;
  attendance_rate: number;            // 0..1
  evaluations_passed_this_month: number;
  level_ups_last_30d: number;
}

// ── Roster ───────────────────────────────────────────────────────────────────

export interface OrgRosterMember {
  enrollment_id: string;
  name: string;
  team: string | null;
  level: string;                      // level_slug, e.g. "builder"
  rank: number;                       // 0..8
  readiness: number;                  // 0..100
  builder_xp_week: number;
  streak: number;
}

// ── Per-member drill-down ────────────────────────────────────────────────────

export interface OrgEngagement {
  total: number;
  streak_days: number;
  streak_points: number;
  recent: Array<{ event_type: string; points: number; created_at: string }>;
}
export interface OrgSkillXp { learning: number; builder: number; community: number; total: number; }
export interface OrgReadiness {
  pct: number;
  level: string;
  rank: number;
  next_level: string | null;
  at_max: boolean;
  gaps: string[];
}
export interface OrgPromotion { level: string; rank: number; next_level: string | null; gaps: string[]; }

export interface OrgSkillGenomeDomain { id: string; name: string; avg_proficiency: number; }
export interface OrgSkillGenomeLayer {
  id: string;
  name: string;
  description: string;
  avg_proficiency: number;
  domains: OrgSkillGenomeDomain[];
}
export interface OrgSkillGenome {
  layers: OrgSkillGenomeLayer[];
  overall_proficiency: number;
  total_skills: number;
  skills_started: number;
  skills_mastered: number;
}

export interface OrgSectionProgress {
  week: number;
  beginning: number | null;           // latest quiz score 0..1
  current: number | null;             // latest evaluation score 0..1
  growth: number | null;              // current - beginning
  quiz_taken: boolean;
  evaluation_taken: boolean;
  evaluation_passed: boolean | null;
  per_competency: Array<{ domain: string; beginning: number | null; current: number | null; delta: number | null }>;
}

export interface OrgEvidenceBySource { source_type: string; count: number; }
export interface OrgEvaluation {
  week_number: number;
  overall_score: number | null;
  progress_summary: string | null;
  evaluated_at: string;               // ISO
}

export interface OrgMemberDetail {
  enrollment_id: string;
  name: string;
  team: string | null;
  engagement: OrgEngagement | null;
  skill_xp: OrgSkillXp | null;
  readiness: OrgReadiness | null;
  promotion: OrgPromotion | null;
  skill_genome: OrgSkillGenome | null;
  section_progress: OrgSectionProgress | null;
  evidence_by_source: OrgEvidenceBySource[];
  evaluations: OrgEvaluation[];
  project_count: number;
}

// ── Feed ─────────────────────────────────────────────────────────────────────

export interface OrgFeedItem {
  who: string;
  kind: 'promotion' | 'evidence' | 'evaluation' | 'artifact' | 'streak';
  text: string;
  when: string;                       // ISO
  enrollment_id: string;
}

// ── Invites ──────────────────────────────────────────────────────────────────

export interface OrgInviteBody { emails: string[]; team?: string; }

/** An org_members row as returned by the invite endpoint (Sequelize instance JSON). */
export interface OrgInvitedMember {
  id?: string;
  org_id?: string;
  enrollment_id?: string | null;
  email: string;
  team?: string | null;
  role?: string;
  invite_status?: string;
}

// ── Session persistence (public register → portal handoff) ───────────────────

/**
 * Persist a fresh participant session under the SAME localStorage key the portal
 * uses (`participant_token`) — mirrors `ParticipantAuthProvider.login`. The public
 * `/try` register flow runs OUTSIDE the auth context, so it can't call the
 * context's `login`; this keeps a single auth mechanism (one token, one key).
 */
export function persistParticipantSession(jwt: string): void {
  localStorage.setItem('participant_token', jwt);
  localStorage.removeItem('te_avatar'); // drop any prior user's cached avatar
}

// ── API calls ────────────────────────────────────────────────────────────────

/** PUBLIC — create a free management account (manager org + the manager's own
 *  free student enrollment) and return a participant session JWT. */
export async function registerOrg(body: OrgRegisterBody): Promise<OrgRegisterResult> {
  const { data } = await portalApi.post<OrgRegisterResult>('/api/portal/org/register', body);
  return data;
}

export async function getOrgOverview(): Promise<OrgOverview> {
  const { data } = await portalApi.get<OrgOverview>('/api/portal/org/overview');
  return data;
}

export async function getOrgRoster(): Promise<OrgRosterMember[]> {
  const { data } = await portalApi.get<{ members: OrgRosterMember[] }>('/api/portal/org/members');
  return data.members || [];
}

export async function getOrgMember(enrollmentId: string): Promise<OrgMemberDetail> {
  const { data } = await portalApi.get<OrgMemberDetail>(
    `/api/portal/org/members/${encodeURIComponent(enrollmentId)}`,
  );
  return data;
}

export async function getOrgFeed(): Promise<OrgFeedItem[]> {
  const { data } = await portalApi.get<{ feed: OrgFeedItem[] }>('/api/portal/org/feed');
  return data.feed || [];
}

export async function inviteMembers(body: OrgInviteBody): Promise<OrgInvitedMember[]> {
  const { data } = await portalApi.post<{ members: OrgInvitedMember[] }>('/api/portal/org/invites', body);
  return data.members || [];
}
