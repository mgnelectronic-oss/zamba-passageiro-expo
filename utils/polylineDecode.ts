/** Limite de pontos enviados ao MapView (polylines muito densas sobrecarregam memória nativa no Android). */
export const MAX_MAP_POLYLINE_POINTS = 480;

export type LatLngCoord = { latitude: number; longitude: number };

/**
 * Reduz o número de pontos mantendo início e fim (adequado para desenho da rota no mapa).
 */
export function downsampleRouteCoordinates(coords: LatLngCoord[], maxPoints = MAX_MAP_POLYLINE_POINTS): LatLngCoord[] {
  if (coords.length <= maxPoints) return coords;
  const out: LatLngCoord[] = [];
  const last = coords.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(coords[idx]);
  }
  out[0] = coords[0];
  out[out.length - 1] = coords[last];
  return out;
}

/** Decodifica polyline codificada (Google Directions / ride_live_route). */
export function decodePolyline(encoded: string) {
  const points: LatLngCoord[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}
