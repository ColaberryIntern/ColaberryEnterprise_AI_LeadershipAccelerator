import React, { useState, useEffect } from 'react';
import { getMapData, type MapData, type MapNode, type MapEdge } from '../../../../services/reportingApi';
import FeedbackButtons from '../FeedbackButtons';

const MAP_TYPES = [
  { id: 'department', label: 'Department Map' },
  { id: 'agent_activity', label: 'Agent Activity' },
  { id: 'student_journey', label: 'Student Journey' },
  { id: 'campaign_journey', label: 'Campaign Journey' },
  { id: 'revenue_flow', label: 'Revenue Flow' },
];

export default function MapsTab() {
  const [activeMap, setActiveMap] = useState('department');
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getMapData(activeMap);
        setMapData(data);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [activeMap]);

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-semibold mb-0">Intelligence Maps</h5>
      </div>

      <ul className="nav nav-tabs mb-3">
        {MAP_TYPES.map(mt => (
          <li key={mt.id} className="nav-item">
            <button className={`nav-link ${activeMap === mt.id ? 'active' : ''}`}
              onClick={() => setActiveMap(mt.id)}>{mt.label}</button>
          </li>
        ))}
      </ul>

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
      ) : !mapData ? (
        <div className="text-muted text-center py-5">No map data available</div>
      ) : (
        <div>
          <h6 className="fw-semibold mb-3">{mapData.title}</h6>

          {/* Journey/Flow maps rendered as staged flow */}
          {['student_journey', 'campaign_journey', 'revenue_flow'].includes(activeMap) ? (
            <JourneyFlow nodes={mapData.nodes} edges={mapData.edges} />
          ) : (
            <GraphView nodes={mapData.nodes} edges={mapData.edges} />
          )}
        </div>
      )}
    </div>
  );
}

function JourneyFlow({ nodes, edges }: { nodes: MapNode[]; edges: MapEdge[] }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 flex-wrap py-4">
      {nodes.map((node, i) => (
        <React.Fragment key={node.id}>
          <div className="card border-0 shadow-sm" style={{ minWidth: 140 }}>
            <div className="card-body text-center p-3">
              <div className="rounded-circle mx-auto mb-2 d-flex align-items-center justify-content-center"
                style={{ width: 40, height: 40, backgroundColor: node.color, color: '#fff', fontSize: 14, fontWeight: 600 }}>
                {i + 1}
              </div>
              <div className="small fw-semibold">{node.label}</div>
              {node.metadata && Object.keys(node.metadata).length > 0 && (
                <div className="small text-muted mt-1">
                  {Object.entries(node.metadata).slice(0, 2).map(([k, v]) => (
                    <div key={k}>{k.replace(/_/g, ' ')}: {String(v)}</div>
                  ))}
                </div>
              )}
              <div className="mt-1">
                <FeedbackButtons contentType="map" contentKey={`map_journey_${node.id}`} />
              </div>
            </div>
          </div>
          {i < nodes.length - 1 && (
            <div className="text-muted" style={{ fontSize: 20 }}>&#8594;</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function GraphView({ nodes, edges }: { nodes: MapNode[]; edges: MapEdge[] }) {
  return (
    <div className="row g-3">
      {nodes.map(node => (
        <div key={node.id} className="col-md-4 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-2">
                <div className="rounded-circle" style={{ width: 12, height: 12, backgroundColor: node.color, flexShrink: 0 }} />
                <h6 className="fw-semibold small mb-0">{node.label}</h6>
              </div>
              {node.metadata && (
                <div className="small text-muted">
                  {Object.entries(node.metadata).slice(0, 5).map(([key, value]) => (
                    <div key={key} className="d-flex justify-content-between">
                      <span>{key.replace(/_/g, ' ')}</span>
                      <span className="fw-medium">{typeof value === 'number' ? value.toFixed(1) : String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1">
                <FeedbackButtons contentType="map" contentKey={`map_graph_${node.id}`} />
              </div>
            </div>
          </div>
        </div>
      ))}
      {edges.length > 0 && (
        <div className="col-12 mt-2">
          <div className="small text-muted">
            <strong>Connections:</strong> {edges.length} relationships
          </div>
        </div>
      )}
    </div>
  );
}
