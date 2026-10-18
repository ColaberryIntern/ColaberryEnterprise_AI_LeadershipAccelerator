/**
 * govProposalShare (P5 Team & access) — share ONE proposal with ONE member at a level, safely.
 *
 * Two halves:
 *  - PURE + total: `proposalPermissionsFor(level)` and `toSharedProposalView(...)`, the student-safe projection of
 *    the proposal. The projection is the trust boundary (not the UI): it DROPS pricing responses and NEVER carries
 *    an author/reviewer identity, a qualification, a decision, or any admin field. A view-level member sees the
 *    responses read-only; comment/edit additionally see the open gaps.
 *  - Persistence: a per-(project, member) grant row (GovProposalShareGrant). Sharing with one intern never widens
 *    anyone else's access - it is a row, not a role change, and it never touches requireSection('program').
 */

export type ProposalShareLevel = 'none' | 'view' | 'comment' | 'edit';
export const PROPOSAL_SHARE_LEVELS: readonly ProposalShareLevel[] = ['none', 'view', 'comment', 'edit'];

/** Level -> capabilities. Monotonic: edit implies comment implies read. Pure. */
export function proposalPermissionsFor(level: ProposalShareLevel): { read: boolean; comment: boolean; edit: boolean } {
  switch (level) {
    case 'edit': return { read: true, comment: true, edit: true };
    case 'comment': return { read: true, comment: true, edit: false };
    case 'view': return { read: true, comment: false, edit: false };
    default: return { read: false, comment: false, edit: false };
  }
}

export interface SharedProposalResponse {
  requirementId: string;
  statement: string;
  status: string;
  content: string;
  openGapCount: number;
  /** Only present for comment/edit members; never carries the gap's own answer text. */
  gaps?: { id: string; question: string; suggestions: string[]; resolution: string }[];
}
export interface SharedProposalView {
  level: ProposalShareLevel;
  canComment: boolean;
  canEdit: boolean;
  responses: SharedProposalResponse[];
}

/**
 * Project the proposal into the member-safe view for `level`. DROPS any response whose requirement is a pricing
 * requirement (matched by id against the established set's `kind`), and NEVER includes an author/reviewer identity.
 * Pure + total; a 'none' level yields no responses.
 */
export function toSharedProposalView(slots: any[], established: any[], level: ProposalShareLevel): SharedProposalView {
  const perms = proposalPermissionsFor(level);
  const pricingIds = new Set(
    (Array.isArray(established) ? established : [])
      .filter((r) => r && String(r.kind ?? '').trim().toLowerCase() === 'pricing')
      .map((r) => String(r.id ?? r.canonicalReqId ?? r.canonical_req_id ?? '')),
  );
  if (!perms.read) return { level, canComment: false, canEdit: false, responses: [] };
  const responses: SharedProposalResponse[] = (Array.isArray(slots) ? slots : [])
    .filter((s) => s && !pricingIds.has(String(s.requirementId)))
    .map((s) => {
      const gaps = Array.isArray(s.gaps) ? s.gaps : [];
      const row: SharedProposalResponse = {
        requirementId: String(s.requirementId ?? ''),
        statement: String(s.statement ?? ''),
        status: String(s.status ?? 'unanswered'),
        content: String(s.content ?? ''),
        openGapCount: gaps.filter((g: any) => g && (g.resolution === 'open' || g.resolution === 'filler')).length,
      };
      // comment/edit members see the gap QUESTIONS (what still needs input) but never the stored answer text.
      if (perms.comment) {
        row.gaps = gaps.map((g: any) => ({
          id: String(g.id ?? ''), question: String(g.question ?? ''),
          suggestions: Array.isArray(g.suggestions) ? g.suggestions.map((x: any) => String(x)) : [],
          resolution: String(g.resolution ?? 'open'),
        }));
      }
      return row;
    });
  return { level, canComment: perms.comment, canEdit: perms.edit, responses };
}

// ── Persistence ──────────────────────────────────────────────────────────────
export interface ShareGrant { deliveryProjectId: string; memberIdentityId: string; level: ProposalShareLevel; updatedAt: string | null; }

function toGrant(row: any): ShareGrant {
  return {
    deliveryProjectId: row.delivery_project_id,
    memberIdentityId: row.member_identity_id,
    level: (PROPOSAL_SHARE_LEVELS as readonly string[]).includes(row.level) ? row.level : 'none',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/** Set (or clear, with 'none') a member's proposal share level on a project. Upsert on (project, member). */
export async function setProposalShareGrant(deliveryProjectId: string, memberIdentityId: string, level: ProposalShareLevel): Promise<ShareGrant> {
  if (!deliveryProjectId || !memberIdentityId) throw new Error('project and member are required');
  if (!(PROPOSAL_SHARE_LEVELS as readonly string[]).includes(level)) throw new Error(`unknown share level ${level}`);
  const { default: GovProposalShareGrant } = await import('../../models/GovProposalShareGrant');
  const existing: any = await GovProposalShareGrant.findOne({ where: { delivery_project_id: deliveryProjectId, member_identity_id: memberIdentityId } });
  if (existing) { await existing.update({ level, updated_at: new Date() }); return toGrant(existing.get({ plain: true })); }
  const row: any = await GovProposalShareGrant.create({ delivery_project_id: deliveryProjectId, member_identity_id: memberIdentityId, level });
  return toGrant(row.get({ plain: true }));
}

/** The member's share level on a project ('none' if no row). */
export async function getProposalShareLevel(deliveryProjectId: string, memberIdentityId: string): Promise<ProposalShareLevel> {
  if (!deliveryProjectId || !memberIdentityId) return 'none';
  const { default: GovProposalShareGrant } = await import('../../models/GovProposalShareGrant');
  const row: any = await GovProposalShareGrant.findOne({ where: { delivery_project_id: deliveryProjectId, member_identity_id: memberIdentityId } });
  return row ? toGrant(row.get({ plain: true })).level : 'none';
}

/** All share grants on a project (for the admin Team & access panel). */
export async function listProposalShareGrants(deliveryProjectId: string): Promise<ShareGrant[]> {
  if (!deliveryProjectId) return [];
  const { default: GovProposalShareGrant } = await import('../../models/GovProposalShareGrant');
  const rows: any[] = await GovProposalShareGrant.findAll({ where: { delivery_project_id: deliveryProjectId } });
  return rows.map((r) => toGrant(r.get({ plain: true })));
}
