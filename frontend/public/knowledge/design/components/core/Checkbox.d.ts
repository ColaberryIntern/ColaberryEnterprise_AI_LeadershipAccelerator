import * as React from 'react';

/** Checkbox with a leaf-green checked state. */
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label text beside the box (or pass children). */
  label?: React.ReactNode;
  disabled?: boolean;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
