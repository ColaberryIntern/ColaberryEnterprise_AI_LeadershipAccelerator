import * as React from 'react';
/** Notification toast; fixed-bottom by default, or in-flow with `static`. */
export interface ToastProps { open?: boolean; variant?: 'neutral' | 'success' | 'danger' | 'info'; title?: React.ReactNode; children?: React.ReactNode; onClose?: () => void; static?: boolean; }
export function Toast(props: ToastProps): JSX.Element | null;
