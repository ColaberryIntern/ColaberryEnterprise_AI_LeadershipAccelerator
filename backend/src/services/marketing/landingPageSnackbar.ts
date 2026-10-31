import { z } from 'zod';
import { esc } from '../classKit/kitRenderUtils';

/**
 * The landing-page snack bar: whether a page shows one, with what settings, and the markup the
 * renderer adds when it does.
 *
 * ON FOR EVERY PAGE BUILT AFTERWARDS. The switch lives on the BRAND
 * (`brands.snackbar_default_enabled`) and each page may override it
 * (`landing_pages.snackbar_enabled`: true / false / NULL = follow the brand). A new page is
 * created with NULL, so turning the brand default on covers every page that brand builds from
 * then on, with no step for the operator to forget. Same idea as `brands.meta_pixel_id`.
 *
 * SETTINGS ARE ZOD-VALIDATED AT BOTH ENDS. `landing_pages.snackbar_config` is JSONB because the
 * shape will grow (more event kinds), but it is parsed here on every read as well as on write,
 * so a row written by some other path renders with defaults rather than with garbage.
 */

export const SNACKBAR_EVENT_KINDS = ['signup', 'module_started', 'daily_count'] as const;
export type SnackbarEventKind = (typeof SNACKBAR_EVENT_KINDS)[number];

/**
 * How a person is named on a public page.
 * - `city_only`   "Someone in Plano, TX". Default: shows no name at all.
 * - `first_initial` "Jordan R. from Plano, TX" for people who opted in at signup; everyone else
 *                   still appears as "Someone in <city>".
 * - `opted_in_only` Like first_initial, but people who did not opt in are not shown at all.
 */
export const SNACKBAR_NAME_FORMATS = ['city_only', 'first_initial', 'opted_in_only'] as const;

export const snackbarConfigSchema = z.object({
  events: z.array(z.enum(SNACKBAR_EVENT_KINDS)).min(1).max(3).default(['signup']),
  name_format: z.enum(SNACKBAR_NAME_FORMATS).default('city_only'),
  window_hours: z.number().int().min(1).max(24 * 30).default(72),
  first_delay_s: z.number().int().min(0).max(60).default(3),
  interval_s: z.number().int().min(4).max(120).default(8),
  /** The daily-count card is shown only when today's REAL count is at least this. */
  daily_min: z.number().int().min(1).max(100000).default(10),
}).strict();

export type SnackbarConfig = z.infer<typeof snackbarConfigSchema>;

export const DEFAULT_SNACKBAR_CONFIG: SnackbarConfig = snackbarConfigSchema.parse({});

/** Never throws: an unparseable stored config renders with defaults, and the caller logs it. */
export function parseSnackbarConfig(raw: unknown): { config: SnackbarConfig; ok: boolean } {
  const parsed = snackbarConfigSchema.safeParse(raw ?? {});
  return parsed.success
    ? { config: parsed.data, ok: true }
    : { config: DEFAULT_SNACKBAR_CONFIG, ok: false };
}

/** Page override wins; NULL/undefined follows the brand; a brand with no setting is OFF. */
export function isSnackbarEnabled(
  brandDefault: boolean | null | undefined,
  pageOverride: boolean | null | undefined,
): boolean {
  if (pageOverride === true || pageOverride === false) return pageOverride;
  return brandDefault === true;
}

export interface SnackbarRenderInput {
  brandSlug: string;
  pageSlug: string;
  config: SnackbarConfig;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/;

/**
 * The script tag. Same-origin file under `script-src 'self'`, so the page CSP is unchanged.
 * Slugs are re-checked here even though the route validated them: this string goes into an
 * attribute on a public page.
 */
export function snackbarScriptTag(input: SnackbarRenderInput): string {
  if (!SLUG.test(input.brandSlug) || !SLUG.test(input.pageSlug)) return '';
  const feed = `/v1/lp-activity/${input.brandSlug}/${input.pageSlug}`;
  return `<script src="/v1/snackbar.js" data-feed="${esc(feed)}" data-interval="${input.config.interval_s}" data-delay="${input.config.first_delay_s}" defer></script>`;
}

/**
 * Styles, emitted inside the page's existing <style> block only when the bar is on.
 * Uses the brand theme variables the renderer already sets, so every brand gets its own colours.
 */
export const SNACKBAR_STYLES = `
.cb-snack{position:fixed;left:24px;bottom:24px;z-index:60;width:372px;max-width:calc(100vw - 32px);box-sizing:border-box;
  display:flex;gap:12px;align-items:flex-start;padding:14px 10px 14px 16px;border-radius:16px;
  background:var(--bg-elevated,#fff);color:var(--fg,#16161d);border:1px solid var(--line,#ededf0);
  box-shadow:0 18px 40px rgba(22,22,29,.18);opacity:0;transform:translateY(16px);pointer-events:none;
  transition:opacity .35s ease,transform .35s ease}
.cb-snack.is-visible{opacity:1;transform:none;pointer-events:auto}
.cb-snack__avatar{flex:none;width:44px;height:44px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
  font-weight:700;font-size:15px;background:var(--accent,#c8202f);color:var(--accent-contrast,#fff)}
.cb-snack__avatar[data-kind="module_started"]{background:var(--fg,#16161d);color:var(--bg,#fff)}
.cb-snack__body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.cb-snack__title{font-weight:600;font-size:15px}
.cb-snack__action{font-size:14px;color:var(--fg-muted,#3b3b46)}
.cb-snack__meta{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:var(--fg-muted,#5a5a66)}
.cb-snack__dot{width:8px;height:8px;border-radius:50%;background:#16a34a;animation:cbSnackPulse 1.8s infinite}
.cb-snack__close{flex:none;width:44px;height:44px;margin:-6px -2px 0 0;border:0;background:transparent;border-radius:10px;
  color:var(--fg-muted,#5a5a66);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.cb-snack__close svg{fill:none;stroke:currentColor;stroke-width:2}
.cb-snack__close:focus-visible{outline:2px solid var(--accent,#c8202f);outline-offset:2px}
@keyframes cbSnackPulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.55)}70%{box-shadow:0 0 0 8px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}
@media (max-width:600px){.cb-snack{left:12px;right:12px;bottom:84px;width:auto;max-width:none}}
@media (prefers-reduced-motion:reduce){.cb-snack{transition:none}.cb-snack__dot{animation:none}}
`;
