# Session CC-20261109-h4m8 — Ruth's AI builder status page

Basecamp todo 10467362457, due 2026-11-10. Reported by Ruth Kumera by email on
27 October 2026. Two independent defects, both fixed here.

---

## fix(points): the level journey wraps instead of clipping, and the people panel closes

- **Date:** 2026-11-09
- **Session:** CC-20261109-h4m8
- **What changed:**
  - `frontend/src/pages/portal/points/PointsPage.css` — `.pts-jtrack` becomes a
    three-column wrapping grid instead of a `nowrap` flex row inside
    `overflow-x:auto`; `.pts-jnode` gains `min-width:0`; the connector is
    suppressed on the first node of each row.
  - `frontend/src/components/campus/campusPageChrome.css` — when the contacts
    column is held at 300px for the campus rail, collapsing now hides the people
    rows, the search field and the group headers as well as the names.
- **Verification:** measured on the live page at `enterprise.colaberry.ai/portal/points`
  with the real account, at 1440x900 and 390x844, **18 assertions, 0 failures**,
  each width measured twice — once as served (the control) and once with the
  changed CSS injected. Screenshots taken and looked at, not just measured.
- **Notes:** see below. The success metric on the ticket demands a screenshot at
  both widths "not by reading the CSS", so nothing here was concluded from the
  stylesheets alone.

### Defect 1 — the journey was clipped with no way to reach it

Ruth: *"the page cuts off the 'your level journey' and the rest of the page
content ... It doesn't let you scroll to the right to reveal the content/info,
rather it seems stuck on the cut off towards the right end's content."*

Measured in production before the change, at a 1440px viewport:

| | |
|---|---|
| shell columns | `248px 892px 300px` |
| points page splits the middle into | `462px 340px` |
| journey track box | 420px |
| journey track content | 1022px (9 rungs) |
| `flex-wrap` | `nowrap` |

So about three of nine rungs were visible. The track *was* technically
scrollable, which is why this did not look like a bug from the code: a mouse
wheel does not scroll a nested horizontal strip, and no scrollbar is drawn, so
there was no affordance. The screenshot shows "AI Enabled" sliced mid-word and
"YOU ARE HE" cut off.

Three fixed columns, not `auto-fit`: the connector pseudo-element has to know
where a row begins, and 3 divides the 9-rung ladder exactly. At the narrowest
width this page is built for the journey is 362px, which gives 118px per node —
wider than the 110px the single row was already using, so no label got tighter.

**Not done, deliberately:** the underlying reason the column is only 462px wide
on a 1440px screen is the nested `te-shell` / `te-grid` split, and `.te-grid` is
shared with Today, Projects and Cert Prep. Widening it would have put three
other surfaces in the blast radius of a ticket about one. Fixed inside
`.points-root` instead.

### Defect 2 — the people panel did not close

Ruth: *"The people tab also is not closing completely when clicking on the
closing arrow on the top left."*

The click and the React state were never the problem. Measured: clicking the
toggle set `te-shell contacts-collapsed` and `.te-ctname` computed to
`display:none`, and yet `grid-template-columns` stayed `248px 892px 300px` and
`.te-contacts` stayed 300px wide.

Cause: `campusPageChrome.css:121-124` re-asserts the 300px third column for the
collapsed state, under `@media (min-width:1201px)`, when `.te-contacts` contains
a campus `.cm-rail`. That is deliberate — the "Next steps" rail lives in that
column and needs the width. Confirmed on the live page rather than inferred:
the `:has()` selector matches the live shell, the rail is present and 299px wide.

Everywhere else `contacts-collapsed` narrows the column to a 66px avatar rail,
and the avatar-only rules are what make it read as closed. In the rail case the
column stayed 300px, so those same avatar-only rows remained 300px wide: a
half-shut panel. Collapsing now closes the people list outright and leaves the
rail its column.

`.te-ct-head` is deliberately left visible — it holds `.te-ct-toggle`, the only
way back. Hiding it would have closed the panel permanently, which is why the
check below asserts the panel reopens.

### What the verification asserted

Controls first, because an "after" number means nothing if the defect did not
reproduce in the same run:

- control: the track overflowed its box at both widths (1022px in 420px / in 320px)
- control: 17 people rows visible while the panel is open
- after: track no longer overflows at either width
- after: 0 clipped rungs, 0 rungs past the viewport, no horizontal page scroll
- after: all 9 rungs still render
- collapsed: 0 people rows visible, the rail still shows at 299px, the reopen
  arrow is still present, it **stays** collapsed, and it reopens to 17 rows

### Failure-first notes

1. **What happens if it fails?** Worst case is cosmetic: a rung wraps to a new
   row sooner than intended. No data, no request path, no auth is involved.
2. **Retry/backoff:** not applicable, this is a stylesheet.
3. **Recovery:** revert the two files; nothing else depends on them.
4. **Handled vs not handled:** handled — any rung count (rows simply fill),
   1440px and phone width, the campus-rail and non-campus cases. Not handled —
   a journey column narrower than ~330px, where three columns would start to
   crowd; no surface renders one today, and `minmax(0, 1fr)` means it would
   compress rather than clip or overflow.
