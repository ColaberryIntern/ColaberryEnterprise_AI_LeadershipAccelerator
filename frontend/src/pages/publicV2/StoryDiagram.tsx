import React from 'react';
import MermaidDiagram from '../../components/visuals/MermaidDiagram';

/**
 * StoryDiagram - the human-authored chart, clearly labelled as one.
 *
 * IT IS AN ADDITION, NEVER A REPLACEMENT. `CaseStudyArchitecture` renders the
 * verified node and edge lists as TEXT, and its header says why: *"a list of
 * verified nodes and verified edges says exactly what the data says and no
 * more"*. A chart generated from those same nodes would have to invent a layout
 * the data does not contain. So this band renders only what a person actually
 * drew, it sits beside the verified list rather than instead of it, and the
 * eyebrow says whose picture it is - because the difference between "the
 * repository evidenced this shape" and "somebody drew this shape" is exactly the
 * distinction the rest of this page spends its effort on.
 *
 * IT HIDES WHEN THERE IS NOTHING TO DRAW, which is the normal case. `null` in,
 * nothing out - no heading, no empty frame, no "diagram coming soon".
 *
 * MERMAID IS NOT A DEPENDENCY. `MermaidDiagram` fetches it at runtime from a CDN
 * through `import()` with `webpackIgnore`, so it adds nothing to the bundle and
 * is fetched only on a page that actually carries a chart. When the CDN is
 * blocked - CSP, offline, an ad blocker - it renders a captioned placeholder
 * instead of failing, and the verified node and edge lists next to it still say
 * everything the record can prove. The band degrading to text is the designed
 * outcome, not a regression.
 */

export interface StoryDiagramProps {
  /**
   * Mermaid source, already sanitised server-side by `projectDiagramSource`:
   * length-capped and refused outright if it contains `<`. Nothing is
   * re-validated here, because re-validating on the client would imply the wire
   * could carry something the server let through.
   */
  source: string | null;
  /** Sits under the chart, and inside the placeholder when the CDN is blocked. */
  caption?: string;
}

export const STORY_DIAGRAM_EYEBROW = 'Diagram (drawn by the team)';

export function StoryDiagram({
  source,
  caption = 'A diagram the delivery team drew. The verified components and connections are listed above.',
}: StoryDiagramProps): React.ReactElement | null {
  if (!source) return null;

  return (
    <div className="cbv2-story__diagram" data-testid="story-diagram">
      {/* An `h3`, matching the sub-headings `CaseStudyArchitecture` prints inside
          this same section, so the outline stays h1 > h2 > h3 with no gap. */}
      <h3 className="cbv2-cs-eyebrow">{STORY_DIAGRAM_EYEBROW}</h3>
      <MermaidDiagram chart={source} caption={caption} />
    </div>
  );
}

export default StoryDiagram;
