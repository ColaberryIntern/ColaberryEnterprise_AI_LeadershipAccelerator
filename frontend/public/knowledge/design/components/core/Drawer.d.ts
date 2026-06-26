import * as React from 'react';
/** Edge-anchored slide-in panel. Controlled via `open`. */
export interface DrawerProps { open: boolean; side?: 'right' | 'left'; title?: React.ReactNode; onClose?: () => void; children?: React.ReactNode; }
export function Drawer(props: DrawerProps): JSX.Element | null;
