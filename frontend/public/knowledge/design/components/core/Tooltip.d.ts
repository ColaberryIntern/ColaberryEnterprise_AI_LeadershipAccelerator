import * as React from 'react';
/** Hover/focus tooltip wrapping a single trigger. */
export interface TooltipProps { label: React.ReactNode; placement?: 'top' | 'bottom' | 'left' | 'right'; children: React.ReactNode; }
export function Tooltip(props: TooltipProps): JSX.Element;
