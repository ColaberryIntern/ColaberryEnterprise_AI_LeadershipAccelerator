import React, { useMemo } from 'react';

interface IntelHeatmapProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

function interpolateColor(value: number, min: number, max: number): string {
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  // From light blue (#ebf8ff) to dark navy (#1a365d)
  const r = Math.round(235 - ratio * (235 - 26));
  const g = Math.round(248 - ratio * (248 - 54));
  const b = Math.round(255 - ratio * (255 - 93));
  return `rgb(${r},${g},${b})`;
}

export default function IntelHeatmap({ data, config }: IntelHeatmapProps) {
  if (!data?.length) return null;

  const rowKey = config.row_key || config.y || 'row';
  const colKey = config.col_key || config.x || 'col';
  const valueKey = config.value_key || config.value || 'value';

  const { rows, cols, grid, min, max } = useMemo(() => {
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const map: Record<string, number> = {};
    let minVal = Infinity;
    let maxVal = -Infinity;

    data.forEach((d) => {
      const r = String(d[rowKey]);
      const c = String(d[colKey]);
      const v = Number(d[valueKey]) || 0;
      rowSet.add(r);
      colSet.add(c);
      map[`${r}__${c}`] = v;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    });

    return {
      rows: Array.from(rowSet),
      cols: Array.from(colSet),
      grid: map,
      min: minVal,
      max: maxVal,
    };
  }, [data, rowKey, colKey, valueKey]);

  const cellSize = Math.min(40, Math.floor(600 / Math.max(cols.length, 1)));
  const labelWidth = 120;
  const headerHeight = 50;
  const svgWidth = labelWidth + cols.length * cellSize;
  const svgHeight = headerHeight + rows.length * cellSize;

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 300 }}>
      <svg width={svgWidth} height={svgHeight} style={{ fontFamily: 'inherit' }}>
        {/* Column headers */}
        {cols.map((col, ci) => (
          <text
            key={`h-${ci}`}
            x={labelWidth + ci * cellSize + cellSize / 2}
            y={headerHeight - 8}
            textAnchor="end"
            fontSize={9}
            fill="var(--color-text-light)"
            transform={`rotate(-35, ${labelWidth + ci * cellSize + cellSize / 2}, ${headerHeight - 8})`}
          >
            {col.length > 12 ? col.slice(0, 12) + '...' : col}
          </text>
        ))}

        {/* Rows */}
        {rows.map((row, ri) => (
          <g key={`r-${ri}`}>
            <text
              x={labelWidth - 6}
              y={headerHeight + ri * cellSize + cellSize / 2 + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-text)"
            >
              {row.length > 16 ? row.slice(0, 16) + '...' : row}
            </text>
            {cols.map((col, ci) => {
              const val = grid[`${row}__${col}`] ?? 0;
              return (
                <g key={`c-${ci}`}>
                  <rect
                    x={labelWidth + ci * cellSize}
                    y={headerHeight + ri * cellSize}
                    width={cellSize - 1}
                    height={cellSize - 1}
                    fill={interpolateColor(val, min, max)}
                    rx={3}
                  >
                    <title>{`${row} / ${col}: ${val}`}</title>
                  </rect>
                  {cellSize >= 28 && (
                    <text
                      x={labelWidth + ci * cellSize + cellSize / 2}
                      y={headerHeight + ri * cellSize + cellSize / 2 + 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill={val > (min + max) / 2 ? '#fff' : 'var(--color-text)'}
                    >
                      {val}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
