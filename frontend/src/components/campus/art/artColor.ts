/** A campus art color as a CSS token (campusArtTokens.css). The only way art components name a color. */
export const art = (name: string): string => `var(--cm-art-${name})`;

/** The roof families drawn by the prototype's drawBuilding (docs/design/campus/colaberry-campus.html ~1638-1727). */
export type RoofKind = 'pediment' | 'gable' | 'tower' | 'flat' | 'dome' | 'office' | 'pavilion' | 'amphi' | 'arcade';

/** Geometry every art component receives: the building id (for its color tokens) and its size; y = 0 is the ground line. */
export interface ArtProps { id: string; w: number; h: number }
