import * as React from 'react';
export interface Column { key: string; header: React.ReactNode; align?: 'left' | 'right'; render?: (value: any, row: any) => React.ReactNode; }
/** Data table with hover and optional zebra striping. */
export interface TableProps { columns: Column[]; data: any[]; hover?: boolean; striped?: boolean; }
export function Table(props: TableProps): JSX.Element;
