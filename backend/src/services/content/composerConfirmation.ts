import type { ContentItemStatus } from '../../models/ContentItem';
import type { ContentApprovalStatus } from '../../models/ContentApprovalRequest';
import { decidePublishMode, getProviderCapabilities, type ProviderKey } from '../publishing/providerCapabilities';
import type { VariantProblem } from './composerValidation';

/**
 * composerConfirmation — the final confirmation (spec 8.1 step 10), built PURE.
 *
 * What the operator sees before committing is the last moment a mistake is cheap, so every
 * field on the surface is assembled here from data the route already loaded, and nothing is
 * looked up or inferred at render time. The spec names the fields: brand, accounts, local and
 * UTC time, copy, assets, links, approval status. All of them are on `ConfirmationSummary`,
 * and the test asserts each one is present rather than trusting the type.
 *
 * TWO TIMES, NOT ONE. A schedule shows the UTC instant and the brand-local reading of that
 * same instant, side by side, because the calendar grid is in the viewer's zone and the post
 * goes out in the audience's. For a brand in America/Chicago those two readings differ by
 * five or six hours depending on the date, and the only way the operator catches "that is
 * 3 AM for the audience" is by seeing both. Conversion goes through the platform's timezone
 * database (Intl), never wall-clock arithmetic - the same rule the calendar (T023) follows.
 *
 * ACCOUNTS ARE NOT CONNECTED. `accounts[].account` is null for every provider until ESC-001
 * (credential encryption) is resolved and T003 lands. The confirmation says so per row rather
 * than hiding the column, because a confirmation that omits the account is one an operator
 * will sign off on without noticing that nothing is wired to receive the post.
 */

export const DEFAULT_BRAND_TIMEZONE = 'America/Chicago';

export interface LocalTime {
  /** YYYY-MM-DD in the brand's zone. */
  day: string;
  /** e.g. "9:00 AM" */
  time: string;
  /** e.g. "CDT" / "CST" - the short zone name in force at that instant. */
  zone: string;
  /** e.g. "-05:00" */
  offset: string;
  /** e.g. "Sat, Oct 31" */
  dayLabel: string;
}

