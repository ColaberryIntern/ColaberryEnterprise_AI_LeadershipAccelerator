import api from '../utils/api';
import { params } from './queryParams';

/**
 * mayaBrainApi - the client for Maya's Brain (`/api/admin/maya-brain`).
 *
 * ─── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 *
 * Extracted from `explorerGrowthApi.ts` on 2026-11-23, unchanged, for three
 * reasons that all point the same way:
 *
 * 1. **The Brain is not Explorer Growth's.** It answers on its own route tree,
 *    `/api/admin/maya-brain`, mounted separately and never gated by the Growth
 *    Journey master flag. It was only ever in Explorer's client because
 *    Explorer's page was the only thing that rendered it.
 *
 * 2. **Two pages need it now.** `/admin/growth-journey` gained the Brain tab
 *    when Explorer Growth merged into it. A second copy of these fourteen
 *    declarations would be two definitions of one contract, and the day they
 *    disagreed nobody would be told.
 *
 * 3. **`explorerGrowthApi.ts` was 786 lines**, over this repo's 500-line hard
 *    ceiling and grandfathered until touched. The Modular Composition Rule says
 *    the next change splits it before adding to it. This is that split.
 *
 * `explorerGrowthApi.ts` re-exports everything here, so Explorer's own
 * `BrainTab` and its imports are untouched. AD-1 holds: `/admin/explorer-growth`
 * keeps working without a single edit to its components.
 *
 * ─── THESE RULES ARE GLOBAL, NOT PER BRAND, AND THAT IS NOT A BUG YET ───────
 *
 * `saveBrainRules` persists through `setSetting(BRAIN_RULES_SETTING, ...)` - ONE
 * system setting, shared by every brand. So Maya's voice, her never-say list,
 * her shelf rotation and her cadence are currently identical across Colaberry
 * Training, Colaberry Enterprise and everything else.
 *
 * Any UI that renders these inside a brand-scoped page MUST say so. A rules
 * editor sitting under a brand selector implies it edits that brand's rules; if
 * it silently edits everyone's, an operator changing Enterprise's voice would
 * change Training's too and be told nothing. That is the same class of error as
 * serving one brand's learners under another's name, which is the failure this
 * whole workstream exists to prevent.
 *
 * Making the rules brand-keyed is the next increment and needs storage work, not
 * a client change. Until it lands, the notice is the honest answer.
 *
 * ─── THE SAMPLE SPENDS MODEL CALLS AND WRITES NOTHING ───────────────────────
 *
 * `runBrainSample` renders real drafts through the production path with the
 * writers removed: `commitDraft` and `recommitDraft` are replaced with an
 * in-memory capture, and `enqueueForApproval` is `undefined`, so no
 * `scheduled_emails` row, no decision stamp and no approval row is created.
 * Verified from `drafts/brainSample.ts` rather than from its comment: those are
 * the only three write-capable members of `DraftRenderDeps`, and the remaining
 * fifteen are loaders, one model call, or pure validators.
 *
 * It does cost tokens - capped at 5 people x 3 emails - and the route is
 * `requireFullAdmin` for that reason. The 300s timeout below is not generosity;
 * fifteen sequential model calls genuinely take minutes.
 */


const BRAIN = '/api/admin/maya-brain';

export type BrainShelf = 'builder_spotlight' | 'build_prompt' | 'ai_fact' | 'community_pulse' | 'live_event';

export interface MayaBrainRules {
  explorerVoice: string;
  neverSay: string[];
  rotation: Array<{ piece: BrainShelf; enabled: boolean }>;
  brainPickMinHours: number;
  weekAhead: boolean;
  openHouseHold: true;
}

export interface BrainInventory {
  builders: Array<{ id?: string; name: string; role: string | null; title: string; url: string }>;
  events: Array<{ id: string; title: string; when: string; openHouse: boolean }>;
  communityThemes: Array<{ id: string; label: string; count: number }>;
  aiFacts: Array<{ id: string; title: string; source: string | null; expires_at: string | null }>;
  buildPrompts: Array<{ id: string; title: string; source: string | null; expires_at: string | null }>;
  weekAhead: { id: string | null; block: string };
  unavailable: string[];
}

export interface BrainGivenRow { recipient_masked: string; date: string | null; shelf: string; item_id: string | null; status: string }

