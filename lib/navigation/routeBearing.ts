/**
 * Bearing ao longo da polyline oficial (navegação) + utilitários geográficos.
 * Usado só para rotação visual do marcador — não recalcula geometria.
 */

import { haversineKm, offsetLatLngAlongBearing } from '@/lib/geo';

export type MapCoord = { latitude: number; longitude: number };

/** Bearing inicial entre dois pontos (graus, 0 = Norte, sentido horário). */
export function bearingBetween(a: MapCoord, b: MapCoord): number {
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (((θ * 180) / Math.PI) + 360) % 360;
}

function dist2ToSegment(p: MapCoord, a: MapCoord, b: MapCoord): number {
  const px = p.longitude;
  const py = p.latitude;
  const x1 = a.longitude;
  const y1 = a.latitude;
  const x2 = b.longitude;
  const y2 = b.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const ex = px - x1;
    const ey = py - y1;
    return ex * ex + ey * ey;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  const ex = px - nx;
  const ey = py - ny;
  return ex * ex + ey * ey;
}

/**
 * Bearing do segmento da rota mais próximo do GPS — alinha o carro ao trajeto.
 */
export function bearingAlongPolyline(coords: MapCoord[], lat: number, lng: number): number | null {
  if (coords.length < 2) return null;
  let bestI = 0;
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = dist2ToSegment({ latitude: lat, longitude: lng }, coords[i], coords[i + 1]);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  return bearingBetween(coords[bestI], coords[bestI + 1]);
}

/** Metros entre dois pontos (Haversine). */
function distMeters(a: MapCoord, b: MapCoord): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

/**
 * @deprecated Prefer `bearingForwardAlongPolyline` (sentido explícito pela distância acumulada).
 */
export function bearingLookaheadAlongPolyline(
  coords: MapCoord[],
  lat: number,
  lng: number,
  lookaheadMeters = 48,
): number | null {
  if (coords.length < 2) return null;
  const p0: MapCoord = { latitude: lat, longitude: lng };
  let bestI = 0;
  let best = Infinity;
  let proj: MapCoord = coords[0];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = dist2ToSegment(p0, a, b);
    if (d < best) {
      best = d;
      bestI = i;
      proj = projectOntoSegment(p0, a, b);
    }
  }

  let remain = Math.max(12, lookaheadMeters);
  let seg = bestI;
  let cur: MapCoord = { ...proj };

  while (remain > 0.5 && seg < coords.length - 1) {
    const B = coords[seg + 1];
    const leg = distMeters(cur, B);
    if (leg <= 0.5) {
      cur = { ...B };
      seg++;
      continue;
    }
    if (remain <= leg) {
      const brg = bearingBetween(cur, B);
      const next = offsetLatLngAlongBearing(cur.latitude, cur.longitude, brg, remain);
      return bearingBetween(proj, next);
    }
    remain -= leg;
    cur = { ...B };
    seg++;
  }

  if (coords.length >= 2) {
    const a = coords[coords.length - 2];
    const b = coords[coords.length - 1];
    return bearingBetween(a, b);
  }
  return null;
}

/**
 * Rejeita viragens instantâneas irreais (ex.: polyline corrupta um frame): mantém o último bearing válido.
 */
export function rejectSharpBearingFlip(
  previousAcceptedDeg: number,
  candidateDeg: number,
  maxAbsDiffDeg = 120,
): number {
  if (!Number.isFinite(candidateDeg)) return previousAcceptedDeg;
  if (!Number.isFinite(previousAcceptedDeg)) return candidateDeg;
  const d = Math.abs(shortestAngleDiffDeg(previousAcceptedDeg, candidateDeg));
  if (d > maxAbsDiffDeg) return previousAcceptedDeg;
  return candidateDeg;
}

/** Projeto do GPS na polyline + distância acumulada desde o primeiro vértice (metros). */
export function projectionAlongPolyline(
  coords: MapCoord[],
  lat: number,
  lng: number,
): { distAlong: number; point: MapCoord } | null {
  if (coords.length < 2) return null;
  const p0: MapCoord = { latitude: lat, longitude: lng };
  let bestI = 0;
  let best = Infinity;
  let bestProj = coords[0];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = dist2ToSegment(p0, a, b);
    if (d < best) {
      best = d;
      bestI = i;
      bestProj = projectOntoSegment(p0, a, b);
    }
  }
  let distAlong = 0;
  for (let k = 0; k < bestI; k++) {
    distAlong += distMeters(coords[k], coords[k + 1]);
  }
  distAlong += distMeters(coords[bestI], bestProj);
  return { distAlong, point: bestProj };
}

/**
 * Projeto na polyline sem recuar — distAlong nunca menor que `minDistAlongM`.
 * Evita snap a segmentos já ultrapassados durante reroute.
 */
