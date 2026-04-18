import type MapView from 'react-native-maps';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Fit the map camera so ALL given points are visible with a small margin.
 *
 * IMPORTANT: This assumes the MapView already has `mapPadding` set to
 * account for the top bar and bottom card. The edgePadding here is just
 * a small visual breathing room inside the already-usable area.
 */
export function fitMapCamera(
  mapRef: React.RefObject<MapView | null>,
  points: LatLng[],
  opts?: { animated?: boolean },
) {
  if (!mapRef.current || points.length < 2) return;

  mapRef.current.fitToCoordinates(points, {
    edgePadding: { top: 30, right: 40, bottom: 30, left: 40 },
    animated: opts?.animated ?? true,
  });
}
