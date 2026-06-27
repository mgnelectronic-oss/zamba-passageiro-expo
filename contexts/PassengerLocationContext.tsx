import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { reverseGeocode } from '@/services/googleGeocoding';
import { mapCacheService } from '@/services/cache/mapCacheService';
import { primeMapCenter } from '@/services/mapLocationMemory';

/** Estrutura padronizada da localização do passageiro. */
export type PassengerCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
};

export type LocationPermissionStatus = 'undetermined' | 'granted' | 'denied' | 'blocked';

export type PassengerLocationState = {
  /** Última localização conhecida (fresca do GPS ou semente do cache). */
  currentLocation: PassengerCoords | null;
  /** Endereço (reverse geocoding) da localização atual, quando disponível. */
  currentAddress: string | null;
  isLoadingLocation: boolean;
  locationPermissionStatus: LocationPermissionStatus;
  locationError: string | null;
  /** Existe alguma coordenada utilizável (mesmo que do cache). */
  hasLocation: boolean;
  /** Permissão concedida e coordenada disponível. */
  isLocationAvailable: boolean;
  /** Re-verifica permissão e atualiza a localização (botão "Tentar novamente"). */
  refreshLocation: () => Promise<void>;
  /**
   * Fonte oficial para fluxos que exigem posição fresca no momento (SOS, recentrar mapa).
   * Garante permissão, deduplica chamadas simultâneas e atualiza o estado global.
   */
  getFreshPosition: () => Promise<PassengerCoords | null>;
};

const GPS_ERROR_MESSAGE = 'Não foi possível obter a sua localização.';
const PERMISSION_ERROR_MESSAGE = 'Permissão de localização negada.';

const defaultState: PassengerLocationState = {
  currentLocation: null,
  currentAddress: null,
  isLoadingLocation: true,
  locationPermissionStatus: 'undetermined',
  locationError: null,
  hasLocation: false,
  isLocationAvailable: false,
  refreshLocation: async () => {},
  getFreshPosition: async () => null,
};

const PassengerLocationContext = createContext<PassengerLocationState>(defaultState);

function toCoords(pos: Location.LocationObject): PassengerCoords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? undefined,
    heading: pos.coords.heading,
    speed: pos.coords.speed,
    timestamp: pos.timestamp,
  };
}

