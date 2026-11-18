/**
 * The Colaberry Enterprise look for the Participant Portal sign-in (Ali, 2026-11-17).
 *
 * A THEME, NOT A SECOND PAGE. Aleem's layout and every rule in portalLoginStyles.ts stay
 * as they are; the Training look is that file unchanged. This file only re-points the
 * brand tokens his styles read, scoped to `.cbpl-root[data-brand="enterprise"]`, so the
 * training variant cannot be touched by anything here.
 *
 * The values are the public enterprise site's (fidelityV5.css `--v5-accent` #2E6A86 and
 * `--v5-accent-strong` #245670; the design system's dark-ground mark #6F9DB6; the soft
 * accent ground #EAF2F6) and its display face, Space Grotesk, as on every v5 page.
 *
 * ERRORS STAY RED. His error box and invalid-field border read the brand red tokens. On
 * a blue page that would turn "this did not work" blue, so both are restated in red here.
 *
 * The font file is imported so webpack fingerprints and ships it; a url() inside this
 * string would not be resolved at build time.
 */
import spaceGroteskUrl from '../../components/publicV2/fonts/SpaceGrotesk-var.woff2';

export const PORTAL_LOGIN_ENTERPRISE_CSS = `
@font-face{
  font-family:'Space Grotesk V2';
  src:url(${spaceGroteskUrl}) format('woff2-variations'), url(${spaceGroteskUrl}) format('woff2');
  font-weight:300 700; font-style:normal; font-display:swap;
}
.cbpl-root[data-brand="enterprise"]{
  --red-400:#6F9DB6;
  --red-500:#2E6A86;
  --red-600:#2E6A86;
  --red-700:#245670;
  --surface-brand-subtle:#EAF2F6;
  --font-display:'Space Grotesk V2', 'Roboto', system-ui, -apple-system, sans-serif;
}
.cbpl-root[data-brand="enterprise"] .cbpl-h1{ font-weight:700; letter-spacing:-0.035em; }
.cbpl-root[data-brand="enterprise"] .cbpl-error{ background:#FDECEA; color:#B3261E; }
.cbpl-root[data-brand="enterprise"] .cbpl-input[aria-invalid="true"]{ border-color:#B3261E; }

/* The enterprise lockup, sized as on the public header (publicV2.css .cbv2-lockup). */
.cbpl-root .cbv2-lockup{ display:inline-flex; align-items:center; gap:10px; color:var(--text-strong); white-space:nowrap; }
.cbpl-root .cbv2-lockup__mark{ width:28px; height:28px; flex:0 0 auto; display:block; color:#2E6A86; }
.cbpl-root .cbv2-lockup__word{ font-family:'Roboto', system-ui, sans-serif; font-size:19px; font-weight:700; letter-spacing:-0.01em; line-height:1; }
.cbpl-root .cbv2-lockup__tag{
  font-family:'Roboto', system-ui, sans-serif; font-size:10px; font-weight:700; letter-spacing:0.16em;
  text-transform:uppercase; line-height:1; color:#2E6A86; border:1px solid currentColor; border-radius:4px; padding:3px 6px;
}
`;
