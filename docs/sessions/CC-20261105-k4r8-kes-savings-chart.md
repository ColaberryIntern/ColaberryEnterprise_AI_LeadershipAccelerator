# CC-20261105-k4r8 — AI Inbox Manager: the savings chart, and why it is not on the record

Session: `CC-20261105-k4r8`
Date: 2026-11-05

Ali asked for a chart showing the savings, approved the $30/hour calculation, asked why the
record is not on the student site, and said Jude Ojobo was on the internship.

---

## The record refuses to chart self-reported money, and it is right to

The first instinct was to put the savings chart inside the record's visual story. It cannot
go there, and the reason is worth recording rather than working around.

`caseStudyVisualStoryValidate.ts:217`:

```
if (!m.verified) { out.push(err(path, 'metric_not_verified', `metric "${metricKey}" is not verified`)); }
```

**Every metric a chart references must be verified.** The savings figures are
`illustrative / self` — the builder's own hours, priced at an assumed rate — so any chart
anchored on them is refused before it renders. That is the same position the publish gate
takes on `class: verified, method: self`, applied one layer further in: the surface will
show a self-reported number, with its label, but it will not *draw* one.

Forcing it would have meant relabelling an estimate as verified. So the chart was built as
a standalone deliverable instead, where the estimate can be drawn honestly and marked as an
estimate.

## The chart

`docs/marketing/AI_INBOX_MANAGER_SAVINGS.html`, rendered to
`~/Downloads/AI Inbox Manager - what it saved.pdf` (2 pages).

Built through the `dataviz` method. The palette was **validated, not eyeballed**:

```
categorical slots 1-2 (#2a78d6, #eb6834)   light   ALL CHECKS PASS
ordinal ramp (#86b6ef,#3987e5,#184f95)     light   ALL CHECKS PASS
```

The first ordinal ramp tried — `#86b6ef,#3987e5,#2a78d6,#184f95` — **failed** on adjacent
lightness (two steps 0.047 apart against a 0.06 floor) and was re-stepped rather than
shipped.

**The honesty is in the encoding, not only the footnote.** The estimated figure is drawn
as a hatched *range* bar spanning 86 to 251 hours with the mid marked; the recorded figure
is a solid bar. The legend names the difference. A reader who looks at nothing but the
picture still learns which number is a measurement and which is a calculation.

Layout was checked by rendering and asserting, not by eye alone: a first pass had **eight**
elements overflowing the 7-inch sheet, so both plots were refit to a 500px measure with a
126px label gutter. The assertion now returns zero.

## Why it IS on the student site — I had checked the wrong URL

Earlier in this session I probed `training.colaberry.com/stories/<slug>` and
`/case-studies/<slug>`, got 308 and 404, and reported that the training surface "works
differently". That was wrong.

`caseStudySurfaceProfiles.ts` gives each surface its own address:

| surface | address |
|---|---|
| `enterprise` | `enterprise.colaberry.ai/stories` |
| `training` | `training.colaberry.com/`**`student-projects`** |
| `ai-flotation` | `aiflotation.com/results` |
| `refactored` | none — not publishable |

The record has been on the student site since it was first published. Confirmed by the
server-rendered title: *"The interview was in the inbox, the student still had to be told |
Colaberry Student Projects"*. Same class of mistake as reading snapshot field names that do
not exist on the wire: I guessed a path instead of reading the one the code publishes.

## Jude Ojobo is credited as an intern

`intern` is a first-class `CaseStudyBuiltByType`. Crediting an intern's work as staff work
misstates both who did it and the programme it was done under, so the contributor's `kind`
moved `colaberry_team` → `intern`, and the first timeline entry now says so. The
record-level `builtByType` stays `colaberry_team`, because the version the record describes
is the one Kesetebirhan Delele built.

Snapshot version 9, signed, published to `enterprise` and `training`.

Session: CC-20261105-k4r8
