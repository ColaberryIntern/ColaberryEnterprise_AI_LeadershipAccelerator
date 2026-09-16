import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { StoryWorkflowPanel } from './StoryWorkflowPanel';
import { layoutWorkflow, orientationFor } from './storyWorkflowLayout';
import type { WorkflowOrientation } from './storyWorkflowLayout';
import { STATUS_WORD, panelSelectionOrder, wrapLabel } from './storyVisualModel';
import type { CaseStudyWorkflowRole, PublicCaseStudyWorkflow, PublicCaseStudyWorkflowPanel } from './storyVisualModel';
import { useWorkflowMotion } from './useWorkflowMotion';

/**
 * StoryWorkflowGraph - the before/after (or single-state) illustration.
 *
 * AN SVG A KEYBOARD CAN DRIVE. Every node is a `<g role="button" tabindex=0
 * aria-pressed>`; Enter and Space select it, the panel beside the graph reads
 * it out, and Before/After are real buttons with `aria-pressed`. Nothing is
 * legible only by colour: role and status are words in the box and in the
 * accessible name, and the lane is a labelled band.
 *
 * NOTHING HERE IS A FIGURE. The graph draws the record's own nodes and edges
 * and nothing it computes is a number a reader could mistake for a result. The
 * one figure a step can carry, its tally, is a projected metric shown in the
 * panel with the page's verification badge.
 *
 * STATIC FIRST. The description and a plain ordered list of the steps are in
 * the DOM whatever the script does, so a print, a crawler or a reader with
 * scripts off gets the flow in words.
 */

export interface StoryWorkflowGraphProps {
  workflow: PublicCaseStudyWorkflow;
  motion: 'auto' | 'off';
}

const ROLE_WORD: Readonly<Record<CaseStudyWorkflowRole, string>> = Object.freeze({
  human: 'Person', system: 'System', external: 'External', data: 'Data',
});

