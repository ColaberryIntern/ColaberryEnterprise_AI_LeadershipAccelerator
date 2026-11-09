# Handoff — Session CC-20261029-f4w2 (video funnel: C107–C117)

**Written:** 2026-11-08, 7:05 AM CST. **For:** the next Claude Code session that picks up the Explorer first-video funnel.

## Where things stand

| Ticket | What | State |
|---|---|---|
| C116 | YouTube lesson video collects its points by itself at 75% watched (no "Collect points" click) | Merged #3740, deployed Nov 7 ~10:58 AM CST, served publicly. **Not yet proved on a real learner.** Ticket open: https://app.basecamp.com/3945211/buckets/7463955/todos/10486736540 |
| C117 | At 75%: in-drawer celebration strip ("That's your first win! +5 pts" / "Nice work!"), video keeps playing, Close + "Next: <lesson> →" | Merged #3746 (2d5c1720), deployed Nov 7 ~2:15 PM CST, JS + CSS served publicly. **Not yet proved on a real learner.** Ticket open: https://app.basecamp.com/3945211/buckets/7463955/todos/10486922784 |
| C115 | Paid members with no completed card land on the video | Live. Close when a paid member watches the video (0 of 27 so far). |
| C96 / C97 | Ad-funnel decisions | Waiting on Ali. **No C96 purge `--apply` without Ali.** |
| C111 | Shared PaySimple customer ids | Open. |
| C109 | Journey governor → Maya | Parked. |

## Last measurement (Nov 8, 6:59 AM CST)

- Since the C116 deploy: 11 new Explorers signed up, all 11 got the video; 16 people watched some of it.
- Nobody crossed 75% (best 65%, then 33%, 23%), so 0 first wins and the celebration has not fired yet.
- 3 of the 4 deepest watchers dragged the slider to ~3:15 of the 3:33 video; skipped parts do not count toward 75%.
- Offered to Ali, **unanswered**: a "Skipped ahead? Only the parts you watch count toward your points" hint under the video. Needs its own ticket if he says yes.

## How to re-check

- `ssh root@95.216.199.47 "bash /tmp/c116check.sh"`: watches of the program video since the C116 deploy (pct, furthest, status, completed, points time, Quick check). Read-only.
- `ssh root@95.216.199.47 "bash /tmp/nf2.sh"`: the full funnel since the C114 landing, plus the C115 paid-member count.
- **Success looks like:** a row with pct ≥ 75, status `completed`, `pts_at` set, and no Collect click needed. Then close C116 + C117 with that evidence.
- Program video card `b0c844c0-01b0-439e-bc28-6a1b76b09afb`, Quick check `c05b1303-29eb-439c-a2de-e0d6853f6754`, video 213 s.

## Coming Monday (Nov 9)

Piyush's welcome avatar video (16:9) replaces the current program video as the first assignment. Then rewrite the Quick check from the final script (posted on https://app.basecamp.com/3945211/buckets/47502609/todos/10480615426#__recording_10483664640), and verify on a fresh test account. Reel_1.mp4 was reviewed and **not** used: no AI-avatar disclosure (policy L9.4), two figures with no Claim Registry row. Ali chose to keep the current video until Monday.

## Traps that cost time in this session

- **Local typecheck:** `../node_modules/.bin/tsc` does not exist in `acc-c113-wt`, and a filtered grep makes it look clean. Use `node C:/Users/ali_m/live-sync-wt/node_modules/typescript/bin/tsc --noEmit -p .` (TS 5.9.3) and plant a control error first.
- **Deploys:** frontend = `DEPLOY_MODE=registry EXPECT_MARKER=<string> EXPECT_IN=nginx:/usr/share/nginx/html/static bash scripts/deploy-prod.sh nginx` on the host, after `gh run list --workflow "Build images" --branch main` shows main's tip succeeded. Verify through `https://enterprise.colaberry.ai/static/js/<chunk>`; the change is in a split chunk, not `main.*.js`.
- **`CardDetailBody.tsx` is still 571 lines** (ceiling 500). The next change to it must split it first.

## Standing rules for this workstream

No merges (Ali clicks), never "free" in copy, American spelling, times in CST, one Basecamp ticket per piece of work before the first commit, no stacked PRs, commit explicit paths, log to `docs/sessions/CC-20261029-f4w2-<ticket>.md` (PROGRESS.md is sealed), no outbound email (Maya owns outreach), every external figure needs a Claim Registry row.
