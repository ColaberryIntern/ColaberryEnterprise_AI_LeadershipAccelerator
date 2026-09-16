import React from 'react';
import { CaseStudyVerificationBadge } from '../../components/caseStudy/CaseStudyVerificationBadge';
import { STATUS_WORD } from './storyVisualModel';
import type { PublicCaseStudyWorkflowNode } from './storyVisualModel';

/**
 * StoryWorkflowPanel - the words for the step the reader has selected.
 *
 * The graph shows shape; this shows substance. One node at a time: its kicker,
 * its name, what it does, where the proof lives, and the one figure the record
 * ties to it, with the same verification badge every other figure on the page
 * carries. Previous and Next walk the panel's selection order and wrap, so a
 * reader on a keyboard can tour the whole flow from one control.
 *
 * `aria-live="polite"` on the body, so a selection made in the graph is read
 * out here without stealing focus from the node that was pressed.
 */

export interface StoryWorkflowPanelProps {
  node: PublicCaseStudyWorkflowNode;
  /** 1-based position in the selection order, and the count. */
  position: number;
  count: number;
  panelLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}

export function StoryWorkflowPanel({
  node, position, count, panelLabel, onPrevious, onNext,
}: StoryWorkflowPanelProps): React.ReactElement {
  const statusWord = STATUS_WORD[node.status];
  return (
    <aside className="cbv2-story-visual__panel" data-testid="story-workflow-panel" aria-label={`${panelLabel}: selected step`}>
      <div className="cbv2-story-visual__panel-body" aria-live="polite">
        <p className="cbv2-story-visual__panel-kicker">
          {node.kicker ?? `Step ${position} of ${count}`}
          <span className={`cbv2-story-visual__status cbv2-story-visual__status--${node.status}`}>{statusWord}</span>
        </p>
        <h4 className="cbv2-story-visual__panel-title">{node.label}</h4>
        {node.sublabel ? <p className="cbv2-story-visual__panel-sub">{node.sublabel}</p> : null}
        {node.detail ? <p className="cbv2-story-visual__panel-detail">{node.detail}</p> : null}
        {node.evidence ? (
          <p className="cbv2-story-visual__panel-evidence">
            <span className="cbv2-story-visual__panel-term">Where the proof lives</span>
            {node.evidence}
          </p>
        ) : null}
        {node.tally ? (
          <p className="cbv2-story-visual__panel-tally" data-testid="story-workflow-tally">
            <strong className="cbv2-story-visual__panel-figure">{node.tally.valueDisplay}</strong>
            <span className="cbv2-story-visual__panel-tally-label">{node.tally.label}</span>
            <CaseStudyVerificationBadge
              verificationClass={node.tally.verificationClass}
              verificationMethod={node.tally.verificationMethod}
              className="cbv2-story-visual__panel-badge"
            />
          </p>
        ) : null}
      </div>
      <div className="cbv2-story-visual__panel-nav" role="group" aria-label="Walk the steps">
        <button
          type="button"
          className="cbv2-story-visual__nav-btn"
          onClick={onPrevious}
          data-story-zone="visual"
          data-visual="workflow"
          data-visual-action="previous"
          disabled={count < 2}
        >
          Previous
        </button>
        <span className="cbv2-story-visual__panel-position">{position} / {count}</span>
        <button
          type="button"
          className="cbv2-story-visual__nav-btn"
          onClick={onNext}
          data-story-zone="visual"
          data-visual="workflow"
          data-visual-action="next"
          disabled={count < 2}
        >
          Next
        </button>
      </div>
    </aside>
  );
}

export default StoryWorkflowPanel;
