import * as React from 'react';
/** Sliding carousel with prev/next controls and dot indicators. */
export interface CarouselProps { slides: React.ReactNode[]; loop?: boolean; }
export function Carousel(props: CarouselProps): JSX.Element;
