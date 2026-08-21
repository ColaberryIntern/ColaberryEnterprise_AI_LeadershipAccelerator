# Decisions Log

**Session:** CC-20260821-m6t4 · **Decided by:** Ali Muwwakkil · **Date:** 2026-08-21

Five decisions taken after the Gate 0 survey was produced. Recorded here rather than left
in a chat transcript, because three of them change what "done" means and one of them
raises the compliance bar on work that is already written.

---

## DEC-01 — The parked build stays parked until the survey is read

**Decision:** Hold. Nothing merges, nothing deploys, no further building.

**Consequence:** Commit `d76a80a7` (Gates 1-6) stays unmerged on
`workstream/multi-tenant-ecosystem`. The remaining work named in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — the scheduler send path, the
Mandrill webhook, organization scoping, E2E — is not started.

**Why it is the right call:** the survey exists precisely so the migration is reviewed
before it happens. D-01 is the evidence that reviewing first catches real problems.

---

## DEC-02 — The stale OneDrive working copy: investigate, do not touch

**Decision:** Report on what the 76 unpushed commits and the uncommitted edits actually
are. Change nothing.

**Consequence:** A separate read-only investigation. No stash, no pull, no rebase in that
folder — another session may be mid-edit in it, and this repo has a documented history of
blind stash operations stealing another session's work.

---

## DEC-03 — Survey audience is Ali only, for now

**Decision:** No packaging for Ram, the advisor, or an engineer review yet.

**Consequence:** No PR opened for the documents, no summary email drafted. If that
changes after reading, the packaging is a small job.

---

## DEC-04 — All five domains are owned, with DNS under our control

**Decision:** `cpn.org`, `aiflotation.com`, `refactored.ai` and the Colaberry domains are
ours today.

**Consequence:** This removes the longest-lead-time dependency in the whole plan. Sender
domain verification (SPF, DKIM, DMARC) can begin as soon as the build resumes, and the
DNS activation states in `brand_domains` describe real domains rather than aspirations.
Aleem's per-brand email design work has real addresses to design against.

**Still true:** the code fail-closes a live send until each domain is actually verified.
Owning a domain is not the same as having verified it, and nothing here fakes that.

---

## DEC-05 — CPN data isolation is a FORMAL requirement, tied to grants and donor commitments

**Decision:** Not merely good practice. A compliance boundary.

**This is the decision that changes scope.** The isolation already built — 404 on
cross-tenant access, fail-closed authorization, per-brand consent, tenant-scoped
queries — was designed to a strong engineering standard. A formal compliance requirement
needs two things that engineering standard does not by itself produce:

1. **An audit trail of every cross-entity access attempt**, including the ones that were
   correctly denied. A denial that leaves no record cannot be shown to a funder as
   evidence that the control works. This does not exist yet and is now required.
2. **Written evidence of the isolation**, in a form an auditor or grant officer can read
   without reading code: what the control is, how it is enforced, how it is tested, and
   what the test results were.

**Consequence for the parked build:** Gates 1-6 are no longer complete against this
requirement. Two additions are needed before the CPN brand captures a single real
applicant:

- cross-tenant access attempts (both allowed and denied) written to an append-only audit
  log carrying actor, target tenant, resource, decision and timestamp;
- an isolation evidence document generated from real test output rather than written by
  hand, so it cannot drift from the behaviour it certifies.

**Consequence for governance:** root `CLAUDE.md` lists "compliance or security boundary
touched" as an escalation trigger. This decision is the escalation being resolved in the
right direction — the requirement is now known before the code ships, rather than
discovered during a grant audit.

**Open, and worth answering before CPN goes live:** whether any scholarship applicants
are minors. That carries separate retention and consent obligations regardless of
funding, and it is a different workstream from tenant isolation. Flagged, not assumed.

---

## DEC-06 — `advisor.colaberry.ai` and `worldoftaxonomy.com` belong to Colaberry Enterprise

**Decision:** Both previously-unclassified lead sources are assigned to tenant
`colaberry`, brand `colaberry-enterprise`.

**Consequence:** The backfill map's `legacy-unclassified` bucket is now empty. Every lead
source in the database has a deterministic owner, which means the backfill can report
zero unresolved rows rather than two known-unknowns.

**Pending application:** the code change belongs to
`backend/src/seeds/ecosystemSeedData.ts` — removing both slugs from
`DELIBERATELY_UNCLASSIFIED_SOURCE_SLUGS` and adding them to the
`colaberry-enterprise` brand's `lead_source_slugs`. That file is inside the parked
commit, so the change is **recorded here and applied when the build unparks**, per
DEC-01. It is one line in each place.

**Note for later:** the survey observed that `advisor.colaberry.ai` is a separate
FastAPI product in its own repository, which is why it was not assumed to be Colaberry
Enterprise. That observation stands; the decision overrides it deliberately, and this
line is here so nobody re-litigates it in six months.
