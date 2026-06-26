import * as React from 'react';
/** Centered modal dialog with scrim. Controlled via `open`. */
export interface DialogProps { open: boolean; title?: React.ReactNode; onClose?: () => void; footer?: React.ReactNode; children?: React.ReactNode; }
export function Dialog(props: DialogProps): JSX.Element | null;
