/**
 * Espelha a lógica de `getPassengerRideVisualState` em Zamba-Mocambique (app/page.tsx)
 * quando o estado vem do RPC `obter_estado_corrida_passageiro` (`ui_state`).
 */

export type PassengerVisualState =
  | 'searching'
  | 'no_driver_available'
  | 'driver_assigned'
  | 'driver_arrived'
  | 'on_trip'
  | 'completed'
  | 'cancelled';

export function mapRpcUiStateToPassengerVisual(
  rideUiState: string | null | undefined,
): PassengerVisualState | null {
  if (!rideUiState) return null;

  if (
    ['driver_offer_pending', 'searching_driver', 'searching_another_driver'].includes(rideUiState)
  ) {
    return 'searching';
  }
  if (rideUiState === 'no_driver_available_for_category') {
    return 'no_driver_available';
  }
  if (rideUiState === 'driver_en_route') {
    return 'driver_assigned';
  }
  if (rideUiState === 'driver_arrived') {
    return 'driver_arrived';
  }
  if (rideUiState === 'on_trip') {
    return 'on_trip';
  }
  if (rideUiState === 'completed') {
    return 'completed';
  }
  if (rideUiState === 'cancelled') {
    return 'cancelled';
  }

  return null;
}

/** Estados em que o ecrã "a procurar" / motorista a responder está activo. */
export function isSearchingUiState(uiState: string | null | undefined): boolean {
  if (!uiState) return true;
  return ['driver_offer_pending', 'searching_driver', 'searching_another_driver'].includes(
    uiState,
  );
}
