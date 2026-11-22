# Human Inputs Required — Herriman WOMS (one consolidated list)

**Status: `BLOCKED_NEEDS_HUMAN` for the >=92 / submission-ready objective.** The R3 plan's acceptance (§4) requires Mandatory compliance, Technical responsiveness, Implementation & delivery, and Pricing each >=90, and all mandatory hard gates to pass. The items below are the human-owned artifacts that gate those dimensions. **None of them may be fabricated** (plan §14). Engineering continues in parallel; every item answers "yes" to "can technical work proceed without it?" except where noted.

| # | Item | Who authorizes | Why mandatory (gate) | Present state | Exact requested data/file | Technical work can proceed? |
|---|---|---|---|---|---|---|
| 1 | **Authorized itemized pricing** | Company finance / authorized bidder | Pricing & commercial (needs >=90) + submission gate | Missing / unapproved | Pricing workbook: license tiers/seats, implementation, each integration (GIS/Bluestakes/LAMA/SpryPoint/SCADA/Madison), migration, training, support, options, tax/terms; basis of estimate; written approval; reconciled to the technical scope | Yes (as proposed, unpriced) |
| 2 | **Signed Exhibit B / certification** | Authorized company signer | Mandatory compliance + execution gate | Missing | The executed official Exhibit B PDF, actual signature, signer authority, exact RFP version | Yes |
| 3 | **Third qualifying government reference** | Business owner + client permission | Evidence & past performance + references gate | 2 of 3 on file, unvetted | A real public-sector buyer with contact permission, project scope, dates, outcomes; eligibility per the RFP's reference clause. Vet the existing 2. | Yes (as proposed) |
| 4 | **Named implementation owners & capacity** | Delivery leader | Implementation & delivery (needs >=90) | Unconfirmed | Names, roles, capacity, commitments for the delivery team, UAT owners, go-live owners | Yes, as a proposed plan |
| 5 | **Verified systems / vendor API access** | City / vendor sponsor | Technical responsiveness, integration proof | Unverified | Confirmation + API docs/access for GIS, Bluestakes, LAMA, SpryPoint, SCADA, Madison AI; which are two-way vs one-way per the authoritative RFP; vendor coordination | Yes, conditional (claims stay "proposed", never "live") |
| 6 | **Approved security / SLA commitments** | Security / operations | Risk, security & support | Unverified | Approved SSO/RBAC design, data residency (if any), backup/DR, support hours, SLA commitments actually offered | Yes, avoid unapproved claims |
| 7 | **Authoritative deadline / addenda + time zone** | Bid owner / procurement | Admissibility | Conflicting (cover says MDT, narrative says MST; Utah observes MST in November) | The current official posting + all addenda; the authoritative deadline and time zone, verbatim | Yes, not for final export |
| 8 | **Gold Go on the final package digest** | Independent authorized reviewer | Approval gate | Absent | A reviewer-authorized Gold decision bound to the exact final package hash, after the above clear | No (final step) |

## What is NOT blocked (engineering owns)

- The authoritative RFP + Q&A are already in-system (`gov-source-bundles/4c81a09b-...zip`); no buyer file needs re-supplying.
- F01 admin-clause leak — fixed across R1 + R3 (submission instructions, evaluation process, procurement, format all kept out of the Technical Proposal).
- F03 technical substance — fixed in R2 (the 27 functional requirements now route into the Technical Proposal, which names GIS/Bluestakes/LAMA/SpryPoint/Madison).

## Honest bottom line

Without items 1-4 and 8, the weighted internal score cannot clear 92 and the mandatory hard gate cannot pass, regardless of content quality — the ceiling is ~65/100. The delivered package is always a clearly-labeled **DRAFT / NOT FOR SUBMISSION** preview, never marked submission-ready.
