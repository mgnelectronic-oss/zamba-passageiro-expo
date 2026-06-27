import { setAccessToken } from '@rnmapbox/maps';

export function applyMapboxAccessToken(token: string): void {
  setAccessToken(token);
}
