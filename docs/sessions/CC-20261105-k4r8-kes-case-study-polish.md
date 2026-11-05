# CC-20261105-k4r8 — AI Inbox Manager: the three fixes from Ali's read

Session: `CC-20261105-k4r8`
Date: 2026-11-05
Continues `CC-20261105-k4r8-kes-case-study-assets.md`, which covers parts one to five.
Kept as its own file so it does not stack on the open PR carrying part five.

Ali looked at the rendered page and sent back a screenshot plus three instructions: put
the thumbnail on the video, fix the formatting, and assume an hourly rate using an average.

---

## 1 · The video opened on a grey dashboard

`walkthroughVideo.posterUrl` had been a frame lifted from the walkthrough itself, so the
player opened on a muted screenshot while the index card showed the cover art. Every other
record uses its own cover as the poster. It now does too, so the card, the masthead and the
player all show the same picture.

Verified by reading the `poster` attribute off the live `<video>` element:
`thumb-ai-inbox-manager-c.jpg?v=73885f4c`.

## 2 · The decision cards were breaking apart

Ali's screenshot showed consequence text running **one word per line** beside an oversized
heading. The cause was in a contract I had skimmed rather than read. `figure` is *"the
figure the card closes on, as displayed"* and its own examples are compact — `"28 Apr"`,
`"0"`, `"97%"`. Mine were phrases: "every notice", "the hardest cases", "held, not guessed".
A long figure takes the column width and leaves the consequence a few characters wide.

The tell was already on the page: **the only two cards that rendered correctly were the two
already carrying dates.** All five now close on the date of the commit that evidences them —
short, uniform, and already the working pattern.

| card | closes on |
|---|---|
| `approval-gate` | 2 Oct |
| `hold-the-unmatched` | 9 Oct |
| `low-confidence-queue` | 10 Oct |
| `two-keys` | 20 Oct |
| `correct-your-own-numbers` | 21 Oct |

The five now render as a numbered grid with stage eyebrows and no squeezed column. Checked
afterwards by walking every text element narrower than 90px that still carries a sentence:
the only hits are the deliberate 1px screen-reader spans.

## 3 · One assumed rate instead of three placeholders

Ali: *"You can assume the hourly rate — use an avg."* The builder supplied twenty, thirty
and forty dollars an hour; the average is thirty, and that is now the single rate.

**The spread stayed, but it moved to the honest place.** The rate is no longer a range
because Ali settled it. The hours still are — 86, 167 and 251 — because the hours are the
part nobody measured, and collapsing them to one number would hide the uncertainty rather
than resolve it.

```
about $2,600 to $7,500 of staff time, against about $350 to run
   low     86 h  ≈ $2,580
   middle 167 h  ≈ $5,010
   high   251 h  ≈ $7,530
```

The limitation now leads with the fact that the rate is assumed and that the spread shown
is the spread in the hours, not in the rate.

The measurement narrative was rewritten in the same pass, because it still said the figure
rested on "assumed hourly rates" **plural**. A page that contradicts itself one section
apart is worse than one that is merely incomplete.

## Verification

Poster read off the live `<video>`. Every text element under 90px checked for squeezed
content. Decision band re-captured and read by eye. Page now 14,459px tall. Snapshot
version 8, signed, published to `enterprise` and `training`.

Session: CC-20261105-k4r8
