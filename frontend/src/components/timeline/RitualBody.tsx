import React from 'react';
import { parseRitualBody } from './ritualPostBody';

/**
 * RitualBody — ONE rendering of a community post's body, shared by the Today
 * tile and the thread drawer.
 *
 * Ali, 2026-09-11: "Make sure these text are formatted in the timeline the same
 * way they are formatted when you click on it." They were not. The drawer split
 * the stored body into its guided sections and rendered each with `pre-wrap`,
 * so a "Steal This Prompt" post kept its labels, its bullet list and its line
 * breaks. The tile rendered the same string inside a single `<p>`, where the
 * default `white-space` collapses every newline — one 40-line wall of prose,
 * heading and all.
 *
 * The fix is this component rather than a second copy of the markup: the
 * PARSING and the STRUCTURE now have one definition, and the tile cannot drift
 * from the drawer the next time either is touched. Each surface keeps its own
 * class names because they live in different styling worlds — the drawer ships
 * its own `<style>` (it renders outside `.tl-de`), the tile is styled from
 * timeline.css — but the rules behind those names are written to match, and a
 * test pins that both callers produce the same sections from the same body.
 *
 * The ritual HEADING ("🧩 Steal This Prompt · Week 4") is deliberately absent
 * from the output: `parseRitualBody` lifts it out, the drawer shows it in its
 * eyebrow, and the tile already carries it as the card's chip. Repeating it in
 * the body is the duplication Ali flagged on the drawer header in #2426.
 */
export interface RitualBodyClasses {
  /** One section block (label + value). */
  sec: string;
  /** The guided field's label, when the post has one. */
  label: string;
  /** The field's text. MUST be styled `white-space: pre-wrap` — that is what
   *  keeps a bullet list a bullet list. */
  value: string;
}

const RitualBody: React.FC<{ body: string | null | undefined; classes: RitualBodyClasses }> = ({ body, classes }) => {
  const parsed = parseRitualBody(body);
  if (!parsed.sections.length) return null;
  return (
    <>
      {parsed.sections.map((s, i) => (
        <div className={classes.sec} key={i}>
          {s.label && <div className={classes.label}>{s.label}</div>}
          <div className={classes.value}>{s.value}</div>
        </div>
      ))}
    </>
  );
};

export default RitualBody;
