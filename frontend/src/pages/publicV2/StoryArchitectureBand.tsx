import React from 'react';
import CaseStudyArchitecture, {
  CaseStudyArchitectureInventory,
  CaseStudyArchitectureProse,
} from '../../components/caseStudy/CaseStudyArchitecture';
import StoryDiagram from './StoryDiagram';
import { diagramSourceOf } from './storyMediaModel';
import type { PublicCaseStudyArchitecture } from '../../services/caseStudyPublicTypes';

/**
 * StoryArchitectureBand - "What was built", in the order a reader can take it.
 *
 * THE PROSE, THEN THE DRAWING, THEN THE VERIFIED INVENTORY FOLDED. This band
 * used to print the lists first and the drawing last, so a reader met what the
 * repository evidenced before what somebody sketched. In practice the sequence
 * read as capabilities, stack, integrations, data stores, components and
 * twelve connection sentences before a picture that says the same thing in one
 * glance; the review of the first record published under this format called
 * it exhausting, and it was. The drawing now follows the prose, and every list
 * sits under "View technical proof": still in the document (a reader with the
 * disclosure closed can still find and open it; a screen reader still reaches
 * it), still captioned by `StoryDiagram` as drawn by the team rather than
 * verified.
 *
 * ON A RECORD WITH NO DRAWING THE LISTS ARE THE ARCHITECTURE and stay open,
 * exactly as before. Folding them would hide the only description the record
 * has behind a control that promises something more.
 *
 * Page-local, like `StoryDiagram`, and styled from the same sheet as the
 * diagram it sits under (`storyMediaV2.css`, imported by the page and the
 * article), so the page's main sheet stays under the ceiling the contract
 * test holds it to.
 */
export interface StoryArchitectureBandProps {
  architecture: PublicCaseStudyArchitecture | null;
  /**
   * True when the visual story band above already drew the flow. The Mermaid
   * drawing then folds under "View technical proof" beside the inventory: two
   * pictures of the same system, one interactive and one static, a screen
   * apart, read as a repeat. It is still in the document and still captioned.
   */
  diagramFolded?: boolean;
}

export function StoryArchitectureBand({
  architecture,
  diagramFolded = false,
}: StoryArchitectureBandProps): React.ReactElement | null {
  if (!architecture) return null;
  const source = diagramSourceOf(architecture);
  if (!source) {
    return <CaseStudyArchitecture architecture={architecture} headingLevel={3} />;
  }
  return (
    <>
      <CaseStudyArchitectureProse architecture={architecture} />
      {diagramFolded ? null : <StoryDiagram source={source} />}
      <details className="cbv2-story__proof" data-testid="story-technical-proof" data-diagram-folded={diagramFolded}>
        <summary className="cbv2-story__proof-summary">View technical proof</summary>
        <div className="cbv2-story__proof-body">
          {diagramFolded ? <StoryDiagram source={source} /> : null}
          <CaseStudyArchitectureInventory architecture={architecture} headingLevel={3} />
        </div>
      </details>
    </>
  );
}

export default StoryArchitectureBand;
