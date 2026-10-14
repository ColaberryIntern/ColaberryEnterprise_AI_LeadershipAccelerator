# Intended intern roster — planning data only

**Recorded:** 2026-10-07 · **Session:** CC-20261006-a4k7 · **Source:** the owner, directly, superseding
the attachment's "leave every intern assignment empty" with a stated *intention* while keeping the
instruction itself intact.

> **Nothing in this file is an assignment.** No `builder` field is set, no access is granted, no
> notification is sent. Spec §21 still governs: ten projects are created with zero intern assignments,
> and the owner assigns later. This records *who is intended for which domain* so the ten project
> blueprints can carry that intent as planning metadata rather than losing it between sessions.

## Correction, 2026-10-08 (measured in production)

Two statements in the first version of this file were **wrong about Ruth Kumera**, and both were
wrong in the direction that would have put the wrong blocker on her project. Measured against
`accelerator_prod` at 03:50 UTC:

| | This file originally said | Production |
|---|---|---|
| `internship_applications.state` | `offer_letter_ready` | **`signed_documents_uploaded`** |
| `enrollments.status` | implied not-active | **`active`** |
| `enrollments.active_project_id` | — | NULL |

1. **Her documents are uploaded, not pending.** `signed_documents_uploaded` is one step *past*
   `offer_letter_ready`. What is outstanding is staff **verification** of documents already
   submitted, not their submission. "Internship documents pending" named the wrong gap.
2. **Her enrollment is already `active`**, so the original instruction "her enrollment must not be
   moved to `active` by anything in this build" rested on a false premise. The protection that
   actually matters is her **internship application state**, which must not be advanced, and no
   requirement of hers marked verified or granted.

**The owner's instruction is unaffected and stands in full: do not activate Ruth, and do not bypass
her onboarding requirements.** Only the reason recorded here was wrong.

Also corrected: the distribution below originally read "2 offer_letter_ready". The measured
distribution of `internship_applications.state` across its 21 rows is **13 `active`, 4 `started`,
1 `withdrawn`, 1 `under_review`, 1 `offer_letter_ready`, 1 `signed_documents_uploaded`**. Exactly one
application sits at `offer_letter_ready`, and it is **not** Ruth's.

## The roster

| # | Domain | Intended intern | Verified in production | Note |
|---|---|---|---|---|
| 1 | Learner Success (Reese) | **unassigned** | — | owner's decision pending |
| 2 | Curriculum, Learning & Certification (Dara) | **Ruth Kumera** | yes, `rtkumera@gmail.com` | Enrollment is **`active`**; internship application is **`signed_documents_uploaded`** - documents submitted, **awaiting staff verification**. Must not be advanced, activated, or have onboarding bypassed. See the correction above |
| 3 | Marketing Intelligence & Brand | **Sarbjit Kaur** | yes, active intern | |
| 4 | Product Experience & UI/UX | **Mihret Netsereab** | yes, active intern | |
| 5 | Admissions & Applicant Experience | **Kalkidan Bezabeh** | yes, active intern | carries one withdrawn and one active application row; the active one is the referent |
| 6 | Sales, Enrollment & Subscriptions | **Victoria Spencer-Auber** | yes, active intern | |
| 7 | Internship & Career Readiness | **Tashima Diah** | yes, active intern | |
| 8 | Website Portfolio & Conversion | **unassigned** | — | owner's decision pending |
| 9 | Platform Automation & Reliability | **Quincy Nkwain Ninying** | yes, active intern | already owns an active student project (`HosPulse`) |
| 10 | Executive Intelligence & Governance | **unassigned** | — | manager resolved (Ali); builder deliberately not named |

## What was verified, and how

Every named person was checked against `enrollments` joined to `cohort_memberships` and
`internship_applications` in production on 2026-10-07, and **re-measured on 2026-10-08** after the
first pass got Ruth's state wrong. All seven exist. Six have `internship_applications.state =
'active'`; **Ruth's is `signed_documents_uploaded`** - see the correction at the top of this file.

**These seven are a selected subset, not the population.** Production holds **13 distinct active
interns** in the `ai_internship` cohort. The six not named here are Aki Wam, Harpreet Kaur, Megan
Dimiyo-Mbenoun, OBI ANAMELECHI K, Omolola Makinde and SAmrawit mekonen, plus the owner's own
enrollment. Application states overall, measured 2026-10-08: **13 active, 4 started, 1 withdrawn,
1 under_review, 1 offer_letter_ready, 1 signed_documents_uploaded** (21 rows).

Recording the subset must not be read as a claim that only seven interns exist, and an unnamed intern
is not a dropped intern.

## How a blueprint should carry this

In each project's planning metadata, as *intent* with no authority attached:

```
intended_builder:        <name>            # planning only, never the assignment field
intended_builder_state:  verified_active | onboarding_pending | unassigned
builder:                 null              # stays null until the owner assigns
access_grants:           []                # stays empty; assignment alone grants nothing
```

Spec §12 is the rule this protects: effective builder authority is active assignment **and** role
policy **and** explicitly approved project/environment grants. An intent recorded here confers none of
the three.

## Ruth Kumera, specifically

Her onboarding is incomplete by design, not by oversight. Her project (Curriculum/Dara) may be created
and may carry her as intended builder, but:

- **her `internship_applications.state` must not be advanced** from `signed_documents_uploaded` by
  anything in this build. (Her *enrollment* is already `active`; the first version of this file
  wrongly made the enrollment the thing to protect.)
- no access requirement may be marked `granted` or `verified` for her
- her project's assignment-readiness must name the outstanding step **precisely**: her signed
  documents are uploaded and await staff verification. Naming it "documents pending" would describe
  a step she has already completed, and naming it a generic block would hide which human owes what

Treating her onboarding as a formality the factory can route around would be the exact failure the
spec's §36 overnight-safety rule exists to prevent.
