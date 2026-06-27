import { rideService } from '@/services/rideService';

/** Status em `rides` que indicam corrida activa (incl. procura de motorista). */
const ACTIVE_RIDE_STATUSES = new Set([
  'searching',
  'offered',
  'accepted',
  'arriving',
  'arrived',
  'ontrip',
]);

/** `ui_state` do RPC `obter_estado_corrida_passageiro`. */
const ACTIVE_RIDE_UI_STATES = new Set([
  'searching',
  'offered',
  'driver_offer_pending',
  'searching_driver',
  'searching_another_driver',
  'driver_en_route',
  'driver_arrived',
  'on_trip',
]);

export type PassengerActiveRide = {
  id: string;
  status: string;
  ui_state: string;
  pickup_address?: string;
  dropoff_address?: string;
  driver_name?: string;
  vehicle_plate?: string;
};

export function isPassengerActiveRideStatus(status: string, uiState: string): boolean {
  const s = status.toLowerCase().trim();
  const u = uiState.toLowerCase().trim();
  if (['completed', 'cancelled'].includes(s)) return false;
  if (u === 'completed' || u === 'cancelled' || u === 'no_driver_available_for_category') return false;
  if (ACTIVE_RIDE_UI_STATES.has(u)) return true;
  if (ACTIVE_RIDE_STATUSES.has(s)) return true;
  return false;
}

export function activeRideSubtitle(ride: PassengerActiveRide): string {
  const u = ride.ui_state.toLowerCase();
  const s = ride.status.toLowerCase();
  if (u === 'on_trip' || s === 'ontrip') return 'A caminho do destino';
  if (u === 'driver_arrived' || s === 'arrived') return 'Motorista chegou ao ponto de recolha';
  return 'Motorista a caminho';
}

export async function fetchActivePassengerRide(
  passengerId: string,
): Promise<PassengerActiveRide | null> {
  if (!passengerId?.trim()) return null;

  const latest = await rideService.getLatestRide(passengerId);
  if (!latest) return null;

  const id = String(latest.id ?? '');
  if (!id) return null;

  const row = await rideService.getRideSearchStatus(id);
  if (!row || typeof row !== 'object') return null;

  const r = row as Record<string, unknown>;
  const status = String(r.status ?? latest.status ?? '');
  const ui_state = String(r.ui_state ?? r.search_status ?? status);

  if (!isPassengerActiveRideStatus(status, ui_state)) return null;

  return {
    id,
    status,
    ui_state,
    pickup_address:
      r.pickup_address != null ? String(r.pickup_address) : undefined,
    dropoff_address:
      r.dropoff_address != null ? String(r.dropoff_address) : undefined,
    driver_name: r.driver_name != null ? String(r.driver_name) : undefined,
    vehicle_plate: r.vehicle_plate != null ? String(r.vehicle_plate) : undefined,
  };
}