/**
 * Whose rules came back: this brand's own, the shared set, or the built-in
 * defaults. The UI has to say which. An operator who believes they are editing
 * Colaberry Enterprise's voice, while actually looking at the global set, will
 * save it to Enterprise and conclude nothing happened - or assume it changed
 * for everyone and stop checking.
 */
export type BrainRulesSource = 'brand' | 'global' | 'default';

export interface BrainControl {
  rules: MayaBrainRules;
  rules_problems: string[];
  rules_stored: boolean;
  rules_source: BrainRulesSource;
  /** Echoed by the server, so a response cannot be read as another brand's. */
  brand_id: string | null;
  hard_rules: string;
  send_enabled: boolean | null;
  inventory: BrainInventory | null;
  given: BrainGivenRow[];
}

export interface BrainItemRow {
  id: string; kind: 'ai_fact' | 'build_prompt'; title: string; body: string;
  source_url: string | null; source_label: string | null; status: 'draft' | 'approved' | 'retired';
  test_build_status: 'pending' | 'passed' | 'failed'; expires_at: string | null;
}

export interface BrainSnapshot {
  profile?: string;
  memory_excerpt?: string;
  piece?: { shelf: string; item_id: string | null; empty: boolean; block: string; allowed_links: string[] };
  earlier_emails?: Array<{ subject: string; date: string | null }>;
  screen?: { passed: boolean; issues: string[]; overlap_pct: number };
}

export interface BrainSampleEmail {
  date: string; status: string; reason: string | null; issues: string[];
  subject: string | null; html: string | null; snapshot: BrainSnapshot | null;
}

export interface BrainSampleResult {
  generated_at: string;
  people: Array<{ recipient_masked: string; action: string | null; emails: BrainSampleEmail[] }>;
  note: string;
}

/**
 * The brand is OPTIONAL and omitted by default, which reads the shared set.
 * That is what Explorer Growth's own page has always done, so its Brain tab is
 * unchanged by this without being edited.
 */
export async function getBrainControl(brandId: string | null = null): Promise<BrainControl> {
  const { data } = await api.get<BrainControl>(`${BRAIN}/control`, {
    params: params({ brand_id: brandId ?? undefined }),
  });
  return data;
}

/**
 * Saves to ONE brand, or to the shared set when no brand is given.
 *
 * The server echoes the brand it wrote, and that is what this returns alongside
 * the rules: a client that reported "saved" against the brand it *meant* to
 * write, rather than the one the server actually wrote, would hide exactly the
 * bug worth catching.
 */
export async function saveBrainRules(
  rules: MayaBrainRules,
  brandId: string | null = null
): Promise<{ rules: MayaBrainRules; brand_id: string | null }> {
  const { data } = await api.put<{ rules: MayaBrainRules; brand_id: string | null }>(
    `${BRAIN}/rules`,
    rules,
    { params: params({ brand_id: brandId ?? undefined }) }
  );
  return { rules: data.rules, brand_id: data.brand_id ?? null };
}

export async function listBrainItems(q: { kind?: 'ai_fact' | 'build_prompt'; status?: string } = {}): Promise<BrainItemRow[]> {
  const { data } = await api.get<{ items: BrainItemRow[] }>(`${BRAIN}/items`, { params: params(q) });
  return data.items;
}

export async function addAiFact(input: { title: string; body: string; source_url?: string | null; source_label?: string | null }): Promise<BrainItemRow> {
  const { data } = await api.post<{ item: BrainItemRow }>(`${BRAIN}/items`, { kind: 'ai_fact', ...input });
  return data.item;
}

export async function approveBrainItem(id: string): Promise<BrainItemRow> {
  const { data } = await api.post<{ item: BrainItemRow }>(`${BRAIN}/items/${id}/approve`, {});
  return data.item;
}

export async function retireBrainItem(id: string): Promise<BrainItemRow> {
  const { data } = await api.post<{ item: BrainItemRow }>(`${BRAIN}/items/${id}/retire`, {});
  return data.item;
}

export async function runBrainSample(people = 3, emailsEach = 3): Promise<BrainSampleResult> {
  const { data } = await api.post<BrainSampleResult>(`${BRAIN}/sample`, { people, emails_each: emailsEach }, { timeout: 300_000 });
  return data;
}
