import * as React from 'react';
export interface AccordionItem { title: React.ReactNode; content: React.ReactNode; }
/** Animated vertical disclosure panels. */
export interface AccordionProps { items: AccordionItem[]; allowMultiple?: boolean; defaultOpen?: number[]; }
export function Accordion(props: AccordionProps): JSX.Element;
