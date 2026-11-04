# Research: how proposal documents are produced

We are adapting a well-documented process, not reinventing it. Collected Nov 4, 2026. Vendor claims come from vendor pages unless noted. The Vultron items come from third parties.

## What platforms do

| Platform | Mechanics worth copying | Source |
|---|---|---|
| GovDash | Parses L/M/C + amendments into a compliance matrix and shreds; every requirement shows its highlighted source text; Excel export of outline↔requirement mapping; Word templates; compliance review in Word as tracked changes | https://support.govdash.com/docs/compliance-matrix-and-review-mode · https://www.govdash.com/features/proposal-cloud/quality-proposals |
| Procurement Sciences (Awarded AI) | "Generate Compliance Matrix"; draft from highlighted requirements; built-in Pink/Red/Gold/White Glove review prompts checking compliance, risk, readability, win-theme consistency | https://intercom.help/01010000-01010011-01000011-01001001/en/articles/11932445-proposal-manager-s-playbook |
| Deltek GovWin IQ | Two outlines: a basic one (TOC with page counts and formatting) and an annotated one (requirements + suggestions per section); Word download; verbatim compliance matrix for Pink/Red | https://www.deltek.com/en/blog/govcon-ai-opportunity-proposal-tools |
| Unanet ProposalAI | RFP shredder, compliance matrix analyzer, gap analysis, drafts that cite a reference library | https://info.unanet.com/hubfs/Unanet_ProposalAI_solution%20Brief.pdf |
| Responsive (RFPIO) | Auto-detects sections and questions; assigns authors and reviewers per section; export template matches the request; TRACE score on AI answers (accuracy, relevance, traceability) | https://www.responsive.io/product/response-projects |
| Loopio | Imports the RFP structure; auto-fills from the library; reviewed answers flow back into the library | https://support.loopio.com/hc/en-us/articles/360020261634-What-is-a-Project |
| VisibleThread | Rules-based shredding traced to source sentences; version comparison; per-document readability and passive-voice scoring | https://www.visiblethread.com/blog/federal-proposal-software-compared/ |
| Vultron (unverified) | Claims >95% compliance-matrix accuracy; "adaptive scoring" against criteria (a competitor's claim); versioned library | https://www.carahsoft.com/vultron |

None of them uses a working software demo as proof. That's ours.

## Color-team gates (Shipley practice)

| Gate | When | Checks |
|---|---|---|
| Blue | Annotated outline, before writing | Requirements, themes, discriminators reflected; each section has an owner |
| Pink | ~65–70% draft | Sections have real content; story hangs together |
| Red | ~90–95% draft | Independent reviewers score it like evaluators, against Section M |
| Green | With or after Red | Price is right and matches the technical story |
| Gold | ~100% | Go to submit; earlier fixes made |
| White Glove | Before submission | Production defects: format, pages, files, signatures |

- Red team: build the scoresheet from Section M first, score each factor independently with Section M weights, flag 2+ adjectival-level disagreement, and give every weakness an owner and a fix. https://www.goveagle.com/blog/red-team-review-best-practices-govcon
- Small bids fold Blue into Pink and often skip Green. Never merge Red. https://www.visiblethread.com/blog/color-team-review-guide/
- Theme statement = discriminator + customer benefit + proof, at the start of the section. Section planning ties hot button → feature → benefit → proof. https://www.shipleywins.com/blogs/do-your-theme-statements-pass-the-litmus-test

## Texas package facts that drive rules

- **HUB Subcontracting Plan (HSP):** required by state agencies when the contract is ≥ $100k and subcontracting is probable. Missing it makes the response nonresponsive (Gov't Code 2161.252). Good-faith outreach means 3 HUBs + 2 trade organizations, with 7 working days to respond. https://texas.public.law/statutes/tex._gov't_code_section_2161.252 · https://Www.Tdi.Texas.Gov/purchasing/documents/hspinstructions.pdf · UT System won't open a response without it: https://www.utsystem.edu/offices/contracts-and-procurement/request-proposal-rfp
- **HUB is pass/fail, not scored points**, in every source reviewed.
- **Execution of Offer** (state and universities): signed; includes disclosures. https://tfsfinance.tamu.edu/modules/finance/admin/content/reports/biddocuments/RFP-26-010.pdf
- **Form 1295** (Texas Ethics Commission): triggered by a governing-body vote, ≥ $1M, or lobbying services. Due with the signed contract, not the proposal, though Harris County asks for it at submission. https://ethics.state.tx.us/filinginfo/1295/
- **CIQ:** local government only (Local Gov't Code 176). https://www.dentoncounty.gov/515/Conflict-of-Interest-Disclosure
- **No-boycott certifications:** Israel, energy, firearms (Gov't Code 808, 809, 2274). https://www.uh.edu/office-of-finance/purchasing/policies-procedures/procedures/no-boycott/
- **TX-RAMP:** cloud software for state agencies. Also expect a Public Information Act redacted copy, and pricing as a separate file (HHSC wants Excel with live formulas).
- **Scoring examples:** TDLR software RFO (Qualifications 10 / Functionality 35 / Work plan 25 / Cost 30, with cost points = lowest ÷ yours × 30); HHSC FSMS (20-page cap, Times New Roman 12pt). Reviewers give no points for "Comply" or ad copy.

## Design ideas adopted

1. Source-linked rules: every blueprint rule cites a quote, file and page.
2. A basic outline (page budgets) plus an annotated outline (requirements + section plan); Blue inside Pink.
3. Fatal vs curable: fatal items block export whatever the score.
4. Texas forms as a rules engine keyed on buyer type, value, cloud, and subcontracting, with an HSP outreach timer.
5. A Section M simulator: 3 independent AI evaluators, with disagreement flagged.
6. Separate output files: technical PDFs, a pricing Excel with formulas, the HSP, and a redacted copy, named per the RFP.
7. Format linting from a real render: page count, font, page size.
8. A section plan per section: hot button → feature → benefit → proof → discriminator.
9. The working demo as proof: screenshots tied to requirement rows.
10. A library that learns: approved answers are reused.
