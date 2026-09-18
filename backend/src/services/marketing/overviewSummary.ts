import { Op } from 'sequelize';
import { Brand, ContentItem, ContentVariant, ExternalPublication } from '../../models';
import { listAccounts } from './channelAccountService';
import { PROVIDER_KEYS, type ProviderKey } from '../publishing/providerCapabilities';
import {
  accountHealth, accessTokenExpiry, canPublish, daysUntil, handoffProviders, isLate,
  type AccountHealth,
} from './overviewHealth';

/**
 * overviewSummary - everything the Marketing Overview needs, in one request.
 *
 * This file does I/O and defers every judgement to `overviewHealth`, the same split
 * needsAttentionService uses. The reason it exists at all: the Overview answers four questions
 * that previously required four different pages, and answering them by having the browser call
 * /api/admin/content four times with four different statuses would both cost four round trips
 * and get the order wrong - that endpoint sorts by `updated_at DESC` and takes a single status,
 * so "the next three posts going out" is not a query it can express.
 */

/** How far ahead the Overview looks. Beyond this is the calendar's job, not the front page's. */
export const UPCOMING_WINDOW_DAYS = 14;
/** How many upcoming posts the panel shows before deferring to the calendar. */
export const UPCOMING_LIMIT = 5;
/** The window the footer summarises. */
export const RECENT_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OverviewScope {
  tenantIds: string[] | null;
  brandId?: string | null;
}

export interface UpcomingPost {
  id: string;
  title: string;
  brand_id: string | null;
  brand_name: string | null;
  scheduled_for: string;
  status: string;
  providers: ProviderKey[];
  /** Past due and still not published. Rendered in the warning colour, not as a normal row. */
  late: boolean;
}

export interface AccountRow {
  id: string;
  brand_id: string | null;
  brand_name: string | null;
  provider: string;
  display_name: string;
  health: AccountHealth;
  token_expires_at: string | null;
  expires_in_days: number | null;
}

export interface OverviewSummary {
  upcoming: UpcomingPost[];
  /** True when more posts are scheduled in the window than the panel shows. */
  upcoming_truncated: boolean;
  accounts: AccountRow[];
  /** Networks with no account that can publish today - these are posted by hand. */
  handoff_providers: ProviderKey[];
  recent: {
    published: number;
    since: string;
    window_days: number;
  };
}

/** Brand id -> name, for the handful of brands the rows actually reference. */
async function brandNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const brands = await Brand.findAll({ where: { id: { [Op.in]: unique } }, attributes: ['id', 'name'] });
  return new Map(brands.map((b) => [b.id, b.name]));
}

function scopeWhere(scope: OverviewScope): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  // An empty allow-list means "no tenants", never "every tenant" - the same early guard
  // listAccounts uses. A scoped caller with no memberships must read nothing.
  if (scope.tenantIds) where.tenant_id = { [Op.in]: scope.tenantIds };
  if (scope.brandId) where.brand_id = scope.brandId;
  return where;
}

/**
 * The posts about to go out, soonest first.
 *
 * Includes `publishing` alongside `scheduled` deliberately: a post mid-flight is the one an
 * operator most wants to see, and dropping it the moment the worker picks it up would make the
 * panel appear to lose posts.
 */
async function upcomingPosts(scope: OverviewScope, now: Date): Promise<{ rows: UpcomingPost[]; truncated: boolean }> {
  const horizon = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS);
  const where = {
    ...scopeWhere(scope),
    archived_at: null,
    status: { [Op.in]: ['scheduled', 'publishing'] },
    scheduled_for: { [Op.ne]: null, [Op.lte]: horizon },
  };
  // One extra row, so "there are more" is known without a second count query.
  const items = await ContentItem.findAll({
    where, order: [['scheduled_for', 'ASC']], limit: UPCOMING_LIMIT + 1,
  });

  const shown = items.slice(0, UPCOMING_LIMIT);
  const names = await brandNames(shown.map((i) => i.brand_id ?? '').filter(Boolean));
  const variants = shown.length
    ? await ContentVariant.findAll({
      where: { content_item_id: { [Op.in]: shown.map((i) => i.id) } },
      attributes: ['content_item_id', 'provider'],
    })
    : [];
  const byItem = new Map<string, ProviderKey[]>();
  for (const v of variants) {
    const list = byItem.get(v.content_item_id) ?? [];
    list.push(v.provider as ProviderKey);
    byItem.set(v.content_item_id, list);
  }

  return {
    rows: shown.map((item) => ({
      id: item.id,
      title: item.title,
      brand_id: item.brand_id,
      brand_name: item.brand_id ? names.get(item.brand_id) ?? null : null,
      scheduled_for: (item.scheduled_for as Date).toISOString(),
      status: item.status,
      providers: byItem.get(item.id) ?? [],
      late: isLate(item.scheduled_for as Date, now),
    })),
    truncated: items.length > UPCOMING_LIMIT,
  };
}

/** Every connected account with the one thing the Overview cares about: whether it still works. */
async function accountRows(scope: OverviewScope, now: Date): Promise<AccountRow[]> {
  const accounts = await listAccounts({
    tenantIds: scope.tenantIds,
    brandId: scope.brandId ?? null,
    includeRevoked: false,
  });
  const names = await brandNames(accounts.map((a) => a.brand_id ?? '').filter(Boolean));
  return accounts.map((a) => {
    const expiry = accessTokenExpiry(a);
    return {
      id: a.id,
      brand_id: a.brand_id,
      brand_name: a.brand_id ? names.get(a.brand_id) ?? null : null,
      provider: a.provider,
      display_name: a.display_name,
      health: accountHealth(a, now),
      token_expires_at: expiry ? expiry.toISOString() : null,
      expires_in_days: daysUntil(expiry, now),
    };
  });
}

/** How many posts actually reached a network in the window. Counts receipts, not intentions. */
async function publishedCount(scope: OverviewScope, since: Date): Promise<number> {
  return ExternalPublication.count({
    where: {
      ...scopeWhere(scope),
      published_at: { [Op.gte]: since },
      removed_at: null,
    },
  });
}

export async function getMarketingOverview(
  scope: OverviewScope,
  now: Date = new Date(),
): Promise<OverviewSummary> {
  const since = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);
  const [upcoming, accounts, published] = await Promise.all([
    upcomingPosts(scope, now),
    accountRows(scope, now),
    publishedCount(scope, since),
  ]);

  const usable = accounts.filter((a) => canPublish(a.health)).map((a) => a.provider);
  return {
    upcoming: upcoming.rows,
    upcoming_truncated: upcoming.truncated,
    accounts,
    handoff_providers: handoffProviders(PROVIDER_KEYS, usable) as ProviderKey[],
    recent: { published, since: since.toISOString(), window_days: RECENT_WINDOW_DAYS },
  };
}
