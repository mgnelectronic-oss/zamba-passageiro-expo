import type { PassengerActiveRide } from '@/services/passengerActiveRideService';

const SEARCHING_UI_STATES = new Set([
  'searching',
  'offered',
  'driver_offer_pending',
  'searching_driver',
  'searching_another_driver',
]);

const SEARCHING_STATUSES = new Set(['searching', 'offered']);

/** Ecrã principal para corrida activa (prioridade sobre rota persistida genérica). */
export function resolveActiveRidePathname(ride: PassengerActiveRide): '/currentRide' | '/searchingDriver' {
  const u = ride.ui_state.toLowerCase().trim();
  const s = ride.status.toLowerCase().trim();
  if (SEARCHING_UI_STATES.has(u) || SEARCHING_STATUSES.has(s)) {
    return '/searchingDriver';
  }
  return '/currentRide';
}

const RESTORABLE_ROUTES = new Set(['/map', '/search', '/currentRide', '/searchingDriver', '/ride-call']);

export function isRestorableRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.split('?')[0];
  return RESTORABLE_ROUTES.has(p);
}

export function rideIdFromPathname(pathname: string): string | null {
  try {
    const q = pathname.split('?')[1];
    if (!q) return null;
    const params = new URLSearchParams(q);
    const id = params.get('rideId');
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export function pathsMatchForRide(
  currentPath: string,
  targetPath: string,
  rideId: string,
): boolean {
  const curBase = currentPath.split('?')[0];
  const targetBase = targetPath.split('?')[0];
  if (curBase !== targetBase) return false;
  const curRide = rideIdFromPathname(currentPath) ?? rideIdFromPathname(`${curBase}?rideId=${rideId}`);
  return curRide === rideId || curBase === '/currentRide' || curBase === '/searchingDriver';
}
