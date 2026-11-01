/**
 * govOpportunitySweep — gov pursuit DAILY SWEEP (PR 2 of the vetting pipeline).
 *
 * Once a day it: (1) auto-HIDES low-fit discovery rows from the team feed, SILENTLY; (2) emails the DRI the
 * good-fit rows that still need their requirements uploaded (linking to the Qualify workspace); (3) emails the
 * DRI the rows whose qualification has started but is not yet approved, to vet + assign. It drives the vetting
 * ladder from the feed; it NEVER approves or assigns on its own.
 *
 * Ships DARK behind FLAGS.govOpportunitySweep (ENABLE_GOV_OPP_SWEEP) — distinct from govDailySync (tracking only),
 * so registering/deploying it changes nothing until switched on. Idempotent: a once-per-day slot claim guards the
 * multiple prod scheduler instances (one send per day), and the hide reuses the dismissals table (reversible). The
 * classifiers below are pure and unit-tested; fail-closed on a feed/container error (does nothing).
 */
import { QueryTypes } from 'sequelize';
import { FLAGS } from '../../../config/featureFlags';
import { loadVettingByCanonical, canonicalForUuid, type VettingStage } from '../govOpportunityVetting';

/** Ali: hide opportunities with fit strictly below this, silently. */
export const AUTO_HIDE_FIT_BELOW = 60;
const AUTO_HIDE_REASON = 'auto_fit_below_threshold';
const RUN_LOG_KEY = 'gov_opp_sweep_run_log';
const APP_BASE = process.env.APP_PUBLIC_BASE || 'https://enterprise.colaberry.ai';

export interface SweepOpportunity { uuid: string; title: string; agency: string; fitScore: number | null; sourceUrl?: string | null; }

const stageOf = (m: Map<string, VettingStage>, uuid: string): VettingStage => m.get(uuid) ?? 'not_vetted';

/** The Qualify-workspace link for an opportunity — the exact URL the discovery page's "Qualify" button uses. */
export const qualifyUrl = (uuid: string): string =>
  `${APP_BASE}/admin/gov-qualification?gws=${encodeURIComponent('gws:' + uuid)}`;

/**
 * PURE. Rows to auto-hide: fit strictly below the threshold, not already dismissed, and NOT already being
 * qualified (a started qualification must not be hidden out from under whoever is working it).
 */
export function toAutoHide(
  opps: SweepOpportunity[], alreadyDismissed: Set<string>, stageByUuid: Map<string, VettingStage>,
  threshold: number = AUTO_HIDE_FIT_BELOW,
): SweepOpportunity[] {
  return opps.filter((o) => typeof o.fitScore === 'number' && o.fitScore < threshold
    && !alreadyDismissed.has(o.uuid) && stageOf(stageByUuid, o.uuid) === 'not_vetted');
}

/** PURE. Survived the hide (fit >= threshold, not dismissed) and has no qualification yet → needs requirements. */
export function needsRequirements(
  opps: SweepOpportunity[], alreadyDismissed: Set<string>, stageByUuid: Map<string, VettingStage>,
  threshold: number = AUTO_HIDE_FIT_BELOW,
): SweepOpportunity[] {
  return opps.filter((o) => typeof o.fitScore === 'number' && o.fitScore >= threshold
    && !alreadyDismissed.has(o.uuid) && stageOf(stageByUuid, o.uuid) === 'not_vetted');
}

const PENDING_VET: readonly VettingStage[] = ['needs_requirements', 'in_review', 'awaiting_approval'];

/** PURE. A qualification exists but is not yet approved/assigned → ready to vet + assign. */
export function needsVetting(
  opps: SweepOpportunity[], alreadyDismissed: Set<string>, stageByUuid: Map<string, VettingStage>,
): SweepOpportunity[] {
  return opps.filter((o) => !alreadyDismissed.has(o.uuid) && PENDING_VET.includes(stageOf(stageByUuid, o.uuid)));
}

const esc = (s: string): string => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** The external Bonfire solicitation link for a row, when the feed supplied one (http(s) only, so a stray
 *  scheme can never become a link). Rendered as a secondary link beside the in-app Qualify CTA so the recipient
 *  can open the source solicitation on Bonfire directly. */
const bonfireLink = (o: SweepOpportunity): string =>
  typeof o.sourceUrl === 'string' && /^https?:\/\//i.test(o.sourceUrl)
    ? ` &nbsp;·&nbsp; <a href="${esc(o.sourceUrl)}" style="color:#5b6472">View on Bonfire &rarr;</a>`
    : '';

function renderList(rows: SweepOpportunity[], cta: (o: SweepOpportunity) => string): string {
  const items = rows.map((o) => `<li style="margin:0 0 10px"><strong>${esc(o.title)}</strong>`
    + `<br><span style="color:#5b6472;font-size:13px">${esc(o.agency)}${typeof o.fitScore === 'number' ? ` · fit ${o.fitScore}` : ''}</span>`
    + `<br>${cta(o)}${bonfireLink(o)}</li>`).join('');
  return `<ul style="list-style:none;padding:0;margin:0">${items}</ul>`;
}

/** Email #1: good-fit opportunities that need their requirements uploaded for the 2nd-round checks. */
export function renderUploadEmail(rows: SweepOpportunity[]): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a2230;max-width:640px">`
    + `<h2 style="font-size:18px">Gov pursuit: ${rows.length} opportunit${rows.length === 1 ? 'y needs' : 'ies need'} requirements uploaded</h2>`
    + `<p style="color:#5b6472">These are good-fit (fit &ge; ${AUTO_HIDE_FIT_BELOW}) and not yet qualified. Open each one to upload the solicitation and pull in its requirements for the 2nd-round checks.</p>`
    + renderList(rows, (o) => `<a href="${qualifyUrl(o.uuid)}" style="color:#1557b0">Upload requirements &rarr;</a>`)
    + `</div>`;
}

