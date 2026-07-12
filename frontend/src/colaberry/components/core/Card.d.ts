import * as React from 'react';

/** Rounded surface container with optional media + accent border. */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Shadow depth. @default "sm" */
  elevation?: 'flat' | 'sm' | 'md';
  /** Colored top accent border. */
  accent?: 'red' | 'green' | 'blue';
  /** Lift on hover (for clickable cards). @default false */
  hoverable?: boolean;
  /** Apply standard body padding when there is no media header. @default false */
  padded?: boolean;
  /** Image URL (renders a 16:9 media header) or a custom node. */
  media?: string | React.ReactNode;
  children?: React.ReactNode;
}

export function Card(props: CardProps): JSX.Element;