/** Horizontal at 768 and wider; measured on mount and on resize. */
function useOrientation(): WorkflowOrientation {
  const [orientation, setOrientation] = useState<WorkflowOrientation>(() =>
    (typeof window === 'undefined' ? 'horizontal' : orientationFor(window.innerWidth)));
  useEffect(() => {
    const onResize = (): void => setOrientation(orientationFor(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return orientation;
}

function StepList({ panel }: { panel: PublicCaseStudyWorkflowPanel }): React.ReactElement {
  return (
    <ol className="cbv2-sr-only" data-testid="story-workflow-steps">
      {panelSelectionOrder(panel).map((key) => {
        const node = panel.nodes.find((n) => n.key === key)!;
        return <li key={key}>{node.label}: {STATUS_WORD[node.status]}{node.detail ? `. ${node.detail}` : ''}</li>;
      })}
    </ol>
  );
}

export function StoryWorkflowGraph({ workflow, motion }: StoryWorkflowGraphProps): React.ReactElement {
  const uid = useId();
  const orientation = useOrientation();
  const [panelKey, setPanelKey] = useState<string>(() =>
    (workflow.panels.find((p) => p.key === 'after') ?? workflow.panels[0]).key);
  const panel = workflow.panels.find((p) => p.key === panelKey) ?? workflow.panels[0];
  const order = useMemo(() => panelSelectionOrder(panel), [panel]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const selectedKey = selected[panel.key] ?? panel.initialNodeKey;
  const position = Math.max(0, order.indexOf(selectedKey));
  const node = panel.nodes.find((n) => n.key === selectedKey) ?? panel.nodes[0];
  const layout = useMemo(() => layoutWorkflow(panel, orientation), [panel, orientation]);
  const { svgRef, layerRef, state, togglePause } = useWorkflowMotion(motion === 'auto', panel.key);

  const select = useCallback((key: string) => {
    setSelected((s) => ({ ...s, [panel.key]: key }));
  }, [panel.key]);
  const step = useCallback((delta: number) => {
    const next = order[(position + delta + order.length) % order.length];
    if (next) select(next);
  }, [order, position, select]);
  const onKey = (key: string) => (event: React.KeyboardEvent<SVGGElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(key);
    }
  };

  const arrow = `cbv2-arrow-${uid}`;
  const motionLabel = state === 'running' ? 'Pause motion' : state === 'paused' ? 'Play motion' : 'Reduced motion';

  return (
    <div className="cbv2-story-visual__workflow" data-testid="story-workflow" data-orientation={orientation}>
      <div className="cbv2-story-visual__workflow-head">
        <h3 className="cbv2-story-visual__title">{workflow.title}</h3>
        {workflow.caption ? <p className="cbv2-story-visual__caption">{workflow.caption}</p> : null}
        <p className="cbv2-story-visual__description">{workflow.description}</p>
      </div>

      {workflow.type === 'before_after' ? (
        <div className="cbv2-story-visual__toggle" role="group" aria-label="Workflow state">
          {workflow.panels.map((p) => (
            <button
              key={p.key}
              type="button"
              className="cbv2-story-visual__toggle-btn"
              aria-pressed={p.key === panel.key}
              onClick={() => setPanelKey(p.key)}
              data-story-zone="visual"
              data-visual="workflow"
              data-visual-action={`panel:${p.key}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      {panel.summary ? <p className="cbv2-story-visual__panel-summary">{panel.summary}</p> : null}

      <div className="cbv2-story-visual__stage">
        <div className="cbv2-story-visual__canvas">
          <svg
            ref={svgRef}
            className="cbv2-story-visual__svg"
            viewBox={layout.viewBox}
            /* Natural size when horizontal, so a wide flow scrolls inside its
               canvas at legible type instead of shrinking the whole drawing
               to fit; the vertical column scales to the phone's width. */
            width={orientation === 'horizontal' ? layout.width : undefined}
            height={orientation === 'horizontal' ? layout.height : undefined}
            role="group"
            aria-label={`${panel.label}: ${panel.nodes.length} steps, ${panel.edges.length} connections`}
            data-testid="story-workflow-svg"
          >
            <defs>
              <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="cbv2-story-visual__arrowhead" />
              </marker>
            </defs>
            {layout.lanes.map((lane) => (
              <g key={lane.lane} className={`cbv2-story-visual__lane cbv2-story-visual__lane--${lane.lane}`}>
                <rect x={lane.x} y={lane.y} width={lane.width} height={lane.height} className="cbv2-story-visual__lane-band" />
                {orientation === 'horizontal' ? (
                  <text x={lane.x + 16} y={lane.y + 17} className="cbv2-story-visual__lane-label">{lane.label}</text>
                ) : null}
              </g>
            ))}
            {layout.edges.map((edge, i) => (
              <g key={`${edge.from}>${edge.to}`} className={`cbv2-story-visual__edge cbv2-story-visual__edge--${edge.status}${edge.returns ? ' cbv2-story-visual__edge--returns' : ''}`}>
                <path
                  d={edge.d}
                  className="cbv2-story-visual__edge-path"
                  markerEnd={`url(#${arrow})`}
                  data-edge-index={i}
                  data-motion={edge.motion ? 'true' : 'false'}
                  data-status={edge.status}
                />
                {edge.label ? (
                  <text x={edge.labelX} y={edge.labelY - 6} className="cbv2-story-visual__edge-label" textAnchor="middle">{edge.label}</text>
                ) : null}
              </g>
            ))}
            <g ref={layerRef} className="cbv2-story-visual__particles" aria-hidden="true" />
            {layout.nodes.map((box) => {
              const n = panel.nodes.find((x) => x.key === box.key)!;
              const lines = wrapLabel(n.label);
              const current = n.key === selectedKey;
              return (
                <g
                  key={n.key}
                  className={`cbv2-story-visual__node cbv2-story-visual__node--${n.role} cbv2-story-visual__node--${n.status}`}
                  transform={`translate(${box.x} ${box.y})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={current}
                  aria-label={`${n.label}, ${ROLE_WORD[n.role]}, ${STATUS_WORD[n.status]}`}
                  onClick={() => select(n.key)}
                  onKeyDown={onKey(n.key)}
                  data-node-key={n.key}
                  data-story-zone="visual"
                  data-visual="workflow"
                  data-visual-action={`node:${n.key}`}
                >
                  <rect width={box.width} height={box.height} rx="8" className="cbv2-story-visual__node-box" />
                  <text x="12" y="17" className="cbv2-story-visual__node-role">{ROLE_WORD[n.role]}</text>
                  <circle cx={box.width - 12} cy="12" r="4" className="cbv2-story-visual__node-dot" />
                  <text x="12" y={lines.length > 1 ? 36 : 42} className="cbv2-story-visual__node-label">
                    {lines.map((line, li) => <tspan key={li} x="12" dy={li === 0 ? 0 : 15}>{line}</tspan>)}
                  </text>
                </g>
              );
            })}
          </svg>
          <StepList panel={panel} />
        </div>
        <StoryWorkflowPanel
          node={node}
          position={position + 1}
          count={order.length}
          panelLabel={panel.label}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
        />
      </div>

      <p className="cbv2-story-visual__motion-note">
        <span>{workflow.motionNote}</span>
        {state !== 'off' ? (
          <button
            type="button"
            className="cbv2-story-visual__motion-btn"
            onClick={togglePause}
            aria-pressed={state === 'paused'}
            disabled={state === 'reduced'}
            data-story-zone="visual"
            data-visual="workflow"
            data-visual-action={state === 'running' ? 'pause' : 'play'}
            data-testid="story-workflow-motion"
          >
            {motionLabel}
          </button>
        ) : null}
      </p>
    </div>
  );
}

export default StoryWorkflowGraph;