/** Email #2: opportunities whose qualification has started but is not yet approved — vet + assign. */
export function renderVetEmail(rows: SweepOpportunity[]): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a2230;max-width:640px">`
    + `<h2 style="font-size:18px">Gov pursuit: ${rows.length} opportunit${rows.length === 1 ? 'y is' : 'ies are'} ready to vet + assign</h2>`
    + `<p style="color:#5b6472">These have a qualification in progress. Review the requirements and, if approved, assign a builder.</p>`
    + renderList(rows, (o) => `<a href="${qualifyUrl(o.uuid)}" style="color:#1557b0">Vet &amp; assign &rarr;</a>`)
    + `</div>`;
}

export interface SweepResult { skipped?: string; hidden: number; emailedUpload: number; emailedVet: number; }

/** Claim the once-per-day run slot (guards the multiple prod scheduler instances). Central-time day key. */
async function claimDailyRun(): Promise<boolean> {
  const { sequelize } = await import('../../../config/database');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await sequelize.query(
    `INSERT INTO system_settings (id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), :k, '{}'::jsonb, NOW(), NOW()) ON CONFLICT (key) DO NOTHING`,
    { replacements: { k: RUN_LOG_KEY } });
  const claimed = await sequelize.query(
    `UPDATE system_settings SET value = jsonb_set(COALESCE(value,'{}'::jsonb), ARRAY['lastRun'], to_jsonb(:today::text), true), updated_at = NOW()
      WHERE key = :k AND COALESCE(value->>'lastRun','') <> :today RETURNING key`,
    { replacements: { k: RUN_LOG_KEY, today }, type: QueryTypes.SELECT });
  return Array.isArray(claimed) && claimed.length > 0;
}

/**
 * The daily runner. Ships dark (FLAGS.govOpportunitySweep). Fail-closed: on a feed or container error it does
 * nothing and reports why. Never throws past its own boundary.
 */
export async function runGovOpportunitySweep(): Promise<SweepResult> {
  const nil: SweepResult = { hidden: 0, emailedUpload: 0, emailedVet: 0 };
  if (!FLAGS.govOpportunitySweep) return { ...nil, skipped: 'disabled' };
  if (!(await claimDailyRun())) return { ...nil, skipped: 'already_ran_today' };

  const { fetchBestFitOpportunities } = await import('./oppPulseClient');
  const { lookupGovContractsContainer } = await import('../../../scripts/lib/factoryDemoContainer');
  const { listActiveDismissedKeys, dismissOpportunity } = await import('./govOpportunityDismissals');
  const { sendGovOpportunitySweepEmail } = await import('../../emailService');

  let feed: any[] = [];
  try { const res: any = await fetchBestFitOpportunities(); feed = Array.isArray(res?.opportunities) ? res.opportunities : []; }
  catch { return { ...nil, skipped: 'feed_unavailable' }; }

  const container: any = await lookupGovContractsContainer();
  if (!container) return { ...nil, skipped: 'no_container' };
  const tenantId = container.tenant.id;

  const opps: SweepOpportunity[] = feed
    .filter((o) => o && o.uuid)
    .map((o) => ({ uuid: String(o.uuid), title: String(o.title ?? ''), agency: String(o.agency ?? ''), fitScore: typeof o.fitScore === 'number' ? o.fitScore : null,
      sourceUrl: typeof o.sourceUrl === 'string' && o.sourceUrl.trim() ? o.sourceUrl : null }));

  const dismissed = await listActiveDismissedKeys(tenantId);
  const vetting = await loadVettingByCanonical(tenantId, opps.map((o) => canonicalForUuid(o.uuid)));
  const stageByUuid = new Map<string, VettingStage>(opps.map((o) => [o.uuid, vetting.get(canonicalForUuid(o.uuid))?.stage ?? 'not_vetted']));

  // 1) Auto-hide low-fit (silent), reversible via the dismissals table.
  const hide = toAutoHide(opps, dismissed, stageByUuid);
  for (const o of hide) {
    try {
      await dismissOpportunity({
        tenantId, organizationId: container.org.id, opportunityKey: o.uuid,
        title: o.title, agency: o.agency, reason: AUTO_HIDE_REASON, dismissedBy: 'gov-opp-sweep',
      });
    } catch { /* best-effort per row; a hide failure must not abort the sweep */ }
  }

  // 2) Email #1 — upload requirements (only when there is something to report).
  const upload = needsRequirements(opps, dismissed, stageByUuid);
  if (upload.length > 0) {
    await sendGovOpportunitySweepEmail({
      subject: `Gov pursuit: ${upload.length} opportunit${upload.length === 1 ? 'y needs' : 'ies need'} requirements uploaded`,
      html: renderUploadEmail(upload),
    });
  }

  // 3) Email #2 — vet + assign.
  const vet = needsVetting(opps, dismissed, stageByUuid);
  if (vet.length > 0) {
    await sendGovOpportunitySweepEmail({
      subject: `Gov pursuit: ${vet.length} opportunit${vet.length === 1 ? 'y is' : 'ies are'} ready to vet + assign`,
      html: renderVetEmail(vet),
    });
  }

  return { hidden: hide.length, emailedUpload: upload.length, emailedVet: vet.length };
}
