import React from 'react';
import { ROADMAP_STATUS_GLYPHS, ROADMAP_STATUS_LABELS } from '../../config/caseStudySurfaces';
import type { PublicCaseStudyRoadmapItem } from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyRoadmap - what happened next.
 *
 * STALLED WORK IS SHOWN, NOT HIDDEN. `paused` and `not_pursued` are first-class
 * statuses with their own words, and the component renders them exactly as it
 * renders `shipped`. Spec section 23 is explicit that showing stalled work is
 * allowed and often more credible; a roadmap where everything shipped is the
 * least believable roadmap there is.
 *
 * STATUS IS A WORD FIRST. The glyph is `aria-hidden` decoration beside the
 * label, and nothing about a status is carried by colour: the same rule
 * `Claim.tsx` applies to evidence, applied here so a greyscale print and a
 * colour-blind reader see the same five states.
 */

export interface CaseStudyRoadmapProps {
  items: readonly PublicCaseStudyRoadmapItem[];
  className?: string;
}

export function CaseStudyRoadmap({
  items,
  className,
}: CaseStudyRoadmapProps): React.ReactElement | null {
  if (items.length === 0) return null;

  return (
    <ul className={`cbv2-cs-roadmap${className ? ` ${className}` : ''}`}>
      {items.map((item, index) => (
        <li
          className="cbv2-cs-roadmap__item"
          key={`${item.label}-${index}`}
          data-roadmap-status={item.status}
        >
          <span className="cbv2-cs-roadmap__status">
            <span aria-hidden="true">{ROADMAP_STATUS_GLYPHS[item.status]}</span>
            {ROADMAP_STATUS_LABELS[item.status]}
          </span>
          <span className="cbv2-cs-roadmap__label">{item.label}</span>
          {item.detail ? <p className="cbv2-cs-roadmap__detail">{item.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default CaseStudyRoadmap;
