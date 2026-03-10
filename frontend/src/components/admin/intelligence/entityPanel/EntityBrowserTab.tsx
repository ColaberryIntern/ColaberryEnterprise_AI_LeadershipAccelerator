import React, { useState, useMemo } from 'react';
import { useIntelligenceContext } from '../../../../contexts/IntelligenceContext';
import { BusinessEntityNetwork, EntityNetwork } from '../../../../services/intelligenceApi';
import { BUSINESS_CATEGORIES, formatRowCount } from './businessEntityConfig';

interface Props {
  hierarchy: BusinessEntityNetwork | null;
  network: EntityNetwork | null;
}

export default function EntityBrowserTab({ hierarchy, network }: Props) {
  const { drillDown } = useIntelligenceContext();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  // Build flat entity list from hierarchy + network data
  const entities = useMemo(() => {
    if (!hierarchy || !network) return [];

    const nodeMap = new Map(network.nodes.map((n) => [n.id, n]));

    return hierarchy.categories.flatMap((cat) =>
      cat.matched_tables.map((table) => {
        const node = nodeMap.get(table);
        return {
          table,
          category: cat.id,
          categoryLabel: cat.label,
          rowCount: node?.row_count || 0,
          columnCount: node?.column_count || 0,
          isHub: node?.is_hub || false,
        };
      })
    );
  }, [hierarchy, network]);

  const categories = useMemo(() => {
    if (!hierarchy) return [];
    return hierarchy.categories.filter((c) => c.table_count > 0);
  }, [hierarchy]);

  const filtered = useMemo(() => {
    let list = entities;
    if (categoryFilter) {
      list = list.filter((e) => e.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.table.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.rowCount - a.rowCount);
  }, [entities, categoryFilter, search]);

  const handleClick = (entity: typeof entities[0]) => {
    drillDown(entity.category, entity.table, entity.table);
  };

  if (!hierarchy || !network) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <small>Loading entities...</small>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100">
      {/* Category filter pills */}
      <div className="p-2 border-bottom">
        <div className="d-flex gap-1 flex-wrap mb-2">
          <button
            className={`btn btn-sm ${!categoryFilter ? 'btn-primary' : 'btn-outline-secondary'}`}
            style={{ fontSize: '0.6rem', padding: '1px 6px' }}
            onClick={() => setCategoryFilter('')}
          >
            All ({entities.length})
          </button>
          {categories.map((cat) => {
            const config = BUSINESS_CATEGORIES[cat.id] || BUSINESS_CATEGORIES.other;
            const isActive = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                className="btn btn-sm"
                style={{
                  fontSize: '0.6rem',
                  padding: '1px 6px',
                  backgroundColor: isActive ? config.color : 'transparent',
                  color: isActive ? 'white' : config.color,
                  border: `1px solid ${config.color}`,
                }}
                onClick={() => setCategoryFilter(isActive ? '' : cat.id)}
              >
                {cat.label} ({cat.table_count})
              </button>
            );
          })}
        </div>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search entities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Entity list */}
      <div className="flex-grow-1 p-2" style={{ overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="text-muted text-center py-4 small">No entities match your filter</div>
        ) : (
          filtered.map((entity) => {
            const config = BUSINESS_CATEGORIES[entity.category] || BUSINESS_CATEGORIES.other;
            return (
              <div
                key={entity.table}
                className="card border-0 shadow-sm mb-2"
                style={{
                  cursor: 'pointer',
                  borderLeft: `3px solid ${config.color}`,
                }}
                onClick={() => handleClick(entity)}
              >
                <div className="card-body p-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-medium small">{entity.table}</span>
                    <span
                      className="badge"
                      style={{
                        fontSize: '0.55rem',
                        backgroundColor: config.bgLight,
                        color: config.color,
                      }}
                    >
                      {entity.categoryLabel}
                    </span>
                  </div>
                  <div className="d-flex gap-2 mt-1">
                    <small className="text-muted">{formatRowCount(entity.rowCount)} rows</small>
                    <small className="text-muted">{entity.columnCount} cols</small>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
