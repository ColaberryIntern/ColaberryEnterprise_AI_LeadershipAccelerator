/** Animated progress bar; determinate or indeterminate. */
export interface ProgressProps { value?: number; max?: number; tone?: 'red' | 'green' | 'blue'; indeterminate?: boolean; label?: string; showValue?: boolean; }
export function Progress(props: ProgressProps): JSX.Element;
