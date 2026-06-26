import * as React from 'react';

/**
 * Colaberry button. Cherry-red primary by default.
 */
export interface ButtonProps extends React.HTMLAttributes<HTMLElement> {
  /** Visual style. @default "primary" */
  variant?: 'primary' | 'solid' | 'outline' | 'ghost' | 'link';
  /** Brand fill tone for solid/primary buttons. @default cherry red */
  tone?: 'red' | 'green' | 'blue';
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch to container width. @default false */
  fullWidth?: boolean;
  /** Icon node rendered before the label. */
  leadingIcon?: React.ReactNode;
  /** Icon node rendered after the label. */
  trailingIcon?: React.ReactNode;
  /** Render as a different element (e.g. 'a'). Auto-detects 'a' when href is set. */
  as?: any;
  /** When set (or as='a'), renders an anchor. */
  href?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
