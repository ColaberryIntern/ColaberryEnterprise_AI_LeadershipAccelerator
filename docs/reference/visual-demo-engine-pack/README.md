# Visual demo engine pack

Everything Claude Code needs to turn the text-heavy Connected Demo into a visual, analytical one for
every generated project.

| File | What it is |
|---|---|
| `PROMPT.md` | The Claude Code prompt. Paste the part below the line. |
| `BEFORE_AFTER.md` | Six before and after pairs, each tied to the rule that produced the change. |
| `before-after.html` | The same pairs side by side, for people. Open in a browser. |
| `before/` | Screenshots of the current engine output (ShiftFill sample, captured 2026-11-28). |
| `after/` | Full-page screenshots of every view of the target. |
| `reference/shiftfill-coverage-console.html` | The hand-built target. Self-contained; open in a browser. |

## How to use

1. Copy this folder into the repo at `docs/reference/visual-demo-engine-pack/`.
2. Open Claude Code on the repo and paste `PROMPT.md` from below its line.
3. Claude Code plans first and waits for approval, then works on a branch and opens a PR.

## Limits to know

- The reference is one project in one domain. The prompt forbids copying its domain terms.
- The reference holds a hand-condensed copy of the sample data, not the original `demo-spec.json`.
  For a ShiftFill test fixture, take the spec from the stored demo (the `#demo-spec` script tag on
  the public demo page, or the active demo artifact in the database).
- Thresholds and caps in the prompt are starting values. Tune them after the first fixtures render.
