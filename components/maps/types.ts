import type { LiveRoute } from '@/services/rideService';
import type { PassengerVisualState } from '@/lib/passengerRideVisualState';

export type MapLatLng = {
  latitude: number;
  longitude: number;
};

export type NavigationPhase = 'to_pickup' | 'to_destination';

export type PassengerActiveRideMapProps = {
  rideId: string;
  uiState: string;
  visual: PassengerVisualState | null;
  liveRoute: LiveRoute | null;
  pickup: { lat?: number; lng?: number; address?: string } | null;
  destination: { lat?: number; lng?: number; address?: string } | null;
  driverLocation: { lat?: number; lng?: number } | null;
  mapPadding: { top: number; right: number; bottom: number; left: number };
  recenterSignal?: number;
  onMapReady?: () => void;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
};
