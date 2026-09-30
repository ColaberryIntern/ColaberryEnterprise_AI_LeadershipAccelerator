import * as React from 'react';
/** Click-triggered floating panel; closes on outside-click or Esc. */
export interface PopoverProps { trigger: React.ReactNode; placement?: 'top' | 'bottom' | 'right'; children: React.ReactNode; }
export function Popover(props: PopoverProps): JSX.Element;
