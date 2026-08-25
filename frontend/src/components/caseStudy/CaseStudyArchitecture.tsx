import React from 'react';
import type {
  PublicCaseStudyArchitecture,
  PublicCaseStudyArchitectureEdge,
  PublicCaseStudyArchitectureNode,
} from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyArchitecture - what was built, as the approved snapshot describes it.
 *
 * THE DIAGRAM IS A LIST, NOT A PICTURE. Nodes and edges render as text: a
 * labelled node list and a list of "A connects to B" relations. A generated
 * box-and-arrow drawing would have to invent a layout the source data does not
 * contain, and it would be unreadable to a screen reader and at 320px. A list of
 * verified nodes and verified edges says exactly what the data says and no more,
 * which is the rule for this section - hide rather than fabricate.
 *
 * NODES ARE KEYED BY `key`. Not `id`. On every other shape in this system `id`
 * means a database identifier, and a public payload carrying a field called `id`
 * invites the wrong thing to be put in it. `key` here is a local graph label
 * ("api", "worker") with no meaning outside this diagram - and an edge whose
 * endpoint does not resolve to a node is rendered with the raw key rather than
 * silently dropped, because a missing edge would misrepresent the system.
 *
 * EVERYTHING IS OPTIONAL. Empty arrays and a null diagram mean "hide the
 * subsection"; when all of them are empty the component renders nothing at all,
 * so the page never shows an architecture heading over blank space.
 */

export interface CaseStudyArchitectureProps {
  architecture: PublicCaseStudyArchitecture;
  /** Sub-headings fit the outline the page already established. */
  headingLevel?: 3 | 4 | 5;
  className?: string;
}

function TagGroup({
  title,
  items,
  Heading,
}: {
  title: string;
  items: readonly string[];
  Heading: 'h3' | 'h4' | 'h5';
}): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div>
      <Heading className="cbv2-cs-eyebrow">{title}</Heading>
      <ul className="cbv2-cs-tags">
        {items.map((item) => (
          <li className="cbv2-cs-tag" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The node's own label when the key resolves, otherwise the key itself. */
function endpointLabel(nodes: readonly PublicCaseStudyArchitectureNode[], key: string): string {
  return nodes.find((node) => node.key === key)?.label ?? key;
}

function edgeText(
  nodes: readonly PublicCaseStudyArchitectureNode[],
  edge: PublicCaseStudyArchitectureEdge,
): string {
  const relation = edge.label ? ` (${edge.label})` : '';
  return `${endpointLabel(nodes, edge.from)} to ${endpointLabel(nodes, edge.to)}${relation}`;
}

export function CaseStudyArchitecture({
  architecture,
  headingLevel = 3,
  className,
}: CaseStudyArchitectureProps): React.ReactElement | null {
  const Heading = `h${headingLevel}` as 'h3' | 'h4' | 'h5';
  const diagram = architecture.diagram;
  const nodes = diagram?.nodes ?? [];
  const edges = diagram?.edges ?? [];

  const empty = architecture.narrative.length === 0
    && architecture.stack.length === 0
    && architecture.capabilities.length === 0
    && architecture.integrations.length === 0
    && nodes.length === 0
    && edges.length === 0;
  if (empty) return null;

  return (
    <div className={`cbv2-cs-arch${className ? ` ${className}` : ''}`}>
      {architecture.narrative.length > 0 ? (
        <div className="cbv2-cs-arch__prose">
          {architecture.narrative.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      <TagGroup title="Capabilities" items={architecture.capabilities} Heading={Heading} />
      <TagGroup title="Stack" items={architecture.stack} Heading={Heading} />
      <TagGroup title="Integrations" items={architecture.integrations} Heading={Heading} />

      {nodes.length > 0 ? (
        <div>
          <Heading className="cbv2-cs-eyebrow">Components</Heading>
          <ul className="cbv2-cs-arch__nodes">
            {nodes.map((node) => (
              <li className="cbv2-cs-arch__node" key={node.key} data-node-key={node.key}>
                <span className="cbv2-cs-arch__node-label">{node.label}</span>
                <span className="cbv2-cs-arch__node-kind">{node.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {edges.length > 0 ? (
        <div>
          <Heading className="cbv2-cs-eyebrow">Connections</Heading>
          <ul className="cbv2-cs-arch__edges">
            {edges.map((edge, index) => (
              <li className="cbv2-cs-arch__edge" key={`${edge.from}-${edge.to}-${index}`}>
                {edgeText(nodes, edge)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default CaseStudyArchitecture;
