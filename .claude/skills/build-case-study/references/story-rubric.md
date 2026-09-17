# The story rubric: six dimensions, 0 to 2, each citing a passage or a gap

Scores guide a revision. They never substitute for the publish gate or for consent: a 12
does not publish a record, and a 6 does not block one. Record the score with its evidence
in the run's verification log; never promise a target score.

`reviewCaseStudyStory` (`backend/src/services/caseStudy/caseStudyStoryReview.ts`) fills in
the structural half of every dimension and marks the rest "editorial": a person settles
those by reading the page.

| Dimension | 0 | 1 | 2 | The machine sees |
|---|---|---|---|---|
| Identifiable person or team | no builder card, no contributors | a role-only card, or contributors without a card | a named, consented builder | `builder.name`, the card, the contributor count |
| Concrete stakes | no situation | a situation narrative exists | the opening paragraph says who was affected and what it cost, in the record's own terms | presence only; editorial |
| Decision progression | no cards | some cards, or cards not pinned | three cards, each pinned to a step of the drawing | count and `stage` |
| Honest complication | nothing named | cards without a limit | a consequence, the closing or a metric limitation names what is unresolved or can still fail | the limit words; editorial for meaning |
| Supported outcome | impact wording with no metric on the record | a demonstration told as one (no metrics, no impact wording) | publishable metrics carry the outcome | metrics and the impact words; editorial when there are no metrics |
| Audience relevance | (not scored 0) | the canonical words serve every surface | a variant written for this surface | `surfaceVariants.<surface>` present; editorial for fit |

## Worked example: the CORA record on training, revision 2 (live 11:25 AM CDT, 2026-09-17)

| Dimension | Score | Evidence |
|---|---|---|
| Identifiable person or team | 2 | `builder.name = Kes`; consent on the record since its creation; progression rail Intern, Hired by Colaberry, AI Systems Architect |
| Concrete stakes | 2 | situation.narrative[0]: "The system places outbound voice calls for an admissions team ... Everything downstream ... depends on that event arriving." Then the console that showed nothing, and 533 of 1,644 launches |
| Decision progression | 2 | three cards, pinned "Detection query", "Same-pipeline replay", "Recovery audit row"; figures 28 Apr, 0, 97% |
| Honest complication | 2 | card 3's consequence: "resolved is not the same as recovered ... the 18 open cases and 4 duplicate CRM tasks stay in view"; closing: "one place where the recovery path can still drift" |
| Supported outcome | 2 | nine publishable metrics; 586 of 604; 96% automatic; median 34 minutes; 0 duplicates in 339 |
| Audience relevance | 2 | `surfaceVariants.training`: the learner's page shows the person and the choices; Enterprise and AI Flotation still read the canonical words (their variants are Phase 2) |

Ali's independent reader scored the first revision 8.8/10 overall and 8.5/10 for
storytelling, with sequencing as the main gap; revision 1 moved the decisions after the
situation and revision 2 shrank the ending. The rubric above is of the page after both.

## The sparse-author example (what a 1 looks like, honestly)

A record whose only contributor is `role_only` and whose builder card carries a role title,
a repository-supported contribution and skills tied to evidence, with `intro` and
`progression` empty: Identifiable person or team = 1, evidence "builder card, role only".
That is the correct score and a valid page. The gap goes in the handoff as "no consented
author; role credit", and nothing is invented to raise it.
