import React from 'react';

interface Props {
  rows?: number;
  columns?: number;
}

export default function TableSkeleton({ rows = 5, columns = 6 }: Props) {
  return (
    <div className="table-responsive">
      <table className="table mb-0">
        <thead className="table-light">
          <tr>
            {Array.from({ length: columns }).map((_, c) => (
              <th key={c}>
                <div className="skeleton" style={{ width: `${60 + (c % 3) * 20}%`, height: '14px' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c}>
                  <div
                    className="skeleton"
                    style={{ width: `${50 + ((r + c) % 4) * 12}%`, height: '12px' }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
