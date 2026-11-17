/**
 * finderBuild - "Build this case study" (Services Upgrade CF2): the SERVER runs the build-case-study skill's steps
 * 0-2, a Claude Code session does the authoring (steps 3-11) from the Basecamp ticket this opens. Never publishes.
 *
 *   §0 PREFLIGHT, a hard stop: re-checked NOW against the live case_studies + repository scopes (not the run's copy):
 *      - the process is covered (coverageOf) -> 409 overlap, nothing created;
 *      - an existing case study has the same slug, or a title sharing >= TITLE_OVERLAP of its words -> 409 overlap;
 *      - "possible overlaps" from the run need an explicit acknowledgement, else 409;
 *      - a build already prepared for this proposal is returned, never duplicated (UNIQUE tenant + proposal).
 *   §1 PATH SCOPE: the request must carry exactly the scope the person was shown (the approval). A changed scope
 *      is refused, so what was approved is what gets applied. Counted, at most 40.
 *   §2 CREATE, SCOPE, SYNC: createCaseStudyFromRepoCollection -> setRepositoryPathScope -> syncCaseStudy. The sync
 *      runs after the response and records its outcome on the build row.
 *   TICKET: a Basecamp to-do in the CF group with the exact /build-case-study command and the draft's id. If Basecamp
 *      fails, the draft still exists and the command is returned for the person to paste; the failure is shown.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { FinderProposal } from './finderTypes';
import { coverageOf, type CaseStudyRef } from './finderMatch';
import { tokenSet } from './finderText';
import { latestFinder, defaultDeps } from './finderRun';

export const TITLE_OVERLAP = 0.6;
export const MAX_SCOPE = 40;
const BC_BUCKET = () => process.env.CASE_STUDY_FINDER_BC_BUCKET || '7463955';
const BC_TODOLIST = () => process.env.CASE_STUDY_FINDER_BC_TODOLIST || '10516111221';
const BC_ASSIGNEE = 17454835;
const APP_URL = () => (process.env.FRONTEND_URL || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');

export interface BuildView {
  id: string; proposalId: string; caseStudyId: string; title: string; status: 'prepared'; syncStatus: string;
  syncNote: string | null; scope: string[]; command: string; ticketUrl: string | null; ticketError: string | null;
  createdBy: string | null; createdAt: string; caseStudyUrl: string;
}
export type BuildOutcome =
  | { kind: 'built'; build: BuildView }
  | { kind: 'exists'; build: BuildView }
  | { kind: 'not_found' }
  | { kind: 'scope_changed'; expected: string[] }
  | { kind: 'overlap'; overlaps: { reason: string; caseStudy: { id: string; title: string; status: string } | null }[]; needsAcknowledgement: boolean };

export interface BuildDeps {
  loadProposal: (tenantId: string, proposalId: string) => Promise<FinderProposal | null>;
  loadCaseStudies: () => Promise<{ caseStudies: CaseStudyRef[]; scopes: { caseStudyId: string; owner: string; repo: string; pathScope: string[] }[] }>;
  findBuild: (tenantId: string, proposalId: string) => Promise<BuildView | null>;
  createDraft: (title: string, repo: string, actor: string) => Promise<{ caseStudyId: string; slug: string; repositoryId: string | null }>;
  setScope: (caseStudyId: string, repositoryId: string, scope: string[]) => Promise<void>;
  saveBuild: (row: Omit<BuildView, 'id' | 'createdAt' | 'caseStudyUrl'> & { tenantId: string }) => Promise<BuildView>;
  openTicket: (p: FinderProposal, caseStudyId: string, command: string) => Promise<string>;
  setTicket: (buildId: string, url: string | null, error: string | null) => Promise<void>;
  startSync: (buildId: string, caseStudyId: string) => void;
}

const slugOf = (t: string): string => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

/** §0: what an existing record already covers, checked against the live tables. Empty = clear to create. */
export function preflightOverlaps(p: FinderProposal, caseStudies: readonly CaseStudyRef[], scopes: Parameters<typeof coverageOf>[2]) {
  const out: { reason: string; caseStudy: { id: string; title: string; status: string } | null }[] = [];
  const cover = coverageOf(p.process, caseStudies, scopes);
  if (cover.excluded) out.push({ reason: cover.excluded.reason, caseStudy: cover.excluded.caseStudy });
  const mine = tokenSet(p.narrative.title);
  const slug = slugOf(p.narrative.title);
  for (const cs of caseStudies) {
    if (cs.slug && cs.slug === slug) { out.push({ reason: 'A case study already uses this slug', caseStudy: { id: cs.id, title: cs.title, status: cs.status } }); continue; }
    const theirs = tokenSet(cs.title);
    const shared = [...mine].filter((w) => theirs.has(w)).length;
    const union = new Set([...mine, ...theirs]).size;
    if (union && mine.size >= 2 && shared / union >= TITLE_OVERLAP) {
      out.push({ reason: `A case study has a very similar title (${Math.round((100 * shared) / union)}% of words shared)`, caseStudy: { id: cs.id, title: cs.title, status: cs.status } });
    }
  }
  return { hard: out, possible: cover.warnings.map((w) => ({ reason: w.reason, caseStudy: w.caseStudy })) };
}