export function projectionAlongPolylineForward(
  coords: MapCoord[],
  lat: number,
  lng: number,
  minDistAlongM: number,
): { distAlong: number; point: MapCoord } | null {
  const projection = projectionAlongPolyline(coords, lat, lng);
  if (!projection) return null;
  const minAlong = Math.max(0, minDistAlongM);
  if (projection.distAlong >= minAlong) return projection;
  const point =
    coordinateAtDistanceAlongPolyline(coords, minAlong) ?? projection.point;
  return { distAlong: minAlong, point };
}

/** Ponto na polyline à distância `distAlong` (m) desde `coords[0]`. */
export function coordinateAtDistanceAlongPolyline(coords: MapCoord[], distAlong: number): MapCoord | null {
  if (!coords.length) return null;
  if (coords.length < 2) return { ...coords[0] };
  const target = Math.max(0, distAlong);
  let acc = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const leg = distMeters(a, b);
    if (acc + leg >= target) {
      const t = leg > 1e-6 ? (target - acc) / leg : 0;
      return {
        latitude: a.latitude + t * (b.latitude - a.latitude),
        longitude: a.longitude + t * (b.longitude - a.longitude),
      };
    }
    acc += leg;
  }
  return { ...coords[coords.length - 1] };
}

/**
 * Bearing para a frente na rota (sentido índices → destino): projétil mais próximo ao GPS na polyline +
 * ponto ~`lookaheadMeters` à frente pela distância acumulada. Nunca usa vértices atrás do projétil.
 */
export function bearingForwardAlongPolyline(
  coords: MapCoord[],
  lat: number,
  lng: number,
  lookaheadMeters = 36,
): number | null {
  const proj = projectionAlongPolyline(coords, lat, lng);
  if (!proj) return null;
  const { point: P, distAlong } = proj;
  const ahead = distAlong + Math.max(lookaheadMeters, 12);
  const Q = coordinateAtDistanceAlongPolyline(coords, ahead);
  if (!Q) return null;
  const sep = distMeters(P, Q);
  if (sep < 4 && coords.length >= 2) {
    const n = coords.length;
    return bearingBetween(coords[n - 2], coords[n - 1]);
  }
  return bearingBetween(P, Q);
}

/** Avança/recua ao longo da rota em direção ao alvo (anti-salto GPS), em metros por atualização. */
export function chaseDistanceAlongPolyline(
  prevDistAlong: number | null,
  targetDistAlong: number,
  maxForwardM = 22,
  maxBackwardM = 10,
): number {
  if (prevDistAlong == null || !Number.isFinite(prevDistAlong)) return targetDistAlong;
  const delta = targetDistAlong - prevDistAlong;
  if (delta >= 0) return prevDistAlong + Math.min(delta, maxForwardM);
  return prevDistAlong + Math.max(delta, -maxBackwardM);
}

/** Avança ao longo da rota; nunca recua (uso durante isRerouting). */
export function chaseDistanceForwardOnly(
  prevDistAlong: number | null,
  targetDistAlong: number,
  maxForwardM = 22,
): number {
  if (prevDistAlong == null || !Number.isFinite(prevDistAlong)) return targetDistAlong;
  const delta = targetDistAlong - prevDistAlong;
  if (delta <= 0) return prevDistAlong;
  return prevDistAlong + Math.min(delta, maxForwardM);
}

/** Projeta o ponto no segmento AB (graus, espaço lat/lng). */
function projectOntoSegment(p: MapCoord, a: MapCoord, b: MapCoord): MapCoord {
  const px = p.longitude;
  const py = p.latitude;
  const x1 = a.longitude;
  const y1 = a.latitude;
  const x2 = b.longitude;
  const y2 = b.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return { ...a };
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return { latitude: y1 + t * dy, longitude: x1 + t * dx };
}

/**
 * Ponto mais próximo na polyline (snap visual do marcador à rota oficial).
 */
export function nearestPointOnPolyline(coords: MapCoord[], lat: number, lng: number): MapCoord {
  const p: MapCoord = { latitude: lat, longitude: lng };
  if (coords.length === 0) return p;
  if (coords.length === 1) return { ...coords[0] };
  let best = projectOntoSegment(p, coords[0], coords[1]);
  let bestD = dist2ToSegment(p, coords[0], coords[1]);
  for (let i = 1; i < coords.length - 1; i++) {
    const d = dist2ToSegment(p, coords[i], coords[i + 1]);
    if (d < bestD) {
      bestD = d;
      best = projectOntoSegment(p, coords[i], coords[i + 1]);
    }
  }
  return best;
}

/** Diferença angular mínima (-180..180]. */
export function shortestAngleDiffDeg(from: number, to: number): number {
  return ((((to - from + 540) % 360) + 360) % 360) - 180;
}

/** Interpolação angular suave (evita salto 350° → 10°). */
export function lerpHeadingDeg(current: number, target: number, t: number): number {
  const d = shortestAngleDiffDeg(current, target);
  return (current + d * t + 360) % 360;
}
