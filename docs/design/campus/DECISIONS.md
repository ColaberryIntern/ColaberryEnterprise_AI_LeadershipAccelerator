# Colaberry Campus: design parity decisions

The decisions in section 3 of `CAMPUS_DESIGN_PARITY_PROMPT.md`. Each one is Ali's call. Until it is answered, its work package does not build that item, and `tests/systemV2/lib/campusFidelityViews.js` keeps it in `known`.

Answered 2026-10-22 (Central). Ali: "all as recommended". Three questions (Q4, Q8, Q13) carried no recommendation, only "your call"; for those the answer is recorded as **keep things as they are**, which Ali can override at any time.

| # | Question | Recommendation | Answer | Date |
|---|---|---|---|---|
| Q1 | Ambient classmates walking the paths | Animate real present people (idle near their building, walk when a presence poll shows they moved) | **As recommended**: real present people only, never invented walkers | 2026-10-22 |
| Q2 | Live building: Classroom (design) or Community Lounge (today, rooms join by `room_id`) | Classroom, if a broadcast can carry `session_id` | **As recommended**: the Classroom when the broadcast can be tied to a session; Community Lounge until then | 2026-10-22 |
| Q3 | Byte Chase and Launch Lab: keep the original games or match the design | Keep the originals; draw new art for them | **As recommended**: keep the originals, new art for them | 2026-10-22 |
| Q4 | Crown (2,000) and jetpack (3,000) unlocks above the top points rung | Your call | **Keep as is** (no recommendation): no crown or jetpack; the ladder is unchanged | 2026-10-22 |
| Q5 | "Lv 7" number or rung name "AI Enabled II" | "Lv N" from the rung index, rung name in the tooltip | **As recommended** | 2026-10-22 |
| Q6 | Chat on the campus home (inbox, chat heads, chat panel) | Build it on `/api/portal/dm/*` | **As recommended** | 2026-10-22 |
| Q7 | Help desk press: staff popover (design) or walk to the desk (today) | Popover, with "Visit the desk" | **As recommended** | 2026-10-22 |
| Q8 | Maya: website widget (C6) or in-campus DM | Your call | **Keep as is** (no recommendation): the website chat widget (the C6 decision stands) | 2026-10-22 |
| Q9 | Gate streak: claim on Enter (+5 pts) or information only | Claim via `POST /api/portal/streak/claim` | **As recommended** | 2026-10-22 |
| Q10 | Explorer tour end: automatic admissions handoff (design) or opt-in (today) | Keep opt-in; add Maya's end-of-tour toast and the "Finish · see what you'd unlock" sheet | **As recommended** | 2026-10-22 |
| Q11 | Staff "Needs attention" list | Build an at-risk service (attendance, task age, inactivity, repeated mentor questions) as its own backend project | **As recommended**: a separate backend project; Management Portal links until then | 2026-10-22 |
| Q12 | Sponsor pages in campus chrome (dashboard, seats, demo day, digest) | Dashboard, invite and CSV now from `/api/portal/org/*`; defer the rest | **As recommended** | 2026-10-22 |
| Q13 | Explorer course and "path to enrolling" ticks | Your call (product decision on the Explorer course) | **Keep as is** (no recommendation): no Explorer course change; the path stays unticked | 2026-10-22 |
| Q14 | "Show which building I'm in" setting | Build it: a small presence-sharing flag on `/campus/here` | **As recommended** | 2026-10-22 |
| Q15 | Live reactions and captions | Defer; at most the viewer's own reactions, locally | **As recommended**: deferred | 2026-10-22 |

## Owner requirements already decided (section 2 of the prompt)

- **The map recenters itself every time** you return to the campus. Built in WP-1.
- **There is always a side panel with your next steps and the tours.** Built in WP-1.
