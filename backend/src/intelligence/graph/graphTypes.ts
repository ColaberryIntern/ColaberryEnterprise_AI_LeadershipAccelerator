/**
 * Context Graph Type Definitions
 * Models system structure: requirements → files → APIs → services → DB → agents
 */

export type NodeType = 'process' | 'feature' | 'requirement' | 'file' | 'service' | 'api_route' | 'db_model' | 'agent' | 'gap';
export type EdgeType = 'contains' | 'implements' | 'matched_to' | 'depends_on' | 'calls' | 'writes_to' | 'reads_from' | 'missing' | 'verified' | 'enables';
export type NodeStatus = 'active' | 'partial' | 'missing' | 'verified' | 'unverified';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  status: NodeStatus;
  metadata: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight?: number;
  metadata?: Record<string, any>;
}

export class ContextGraph {
  nodes: Map<string, GraphNode> = new Map();
  edges: GraphEdge[] = [];

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    // Only add if both nodes exist
    if (this.nodes.has(edge.from) && this.nodes.has(edge.to)) {
      this.edges.push(edge);
    }
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.edges.filter(e => e.from === nodeId);
  }

  getEdgesTo(nodeId: string): GraphEdge[] {
    return this.edges.filter(e => e.to === nodeId);
  }

  getNodesByType(type: NodeType): GraphNode[] {
    return [...this.nodes.values()].filter(n => n.type === type);
  }

  getConnectedNodes(nodeId: string, edgeType?: EdgeType): GraphNode[] {
    return this.getEdgesFrom(nodeId)
      .filter(e => !edgeType || e.type === edgeType)
      .map(e => this.nodes.get(e.to))
      .filter((n): n is GraphNode => !!n);
  }

  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[]; summary: Record<string, number> } {
    const summary: Record<string, number> = {};
    for (const n of this.nodes.values()) {
      summary[n.type] = (summary[n.type] || 0) + 1;
    }
    return { nodes: [...this.nodes.values()], edges: this.edges, summary };
  }
}
