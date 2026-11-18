# CC-20261118-sf2 — Proposal Studio: live build feedback round 2 + dossier clarity

Goal (Ali, 2026-11-18, testing the Phase-2 build live): a batch of feedback on the Proposal
Studio build experience and the company dossier Fill forms. One PR, one deploy.
Branch: workstream/studio-feed-and-counts (off origin/main @ cd6e947d).

## The feedback (10 items)
1. The screen refreshing every ~3s is irritating. Find a better way.
2. The proposal agent feed is BS ("white glove") — we only build documents. It should say only
   what document it is starting, that it created a Need for you, finishing up, starting the next.
3. The feed shows "Nov 18" many times; show the time instead.
4. The blueprint shows ~5 documents but the document set shows ~15. Why don't they match?
5. The proposal readiness % does not move as documents get built.
6. A meter that says how much time is left.
7. Can it run with the screen moving for the agent, like Claude Code.
8. The dossier questions ("See quote", "Status") don't make sense; Ram won't understand. Use the
   context of the question to explain it.
9. Hover a REQ-### and get a formatted tooltip of that requirement.
10. "Technical proposal" blocks for an answer are not an answer — show what a good answer could
    look like, to replicate.

## Changes

- [x] 1/7 Live feedback without the whole-screen refresh (change-detection + a moving meter)
  - buildProgress.useBuildProgress now takes a cheap `fetchSignature` (latest activity event) and
    only calls onReload (the thing that re-renders the page) when the signature actually changes —
    a document started, a Need was created, a document finished. Between real events the screen
    holds still. StudioShell passes studioApi.listActivity(_,1) as the signal.
  - New BuildMeter.tsx: a progress bar (Built X of N buildable docs) + a one-second ticking elapsed
    clock + an honest rate-based ETA (only once ≥1 doc has finished this run). The ticking clock is
    the "it is moving" cue, with no data re-pull. AgentPanel log auto-scrolls to the newest line.
  - Verification: frontend tsc clean; proposalStudio suites 108/108 (incl. new builtDocCount/
    buildableDocs tests + existing build-bar tests).

- [x] 2/3 Factual agent feed + time-of-day
  - proposalActivity rewritten: PLAIN build log from review runs (Starting/Finished/Paused/Snag),
    document gaps (Created a Needs for you: <question>), human edits, gate checks, blueprint re-reads.
    It no longer echoes the drafter's change_summary prose (the "white glove" source). Carries the
    document TITLE. New sources: GovProposalReviewRun + GovProposalDocumentGap.
  - AgentPanel shortTime shows the time of day ("2:34 PM"); only prefixes the date when not today.
  - Verification: backend proposalActivity 4/4; frontend tsc + suites green.

- [x] 4 Blueprint count clarity
  - The "Solicitation package" panel now says it is the N files the buyer published (the input), and
    the required-documents panel says it is the N documents we produce (the Document set), explicitly
    "not the N solicitation files above". Inputs vs outputs, so the 5 vs 15 stops looking wrong.

- [x] 5/6/7 Readiness explanation + build meter (see item 1/7 above; readiness stays the quality ring)

## Still open in this PR (next)
- [ ] 8/9/10 Dossier Fill clarity: a contextual question (not "Status"/"See quote"), a REQ-### hover
      tooltip with the requirement text, and an example of a good answer (from the gap suggestions).
      Needs: carry `suggestions` + requirement text onto HumanNeed/concept, then render them.

## Verification so far (CI gates)
- Backend tsc clean (pre-existing maxmind only); proposalActivity jest 4/4; studioU1 route test
  (mocks loadProposalActivity) unaffected.
- Frontend tsc clean; proposalStudio react-scripts suites 108/108.
