/**
 * W21 (Ali, 2026-11-17): "Create a free account should be in enterprise branding."
 *
 * /try is the company preview a business buyer reaches from enterprise.colaberry.ai. It is built
 * on the portal shell (TodayShell.css), which wears the Training brand: red accent, red-and-green
 * wordmark. This is a THEME over that shell, scoped to `.te-shell[data-brand="enterprise"]`, so
 * the real student portal, which shares TodayShell.css, cannot be touched by anything here.
 *
 * Same values as the enterprise sign-in (portalLoginEnterpriseStyles.ts) and the public site
 * (fidelityV5.css): accent #2E6A86, strong #245670, dark-ground mark #6F9DB6, soft ground
 * #EAF2F6, Space Grotesk for display type.
 *
 * WHY THE SEMANTIC TOKENS ARE RESTATED. `--brand-accent`, `--action-bg` and the rest are declared
 * on :root as var(--red-500), and a custom property is resolved where it is declared. Overriding
 * --red-500 on this subtree alone would leave them red, so each one the page reads is set here.
 *
 * ERRORS STAY RED: --status-danger is not overridden, so "that did not work" keeps its colour.
 */
import spaceGroteskUrl from '../components/publicV2/fonts/SpaceGrotesk-var.woff2';

export const MANAGEMENT_PREVIEW_ENTERPRISE_CSS = `
@font-face{
  font-family:'Space Grotesk V2';
  src:url(${spaceGroteskUrl}) format('woff2-variations'), url(${spaceGroteskUrl}) format('woff2');
  font-weight:300 700; font-style:normal; font-display:swap;
}
.te-shell[data-brand="enterprise"]{
  --red-400:#6F9DB6;
  --red-500:#2E6A86;
  --red-600:#2E6A86;
  --red-700:#245670;
  --cherry:#2E6A86;
  --cherry-deep:#245670;
  --cherry-text:#245670;
  --brand-primary:#2E6A86;
  --brand-accent:#2E6A86;
  --surface-brand:#2E6A86;
  --surface-brand-subtle:#EAF2F6;
  --border-brand:#2E6A86;
  --action-bg:#2E6A86;
  --action-bg-hover:#245670;
  --action-bg-press:#245670;
  --font-display:'Space Grotesk V2', 'Roboto', system-ui, -apple-system, sans-serif;
}
.te-shell[data-brand="enterprise"] .te-navbtn.active{ background:#EAF2F6; color:#245670; }

/* The enterprise lockup, sized as on the public header (publicV2.css .cbv2-lockup). */
.te-shell[data-brand="enterprise"] .cbv2-lockup{ display:inline-flex; align-items:center; gap:10px; color:var(--strong, #171717); white-space:nowrap; text-decoration:none; }
.te-shell[data-brand="enterprise"] .cbv2-lockup__mark{ width:28px; height:28px; flex:0 0 auto; display:block; color:#2E6A86; }
.te-shell[data-brand="enterprise"] .cbv2-lockup__word{ font-family:'Roboto', system-ui, sans-serif; font-size:19px; font-weight:700; letter-spacing:-0.01em; line-height:1; color:var(--strong, #1A1A1A); }
.te-shell[data-brand="enterprise"] .cbv2-lockup__tag{
  font-family:'Roboto', system-ui, sans-serif; font-size:10px; font-weight:700; letter-spacing:0.16em;
  text-transform:uppercase; line-height:1; color:#2E6A86; border:1px solid currentColor; border-radius:4px; padding:3px 6px;
}
`;