function parts(ms: number, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** The brand-local reading of a UTC instant. Null for an unparseable instant or zone. */
export function brandLocalTime(utcIso: string, timeZone: string): LocalTime | null {
  const ms = Date.parse(utcIso);
  if (Number.isNaN(ms)) return null;
  try {
    const d = parts(ms, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
    const o = parts(ms, timeZone, { timeZoneName: 'longOffset' });
    const l = parts(ms, timeZone, { weekday: 'short', month: 'short', day: 'numeric' });
    const rawOffset = o.timeZoneName ?? 'GMT';
    return {
      day: `${d.year}-${d.month}-${d.day}`,
      time: `${d.hour}:${d.minute} ${d.dayPeriod}`,
      zone: d.timeZoneName ?? timeZone,
      offset: rawOffset === 'GMT' ? '+00:00' : rawOffset.replace('GMT', ''),
      dayLabel: `${l.weekday}, ${l.month} ${l.day}`,
    };
  } catch {
    return null;
  }
}

// ── Inputs: plain data the route assembles from rows ─────────────────────────────────────

export interface ConfirmationItem {
  id: string;
  title: string;
  status: ContentItemStatus;
  content_type: string;
  scheduled_for: string | null;
  human_approved: boolean;
  revision: number;
}

export interface ConfirmationBrand {
  id: string;
  name: string;
  timezone: string | null;
}

export interface ConfirmationCampaign {
  id: string;
  name: string;
  utm_campaign_slug: string | null;
}

export interface ConfirmationVariant {
  provider: ProviderKey;
  body: string;
  is_manually_edited: boolean;
  stale: boolean;
  link_url: string | null;
}

export interface ConfirmationLink {
  provider: ProviderKey;
  short_url: string;
  final_url: string;
  utm: Record<string, string>;
}

export interface ConfirmationAsset {
  id: string;
  filename: string | null;
  mime_type: string;
  alt_text: string | null;
  position: number;
}

export interface ConfirmationApprovalRequest {
  status: ContentApprovalStatus;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface ConfirmationValidation {
  ok: boolean;
  blockers: VariantProblem[];
}

export interface ConfirmationInput {
  item: ConfirmationItem;
  brand: ConfirmationBrand | null;
  campaign: ConfirmationCampaign | null;
  variants: readonly ConfirmationVariant[];
  links: readonly ConfirmationLink[];
  assets: readonly ConfirmationAsset[];
  /** The most recent approval request, or null if none was ever made. */
  approval: ConfirmationApprovalRequest | null;
  /** Null when validation has not been run for the current revision. */
  validation: ConfirmationValidation | null;
}

// ── Output: exactly what the surface renders ─────────────────────────────────────────────

export type PublishModeLabel = 'direct' | 'handoff';

export interface ConfirmationAccount {
  provider: ProviderKey;
  displayName: string;
  mode: PublishModeLabel;
  /** Why this provider is a handoff rather than a direct publish. Empty for direct. */
  reasons: string[];
  /** Always null until account connection (T003) exists. Stated, not hidden. */
  account: null;
}

export interface ConfirmationSchedule {
  utc: string;
  /** e.g. "2026-11-01 14:30 UTC" */
  utcLabel: string;
  local: LocalTime;
  timezone: string;
  /** True when the brand-local wall-clock reading differs from the UTC one - any non-UTC brand. */
  differsFromUtc: boolean;
}

export type ApprovalLabel =
  | 'Not requested'
  | 'Awaiting review'
  | 'Approved'
  | 'Changes requested'
  | 'Rejected'
  | 'Approval invalidated by a later edit'
  | 'Withdrawn';

export interface ConfirmationSummary {
  item: { id: string; title: string; status: ContentItemStatus; contentType: string; revision: number };
  brand: { id: string; name: string; timezone: string; timezoneSource: 'brand' | 'default' } | null;
  campaign: { id: string; name: string; slug: string | null } | null;
  accounts: ConfirmationAccount[];
  /** Null when no time is set - "publish now" and "save draft" have no schedule. */
  schedule: ConfirmationSchedule | null;
  copy: Array<{ provider: ProviderKey; text: string; source: 'generated' | 'edited'; stale: boolean; chars: number }>;
  assets: Array<{ id: string; filename: string | null; mimeType: string; altText: string | null; position: number }>;
  links: Array<{ provider: ProviderKey; shortUrl: string; finalUrl: string; utm: Record<string, string> }>;
  /** Providers whose variant has no tracked link yet. Shown, because an untracked post is unattributable. */
  linkGaps: ProviderKey[];
  approval: {
    label: ApprovalLabel;
    itemStatus: ContentItemStatus;
    humanApproved: boolean;
    request: ConfirmationApprovalRequest | null;
  };
  validation: { ran: boolean; ok: boolean; blockerCount: number; blockers: VariantProblem[] };
  /** What the action buttons are allowed to do, with the reason for each refusal. */
  readiness: {
    canSaveDraft: boolean;
    canSendForApproval: boolean;
    canSchedule: boolean;
    canPublishNow: boolean;
    reasons: string[];
  };
}

function approvalLabel(item: ConfirmationItem, request: ConfirmationApprovalRequest | null): ApprovalLabel {
  if (!request) return 'Not requested';
  switch (request.status) {
    case 'pending': return 'Awaiting review';
    case 'approved': return 'Approved';
    case 'changes_requested': return 'Changes requested';
    case 'rejected': return 'Rejected';
    case 'invalidated': return 'Approval invalidated by a later edit';
    case 'withdrawn': return 'Withdrawn';
    default: return 'Not requested';
  }
}

function utcLabel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function buildConfirmation(input: ConfirmationInput): ConfirmationSummary {
  const { item, brand, campaign, variants, links, assets, approval, validation } = input;

  const timezone = brand?.timezone ?? DEFAULT_BRAND_TIMEZONE;
  const timezoneSource: 'brand' | 'default' = brand?.timezone ? 'brand' : 'default';

  const accounts: ConfirmationAccount[] = variants.map((v) => {
    const caps = getProviderCapabilities(v.provider);
    const decision = decidePublishMode(caps, 'publish');
    return {
      provider: v.provider,
      displayName: caps.displayName,
      mode: decision.mode,
      reasons: decision.mode === 'handoff' ? decision.reasons : [],
      account: null,
    };
  });

  let schedule: ConfirmationSchedule | null = null;
  if (item.scheduled_for) {
    const local = brandLocalTime(item.scheduled_for, timezone);
    if (local) {
      const utcSide = brandLocalTime(item.scheduled_for, 'UTC');
      schedule = {
        utc: new Date(item.scheduled_for).toISOString(),
        utcLabel: utcLabel(item.scheduled_for),
        local,
        timezone,
        differsFromUtc: !utcSide || utcSide.day !== local.day || utcSide.time !== local.time,
      };
    }
  }

  const linked = new Set(links.map((l) => l.provider));
  const linkGaps = variants.map((v) => v.provider).filter((p) => !linked.has(p));

  const ran = validation !== null;
  const blockers = validation?.blockers ?? [];
  const validationOk = ran && validation!.ok;

  const reasons: string[] = [];
  const hasVariants = variants.length > 0;
  if (!hasVariants) reasons.push('No platform variants have been generated.');
  if (!ran) reasons.push('Validation has not been run for this revision.');
  else if (!validationOk) reasons.push(`${blockers.length} validation blocker${blockers.length === 1 ? '' : 's'} must be fixed.`);
  if (linkGaps.length > 0) reasons.push(`${linkGaps.length} variant${linkGaps.length === 1 ? ' has' : 's have'} no tracked link.`);

  const clean = hasVariants && validationOk;
  const canSendForApproval = clean && (item.status === 'draft' || item.status === 'changes_requested');
  const isApproved = item.status === 'approved';
  if (!isApproved && (item.status === 'draft' || item.status === 'ready_for_review' || item.status === 'changes_requested')) {
    reasons.push(`Publishing needs an approved item; this one is ${item.status.replace(/_/g, ' ')}.`);
  }
  const canSchedule = clean && isApproved && item.scheduled_for !== null;
  if (isApproved && item.scheduled_for === null) reasons.push('Set a time to schedule, or publish now.');
  const canPublishNow = clean && isApproved;

  return {
    item: { id: item.id, title: item.title, status: item.status, contentType: item.content_type, revision: item.revision },
    brand: brand ? { id: brand.id, name: brand.name, timezone, timezoneSource } : null,
    campaign: campaign ? { id: campaign.id, name: campaign.name, slug: campaign.utm_campaign_slug } : null,
    accounts,
    schedule,
    copy: variants.map((v) => ({
      provider: v.provider,
      text: v.body,
      source: v.is_manually_edited ? 'edited' : 'generated',
      stale: v.stale,
      chars: v.body.length,
    })),
    assets: assets.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mime_type, altText: a.alt_text, position: a.position })),
    links: links.map((l) => ({ provider: l.provider, shortUrl: l.short_url, finalUrl: l.final_url, utm: l.utm })),
    linkGaps,
    approval: { label: approvalLabel(item, approval), itemStatus: item.status, humanApproved: item.human_approved, request: approval },
    validation: { ran, ok: validationOk, blockerCount: blockers.length, blockers },
    readiness: {
      canSaveDraft: item.status !== 'archived',
      canSendForApproval,
      canSchedule,
      canPublishNow,
      reasons,
    },
  };
}
