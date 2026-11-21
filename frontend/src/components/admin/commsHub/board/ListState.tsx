import React from 'react';
import type { BoardList } from './useBoard';

/**
 * What a board list shows before it has rows (CH7.4): Loading, or the error with its own retry. Returns
 * null once the rows are in, so the caller renders them (or its empty state, which is then true).
 */
export default function ListState({ list, what }: { list: BoardList; what: string }): React.ReactElement | null {
  if (list.error) {
    return (
      <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-0" role="alert">
        <span>{list.error} The {what} could not be shown.</span>
        <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={list.reload}>Try again</button>
      </div>
    );
  }
  if (!list.rows) return <p className="text-muted mb-0" role="status">Loading...</p>;
  return null;
}
