# Needs Human — Herriman WOMS (what blocks >=92 / submission-ready)

These are the inputs the generation system must **never fabricate**. Each blocks one or more mandatory submission gates and/or a rubric dimension that cannot clear its floor without it. Engineering continues in parallel; none of this blocks the R1/R2 code work.

| # | Input needed | Why critical | Exact ask | Owner | Blocks |
|---|---|---|---|---|---|
| 1 | **Authorized, itemized pricing** | No priced offer exists; Pricing dimension = 0 and the MANDATORY gate fails. | Itemized licenses/seats, implementation, integrations (Bluestakes/LAMA/SpryPoint/SCADA as scoped), migration, training, support, optional services, tax/terms, reconciled to the technical scope. Approved by a commercial approver. | Finance / commercial approver | Pricing (10), Mandatory (20) |
| 2 | **Signed Exhibit B / required certification** | The RFP requires a signed Certification (Exhibit B). A filename is not a signature; bytes + signer authority must be verified. | The original official Exhibit B form, actually signed by an authorized signatory, exact version. | Authorized signatory | Mandatory (20) |
| 3 | **Third qualifying government reference** | Only 2 of 3 references are on file and they are unvetted library candidates, not submitted references. | A real public-sector buyer with contact permission, project scope, dates, outcomes; eligibility per the Herriman RFP's reference rules. Vet the existing 2 as well. | Sales / partnerships | Evidence (15), Mandatory (20) |
| 4 | **Gold Go on the frozen final package** | No authorized approval bound to a final immutable package fingerprint exists, and it cannot be self-approved. | A reviewer-authorized Gold decision on the exact final version hash, after mandatory gates clear. | Independent authorized reviewer | APPROVAL gate |
| 5 | **Quantified-scope confirmations** | The draft repeats building counts / square footage / user counts; these need a source citation or an approved assumption, not an invented promise. | Confirm (or cite from the RFP/Q&A) building count, square footage, user roles/counts, expected volumes; mark any inferred value as an assumption pending confirmation. | Buyer / solution owner | Technical, Risk accuracy |

## Not blocked on a human (engineering owns these)

- The authoritative RFP + Q&A **are already in the system** (source bundle `4c81a09b-...zip`); no buyer file needs re-supplying. See [HERRIMAN_ROOT_CAUSE_MATRIX.md](./HERRIMAN_ROOT_CAUSE_MATRIX.md).
- F01 admin-leak routing — fixed (R1).
- F03 scope extraction + solution blueprint from the stored source — R2, in progress; this is what makes the technical response substantive.

## Honest status

`BLOCKED_NEEDS_HUMAN` for the >=92 / submission-ready objective: inputs 1-4 above are mandatory and absent. The system will keep improving content quality from the stored source in the meantime and deliver a clearly-labeled **audit-only DRAFT** package — never marked final or eligible.
