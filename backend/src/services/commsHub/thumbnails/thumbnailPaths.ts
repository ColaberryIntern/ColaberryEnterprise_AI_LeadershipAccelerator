import type { ThumbSize } from './templateLayout';

/** The portal card's image path for an event's chosen thumbnail (CH4.4); the id busts caches when the choice changes. */
export const publicThumbnailPath = (eventId: string, thumbnailId: string, size: ThumbSize = '16x9'): string => `/api/comms-hub/thumbnails/${eventId}/${size}.png?v=${thumbnailId}`;