export function PassengerLocationProvider({ children }: { children: React.ReactNode }) {
  const [currentLocation, setCurrentLocation] = useState<PassengerCoords | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [locationPermissionStatus, setLocationPermissionStatus] =
    useState<LocationPermissionStatus>('undetermined');
  const [locationError, setLocationError] = useState<string | null>(null);

  /** Evita múltiplas chamadas simultâneas a getCurrentPositionAsync. */
  const positionInFlightRef = useRef<Promise<PassengerCoords | null> | null>(null);
  /** True após a primeira posição fresca do GPS (a semente do cache não a sobrepõe). */
  const hasFreshFixRef = useRef(false);
  const permissionRef = useRef<LocationPermissionStatus>('undetermined');
  const locationRef = useRef<PassengerCoords | null>(null);

  const setPermission = useCallback((status: LocationPermissionStatus) => {
    permissionRef.current = status;
    setLocationPermissionStatus(status);
  }, []);

  const applyPosition = useCallback((coords: PassengerCoords) => {
    hasFreshFixRef.current = true;
    locationRef.current = coords;
    setCurrentLocation(coords);
    setLocationError(null);
    primeMapCenter(coords.latitude, coords.longitude);

    const fallbackAddress = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
    reverseGeocode(coords.latitude, coords.longitude)
      .then((addr) => {
        setCurrentAddress(addr);
        void mapCacheService.setLastKnownLocation(coords.latitude, coords.longitude, addr);
      })
      .catch(() => {
        setCurrentAddress((prev) => prev ?? fallbackAddress);
        void mapCacheService.setLastKnownLocation(
          coords.latitude,
          coords.longitude,
          fallbackAddress,
        );
      });
  }, []);

  /** Verifica (e opcionalmente pede) permissão; devolve o estado mapeado. */
  const resolvePermission = useCallback(
    async (askIfNeeded: boolean): Promise<LocationPermissionStatus> => {
      try {
        let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED && askIfNeeded && canAskAgain) {
          const asked = await Location.requestForegroundPermissionsAsync();
          status = asked.status;
          canAskAgain = asked.canAskAgain;
        }
        const mapped: LocationPermissionStatus =
          status === Location.PermissionStatus.GRANTED
            ? 'granted'
            : status === Location.PermissionStatus.UNDETERMINED
              ? 'undetermined'
              : canAskAgain
                ? 'denied'
                : 'blocked';
        setPermission(mapped);
        return mapped;
      } catch {
        return permissionRef.current;
      }
    },
    [setPermission],
  );

  /** Busca a posição do GPS com deduplicação de chamadas simultâneas. */
  const fetchPosition = useCallback(async (): Promise<PassengerCoords | null> => {
    if (positionInFlightRef.current) return positionInFlightRef.current;

    const promise = (async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = toCoords(pos);
        applyPosition(coords);
        return coords;
      } catch {
        setLocationError(GPS_ERROR_MESSAGE);
        return null;
      } finally {
        positionInFlightRef.current = null;
      }
    })();

    positionInFlightRef.current = promise;
    return promise;
  }, [applyPosition]);

  const locate = useCallback(
    async (askIfNeeded: boolean, options?: { silent?: boolean }) => {
      const hadLocation = locationRef.current != null;
      if (!options?.silent && !hadLocation) {
        setIsLoadingLocation(true);
      }
      if (!options?.silent) {
        setLocationError(null);
      }
      try {
        const permission = await resolvePermission(askIfNeeded);
        if (permission !== 'granted') {
          if (!options?.silent) setLocationError(PERMISSION_ERROR_MESSAGE);
          return;
        }
        await fetchPosition();
      } finally {
        if (!options?.silent && !hadLocation) {
          setIsLoadingLocation(false);
        }
      }
    },
    [resolvePermission, fetchPosition],
  );

  const refreshLocation = useCallback(async () => {
    await locate(true);
  }, [locate]);

  const getFreshPosition = useCallback(async (): Promise<PassengerCoords | null> => {
    const permission = await resolvePermission(true);
    if (permission !== 'granted') return null;
    return fetchPosition();
  }, [resolvePermission, fetchPosition]);

  /** Arranque: semente do cache (instantânea) + posição fresca em paralelo. */
  useEffect(() => {
    let cancelled = false;

    void mapCacheService.getLastKnownLocation().then((last) => {
      if (cancelled || !last || hasFreshFixRef.current) return;
      const seeded: PassengerCoords = { latitude: last.lat, longitude: last.lng };
      locationRef.current = locationRef.current ?? seeded;
      setCurrentLocation((prev) => prev ?? seeded);
      setCurrentAddress((prev) => prev ?? last.address);
      if (!hasFreshFixRef.current) primeMapCenter(last.lat, last.lng);
    });

    void locate(true);

    return () => {
      cancelled = true;
    };
    // Apenas no arranque — locate é estável e não deve re-disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    locationRef.current = currentLocation;
  }, [currentLocation]);

  /** Ao voltar do background, refresca GPS sem desmontar a app (sem BootScreen). */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void (async () => {
        const before = permissionRef.current;
        const now = await resolvePermission(false);
        if (now === 'granted') {
          if (before !== 'granted' || !locationRef.current) {
            await locate(false);
          } else {
            void fetchPosition();
          }
        }
      })();
    });
    return () => sub.remove();
  }, [resolvePermission, locate, fetchPosition]);

  const hasLocation = currentLocation !== null;

  const value = useMemo<PassengerLocationState>(
    () => ({
      currentLocation,
      currentAddress,
      isLoadingLocation,
      locationPermissionStatus,
      locationError,
      hasLocation,
      isLocationAvailable: locationPermissionStatus === 'granted' && hasLocation,
      refreshLocation,
      getFreshPosition,
    }),
    [
      currentLocation,
      currentAddress,
      isLoadingLocation,
      locationPermissionStatus,
      locationError,
      hasLocation,
      refreshLocation,
      getFreshPosition,
    ],
  );

  return (
    <PassengerLocationContext.Provider value={value}>
      {children}
    </PassengerLocationContext.Provider>
  );
}

export function usePassengerLocation(): PassengerLocationState {
  return useContext(PassengerLocationContext);
}
