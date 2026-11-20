import { env } from '../../../config/env';

/** Where members watch replays (CH6.4: the "Recording and thanks" message links it). */
export function replayLink(): string {
  return `${String(env.publicAppUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '')}/portal/replays`;
}
