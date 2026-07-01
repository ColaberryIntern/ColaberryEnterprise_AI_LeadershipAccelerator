import * as React from 'react';

/** Labelled text input / textarea with helper + error states. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label rendered above the control. */
  label?: string;
  /** Show a red required asterisk. @default false */
  required?: boolean;
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Error message — also switches the field to its error style. */
  error?: string;
  /** Helper text shown below when there is no error. */
  helperText?: string;
  /** Render a multi-line textarea. @default false */
  multiline?: boolean;
}

export function Input(props: InputProps): JSX.Element;
