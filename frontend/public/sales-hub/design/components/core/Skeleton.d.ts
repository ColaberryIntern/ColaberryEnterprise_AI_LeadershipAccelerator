import * as React from 'react';
/** Shimmering loading placeholder. */
export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> { variant?: 'rect' | 'text' | 'circle'; width?: number | string; height?: number | string; radius?: number | string; }
export function Skeleton(props: SkeletonProps): JSX.Element;
