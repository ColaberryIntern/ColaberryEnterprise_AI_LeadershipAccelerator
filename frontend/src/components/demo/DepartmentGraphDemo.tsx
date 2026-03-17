import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  NodeProps,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GRAPH_NODES, GRAPH_EDGES, GraphNode } from './demoData';

type GraphNodeData = GraphNode & { selected: boolean; demoZoomTarget: string | null };

// --- Custom Node Component ---

function DepartmentNodeComponent({ data }: NodeProps<GraphNodeData>) {
  const isClickable = data.hasDepartmentData;
  const size = isClickable ? 100 : 80;

  return (
    <div
      className="text-center d-flex flex-column align-items-center justify-content-center"
      style={{
        background: data.selected ? data.bgLight || '#f7fafc' : '#fff',
        border: `3px solid ${data.selected ? data.color : 'var(--color-border)'}`,
        borderRadius: '50%',
        width: size,
        height: size,
        cursor: isClickable ? 'pointer' : 'default',
        boxShadow: data.selected
          ? `0 0 0 4px ${data.color}25, 0 2px 8px rgba(0,0,0,0.1)`
          : '0 1px 4px rgba(0,0,0,0.08)',
        opacity: data.selected ? 1 : (data.demoZoomTarget ? 0.45 : 1),
        transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s, opacity 0.4s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: isClickable ? '1.2rem' : '1rem', lineHeight: 1 }} aria-hidden="true">
        {data.icon}
      </div>
      <div
        className="fw-semibold"
        style={{ fontSize: '0.6rem', color: data.color, lineHeight: 1.2, marginTop: 2 }}
      >
        {data.label}
      </div>
      <div className="text-muted" style={{ fontSize: '0.55rem', lineHeight: 1 }}>
        {data.agents}
      </div>
      {data.hasDepartmentData && (
        <span
          className="demo-pulse-dot"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: data.color,
            display: 'block',
          }}
        />
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { department: DepartmentNodeComponent };

// --- Inner Graph (needs ReactFlowProvider wrapping) ---

interface InnerGraphProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  demoZoomTarget?: string | null;
  isZoomedIn?: boolean;
}

function InnerGraph({ selectedId, onSelect, demoZoomTarget, isZoomedIn }: InnerGraphProps) {
  const { setCenter, fitView } = useReactFlow();

  // Cinematic zoom: animate viewport toward selected department node
  useEffect(() => {
    if (!demoZoomTarget) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animDuration = prefersReduced ? 0 : undefined;

    const node = GRAPH_NODES.find((n) => n.id === demoZoomTarget);
    if (!node) return;

    if (isZoomedIn) {
      // Zoom IN: center on node at 1.3x zoom
      setCenter(node.position.x + 50, node.position.y + 50, {
        zoom: 1.3,
        duration: animDuration ?? 800,
      });
    } else {
      // Zoom OUT: fit entire graph
      fitView({ padding: 0.2, duration: animDuration ?? 600 });
    }
  }, [demoZoomTarget, isZoomedIn, setCenter, fitView]);

  const nodes: Node<GraphNodeData>[] = useMemo(
    () =>
      GRAPH_NODES.map((n) => ({
        id: n.id,
        type: 'department',
        position: n.position,
        data: { ...n, selected: n.id === selectedId, demoZoomTarget: demoZoomTarget ?? null },
        draggable: false,
      })),
    [selectedId, demoZoomTarget],
  );

  const edges: Edge[] = useMemo(
    () =>
      GRAPH_EDGES.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: e.source === selectedId || e.target === selectedId,
        style: {
          stroke:
            e.source === selectedId || e.target === selectedId
              ? 'var(--color-primary)'
              : 'var(--color-border)',
          strokeWidth: e.source === selectedId || e.target === selectedId ? 2 : 1,
        },
      })),
    [selectedId],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<GraphNodeData>) => {
      if (node.data.hasDepartmentData) {
        onSelect(node.id);
      }
    },
    [onSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      panOnDrag
      zoomOnScroll
      fitView
      fitViewOptions={{ padding: 0.2 }}
      defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
      minZoom={0.5}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      style={{ background: 'transparent' }}
    >
      <Background color="var(--color-border)" gap={24} size={1} />
      <Controls
        showInteractive={false}
        position="bottom-right"
        style={{ borderRadius: 8, border: '1px solid var(--color-border)' }}
      />
    </ReactFlow>
  );
}

// --- Exported Component ---

interface DepartmentGraphDemoProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  demoZoomTarget?: string | null;
  isZoomedIn?: boolean;
}

export default function DepartmentGraphDemo({
  selectedId,
  onSelect,
  demoZoomTarget,
  isZoomedIn,
}: DepartmentGraphDemoProps) {
  return (
    <div
      style={{
        width: '100%',
        height: 520,
        borderRadius: 12,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      <ReactFlowProvider>
        <InnerGraph
          selectedId={selectedId}
          onSelect={onSelect}
          demoZoomTarget={demoZoomTarget}
          isZoomedIn={isZoomedIn}
        />
      </ReactFlowProvider>
    </div>
  );
}
