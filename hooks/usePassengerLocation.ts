/**
 * Hook oficial para a localização atual do passageiro.
 * Toda a app deve usar esta fonte única — nunca chamar expo-location diretamente.
 */
export {
  usePassengerLocation,
  type PassengerCoords,
  type LocationPermissionStatus,
  type PassengerLocationState,
} from '@/contexts/PassengerLocationContext';
