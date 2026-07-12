import * as React from 'react';
export interface Crumb { label: React.ReactNode; href?: string; onClick?: () => void; }
/** Breadcrumb trail; last item is the current page. */
export interface BreadcrumbProps { items: Crumb[]; }
export function Breadcrumb(props: BreadcrumbProps): JSX.Element;