const sameScope = (a: readonly string[], b: readonly string[]): boolean => {
  const x = [...a].map((s) => s.toLowerCase()).sort(); const y = [...b].map((s) => s.toLowerCase()).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

export function commandFor(p: FinderProposal, caseStudyId: string): string {
  return `${p.buildCommand} caseStudyId=${caseStudyId}`;
}

export async function prepareBuild(
  input: { tenantId: string; proposalId: string; actor: string; scope: string[]; acknowledgeOverlaps: boolean },
  deps: BuildDeps = defaultBuildDeps(),
): Promise<BuildOutcome> {
  const existing = await deps.findBuild(input.tenantId, input.proposalId);
  if (existing) return { kind: 'exists', build: existing };
  const p = await deps.loadProposal(input.tenantId, input.proposalId);
  if (!p) return { kind: 'not_found' };
  if (!sameScope(input.scope, p.pathScope) || p.pathScope.length > MAX_SCOPE) return { kind: 'scope_changed', expected: p.pathScope };

  const { caseStudies, scopes } = await deps.loadCaseStudies();
  const { hard, possible } = preflightOverlaps(p, caseStudies, scopes);
  if (hard.length) return { kind: 'overlap', overlaps: hard, needsAcknowledgement: false };
  if (possible.length && !input.acknowledgeOverlaps) return { kind: 'overlap', overlaps: possible, needsAcknowledgement: true };

  const draft = await deps.createDraft(p.narrative.title, `${p.process.owner}/${p.process.repo}`, input.actor);
  let syncNote: string | null = null;
  if (p.pathScope.length) {
    if (draft.repositoryId) await deps.setScope(draft.caseStudyId, draft.repositoryId, p.pathScope);
    else syncNote = 'The repository was not attached, so the scope could not be applied. Attach it on the case study.';
  }
  const command = commandFor(p, draft.caseStudyId);
  const build = await deps.saveBuild({
    tenantId: input.tenantId, proposalId: p.id, caseStudyId: draft.caseStudyId, title: p.narrative.title, status: 'prepared',
    syncStatus: syncNote ? 'not_started' : 'running', syncNote, scope: p.pathScope, command, ticketUrl: null, ticketError: null, createdBy: input.actor,
  });
  let ticketUrl: string | null = null; let ticketError: string | null = null;
  try { ticketUrl = await deps.openTicket(p, draft.caseStudyId, command); } catch (err) { ticketError = String((err as Error)?.message ?? err).slice(0, 200); }
  await deps.setTicket(build.id, ticketUrl, ticketError);
  if (!syncNote) deps.startSync(build.id, draft.caseStudyId);
  return { kind: 'built', build: { ...build, ticketUrl, ticketError } };
}

/* ----------------------------------------------------------------------------------------------- default I/O */

interface BuildRow {
  id: string; proposal_id: string; case_study_id: string; title: string; status: 'prepared'; sync_status: string; sync_note: string | null;
  scope: string[] | null; command: string; ticket_url: string | null; ticket_error: string | null; created_by: string | null; created_at: Date | string;
}
export const toBuildView = (r: BuildRow): BuildView => ({
  id: r.id, proposalId: r.proposal_id, caseStudyId: r.case_study_id, title: r.title, status: r.status, syncStatus: r.sync_status,
  syncNote: r.sync_note, scope: Array.isArray(r.scope) ? r.scope : [], command: r.command, ticketUrl: r.ticket_url, ticketError: r.ticket_error,
  createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString(), caseStudyUrl: `${APP_URL()}/admin/case-studies/${r.case_study_id}`,
});

export async function listBuilds(tenantId: string): Promise<BuildView[]> {
  const rows = await sequelize.query<BuildRow>(
    'SELECT * FROM case_study_finder_builds WHERE tenant_id = :tenantId ORDER BY created_at DESC LIMIT 100',
    { type: QueryTypes.SELECT, replacements: { tenantId } });
  return rows.map(toBuildView);
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function ticketHtml(p: FinderProposal, caseStudyId: string, command: string): string {
  const d = p.delta;
  const li = (xs: string[]) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return [
    `<div><strong>Draft case study created (private, never published from here):</strong> <a href="${APP_URL()}/admin/case-studies/${caseStudyId}">${esc(p.narrative.title)}</a></div>`,
    `<div><br><strong>Run in Claude Code (steps 0-2 are done; start at section 3, Author):</strong></div><pre>${esc(command)}</pre>`,
    `<div><br><strong>Why this one:</strong> ${esc(p.need.reasons.join('. '))}.</div>`,
    `<div><strong>Proves:</strong> ${esc(p.need.name)}${d ? ` (evidence ${d.before.score} -> ${d.after.score}, ${d.before.tier} -> ${d.after.tier})` : ''}</div>`,
    p.fit.why ? `<div><strong>Fit (${p.fit.score}):</strong> ${esc(p.fit.why)}</div>` : '',
    `<div><br><strong>What / where:</strong> ${esc(p.narrative.what)} ${esc(p.narrative.where)}</div>`,
    `<div><strong>What we can show:</strong></div>${li(p.narrative.canShow)}`,
    `<div><strong>Approved path scope (${p.pathScope.length}):</strong></div>${li(p.pathScope.length ? p.pathScope : ['whole repository'])}`,
    `<div><br>Done means the skill's section 11 checklist with denominators, two PDFs on this ticket, and Ali picks the cover. Never publish without an explicit instruction.</div>`,
  ].join('');
}

export function defaultBuildDeps(): BuildDeps {
  return {
    loadProposal: async (tenantId, proposalId) => {
      const { result } = await latestFinder(tenantId);
      return result?.proposals.find((x) => x.id === proposalId) ?? null;
    },
    loadCaseStudies: () => defaultDeps().loadCaseStudies(),
    findBuild: async (tenantId, proposalId) => {
      const [r] = await sequelize.query<BuildRow>('SELECT * FROM case_study_finder_builds WHERE tenant_id = :tenantId AND proposal_id = :proposalId',
        { type: QueryTypes.SELECT, replacements: { tenantId, proposalId } });
      return r ? toBuildView(r) : null;
    },
    createDraft: async (title, repo, actor) => {
      const { createCaseStudyFromRepoCollection } = await import('../../caseStudy/caseStudyAdminService');
      const res = await createCaseStudyFromRepoCollection({ title, repositories: [repo], actor });
      return { caseStudyId: res.caseStudy.id, slug: res.caseStudy.slug, repositoryId: res.repositories[0]?.id ?? null };
    },
    setScope: async (caseStudyId, repositoryId, scope) => {
      const { setRepositoryPathScope } = await import('../../caseStudy/caseStudyRepoCollection');
      await setRepositoryPathScope({ caseStudyId, repositoryId, pathScope: scope });
    },
    saveBuild: async (row) => {
      const [r] = await sequelize.query<BuildRow>(
        `INSERT INTO case_study_finder_builds (tenant_id, proposal_id, case_study_id, title, status, sync_status, sync_note, scope, command, created_by)
         VALUES (:tenantId, :proposalId, :caseStudyId, :title, :status, :syncStatus, :syncNote, CAST(:scope AS JSONB), :command, :createdBy)
         RETURNING *`,
        { type: QueryTypes.SELECT, replacements: { ...row, scope: JSON.stringify(row.scope) } });
      return toBuildView(r);
    },
    openTicket: async (p, caseStudyId, command) => {
      const { bcPost } = await import('../../ops/basecampClient');
      const due = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
      const made = await bcPost<{ app_url?: string }>(`/buckets/${BC_BUCKET()}/todolists/${BC_TODOLIST()}/todos.json`, {
        content: `Build case study: ${p.narrative.title}`.slice(0, 250), description: ticketHtml(p, caseStudyId, command),
        assignee_ids: [BC_ASSIGNEE], due_on: due,
      });
      if (!made?.app_url) throw new Error('Basecamp did not return the new to-do.');
      return made.app_url;
    },
    setTicket: async (buildId, url, error) => {
      await sequelize.query('UPDATE case_study_finder_builds SET ticket_url = :url, ticket_error = :error WHERE id = :buildId',
        { replacements: { buildId, url, error } });
    },
    startSync: (buildId, caseStudyId) => {
      setImmediate(() => { void runSync(buildId, caseStudyId); });
    },
  };
}

async function runSync(buildId: string, caseStudyId: string): Promise<void> {
  let status: string = 'failed'; let note: string | null = null;
  try {
    const { syncCaseStudy } = await import('../../caseStudy/caseStudySyncService');
    const res = await syncCaseStudy({ caseStudyId, trigger: 'manual' });
    status = res.status;
    if (res.status === 'partial' || res.status === 'failed') {
      note = `Sync ${res.status}: ${res.repoErrors.length} repository error(s). Re-sync from the case study before authoring.`;
    }
  } catch (err) {
    status = 'failed'; note = String((err as Error)?.message ?? err).slice(0, 200);
  }
  await sequelize.query('UPDATE case_study_finder_builds SET sync_status = :status, sync_note = :note WHERE id = :buildId',
    { replacements: { buildId, status, note } }).catch(() => undefined);
}
