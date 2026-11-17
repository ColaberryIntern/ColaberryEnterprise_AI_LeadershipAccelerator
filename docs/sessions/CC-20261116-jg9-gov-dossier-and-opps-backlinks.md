# Session CC-20261116-jg9 (cont.) — Our Services back-link + Proposal Studio dossier link

Follow-on to the Gov Contracts nav restructure. Ali, after seeing it live: "Going back to Gov Opp
page from Our Services should be added. Also we need a link proposal to Dossier page for easy
navigation to see where the answers would go."

## Two navigation adds (frontend-only)
1. **Our Services -> Gov Opportunities back-link.** `AdminGovServicesPage.tsx`: a "Gov Opportunities"
   button (first header action, `data-testid="back-to-gov-opps"`) that navigates to
   `/admin/gov-opportunities`. Needed because Our Services left the sidebar and is reached only from
   the Gov Opportunities page.
2. **Proposal Studio -> Company dossier link (admin-only).** A "See where answers go in the company
   dossier" link in the agent panel's "Needs you" header, opening `/admin/gov-services#dossier`.
   - `AgentPanel.tsx`: new optional `onOpenDossier?: () => void`; renders the link under the Needs-you
     h3 only when provided (`data-testid="agent-dossier-link"`).
   - `StudioShell.tsx`: new optional `onOpenDossier?`, forwarded to AgentPanel.
   - `AdminGovContractCockpitPage.tsx`: passes `onOpenDossier={() => navigate('/admin/gov-services#dossier')}`.
   - The intern read-only mount (`GovProjectPortalPage`) omits the prop, so interns — who cannot reach
     the admin dossier — never see the link. Parity gate unaffected (it checks presence of shared
     testids; this adds an admin-only one).

## Tests
- `AdminGovServicesPage.test.tsx`: asserts the back button exists and reads "Gov Opportunities".
- `studioParity.test.tsx`: admin mount renders the dossier link and clicking fires `onOpenDossier`;
  intern mount (no prop) has no link.

## Verification (real CI gates)
- Frontend `tsc --noEmit`: clean.
- react-scripts: studioParity / AdminGovServicesPage / AdminGovContractCockpit (+AgentPanel) pass;
  full frontend suite = 10,128 pass. The only 2 red locally (`publicNextOpenHouseJs`,
  `governmentHeaderParity`) fail identically on clean origin/main and are GREEN in CI on main —
  Windows-only flakes (line-endings / jsdom timing), not from this change.
- Frozen `frontendTypographyLint` + `frontendCopyLint` + `bannedCopy`: 55 pass.
- No backend source touched.

## Deploy
- nginx only (frontend). Marker: "See where answers go in the company dossier" or "back-to-gov-opps".
  Admin-login eyeball (the dossier link on the cockpit, the back button on Our Services) is Ali's step.
