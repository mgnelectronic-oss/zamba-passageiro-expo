import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useAppBootstrap } from '@/contexts/AppBootstrapContext';
import { usePassengerActiveRide } from '@/hooks/usePassengerActiveRide';
import {
  isRestorableRoute,
  resolveActiveRidePathname,
} from '@/lib/passengerAppRestoreNavigation';
import {
  clearPassengerAppRestore,
  loadPassengerAppRestore,
  savePassengerAppRestore,
} from '@/services/passengerAppRestoreStorage';
import {
  fetchActivePassengerRide,
  isPassengerActiveRideStatus,
} from '@/services/passengerActiveRideService';

const LOG = '[PASSENGER APP RESTORE]';
const RESTORE_COOLDOWN_MS = 2500;

type RestoreOpts = {
  enabled: boolean;
  locationBootstrapDone: boolean;
};

function log(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.log(LOG, message, extra);
    return;
  }
  console.log(LOG, message);
}

export function usePassengerAppRestore({ enabled, locationBootstrapDone }: RestoreOpts) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ rideId?: string | string[] }>();
  const { user, sessionReady, isHomeDataReady } = useAppBootstrap();
  const { activeRide, refreshActiveRide } = usePassengerActiveRide();

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const restoreInFlightRef = useRef<Promise<void> | null>(null);
  const lastRestoreAtRef = useRef(0);
  const initialRestoreDoneRef = useRef(false);

  const paramRideId = (() => {
    const v = params.rideId;
    if (Array.isArray(v)) return v[0]?.trim() || null;
    return v?.trim() || null;
  })();

  const persistSnapshot = useCallback(async () => {
    const rideId = paramRideId ?? activeRide?.id ?? null;
    await savePassengerAppRestore({
      rideId,
      route: pathname,
    });
    log('estado persistido', { rideId, route: pathname });
  }, [paramRideId, activeRide?.id, pathname]);

  const runRestore = useCallback(
    async (reason: string) => {
      if (!enabled || !sessionReady || !isHomeDataReady || !locationBootstrapDone) {
        log('restore ignorado — pré-condições', {
          reason,
          enabled,
          sessionReady,
          isHomeDataReady,
          locationBootstrapDone,
        });
        return;
      }

      if (!user?.id) {
        log('restore ignorado — sessão ausente', { reason });
        return;
      }

      const now = Date.now();
      if (now - lastRestoreAtRef.current < RESTORE_COOLDOWN_MS) {
        log('restore ignorado — cooldown', { reason });
        return;
      }

      if (restoreInFlightRef.current) {
        log('restore ignorado — já em curso', { reason });
        return restoreInFlightRef.current;
      }

      const promise = (async () => {
        log('consulta de corrida activa', { reason, userId: user.id });

        const persisted = await loadPassengerAppRestore();
        log('último ride_id persistido', {
          rideId: persisted?.rideId ?? null,
          route: persisted?.route ?? null,
          updatedAt: persisted?.updatedAt ?? null,
        });

        let ride = activeRide;
        try {
          ride = await fetchActivePassengerRide(user.id);
          log('status da corrida encontrada', {
            rideId: ride?.id ?? null,
            status: ride?.status ?? null,
            ui_state: ride?.ui_state ?? null,
          });
        } catch (e) {
          log('erro ao consultar corrida activa', {
            error: e instanceof Error ? e.message : String(e),
          });
        }

        if (ride?.id) {
          const targetPath = resolveActiveRidePathname(ride);
          const alreadyThere =
            (pathname === '/currentRide' || pathname === '/searchingDriver') &&
            paramRideId === ride.id;

          if (alreadyThere) {
            log('já na viagem activa — sem navegação', {
              pathname,
              rideId: ride.id,
            });
            await savePassengerAppRestore({ rideId: ride.id, route: targetPath });
            lastRestoreAtRef.current = Date.now();
            return;
          }

          log('navegar para viagem activa', {
            from: pathname,
            to: targetPath,
            rideId: ride.id,
          });

          lastRestoreAtRef.current = Date.now();
          router.replace({
            pathname: targetPath,
            params: { rideId: ride.id },
          });
          await savePassengerAppRestore({ rideId: ride.id, route: targetPath });
          return;
        }

        if (persisted?.rideId) {
          log('limpeza de estado — corrida persistida já não activa', {
            rideId: persisted.rideId,
          });
          await clearPassengerAppRestore();
        }

        if (persisted?.route && isRestorableRoute(persisted.route)) {
          const base = persisted.route.split('?')[0];
          if (pathname === base) {
            log('já na rota persistida', { route: persisted.route });
            lastRestoreAtRef.current = Date.now();
            return;
          }
          log('restaurar rota persistida', { from: pathname, to: persisted.route });
          lastRestoreAtRef.current = Date.now();
          router.replace(persisted.route as '/map');
          return;
        }

        log('sem restauração necessária', { reason, pathname });
        lastRestoreAtRef.current = Date.now();
      })();

      restoreInFlightRef.current = promise;
      try {
        await promise;
      } finally {
        restoreInFlightRef.current = null;
      }
    },
    [
      enabled,
      sessionReady,
      isHomeDataReady,
      locationBootstrapDone,
      user?.id,
      activeRide,
      pathname,
      paramRideId,
      router,
    ],
  );

  useEffect(() => {
    if (!enabled || !sessionReady || !isHomeDataReady || !locationBootstrapDone || !user?.id) {
      return;
    }
    if (initialRestoreDoneRef.current) return;
    initialRestoreDoneRef.current = true;
    log('sessão encontrada — restore inicial');
    void runRestore('cold_start');
  }, [enabled, sessionReady, isHomeDataReady, locationBootstrapDone, user?.id, runRestore]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev === 'active' && next.match(/inactive|background/)) {
        log('app foi para background', { prev, next, pathname });
        void persistSnapshot();
        return;
      }

      if (next === 'active' && prev.match(/inactive|background/)) {
        log('app voltou para active', { prev, next, pathname });
        log('sessão', { userId: user?.id ?? null });
        void refreshActiveRide()
          .then(() => runRestore('foreground'))
          .catch((e) => {
            log('erro capturado no refresh ao voltar', {
              error: e instanceof Error ? e.message : String(e),
            });
            void runRestore('foreground_after_error');
          });
      }
    });

    return () => sub.remove();
  }, [pathname, persistSnapshot, refreshActiveRide, runRestore, user?.id]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    const rideId = paramRideId ?? activeRide?.id;
    if (!rideId) return;

    void savePassengerAppRestore({
      rideId,
      route: pathname,
    });
  }, [enabled, user?.id, paramRideId, activeRide?.id, pathname]);

  useEffect(() => {
    if (!activeRide?.id) return;
    if (!isPassengerActiveRideStatus(activeRide.status, activeRide.ui_state)) {
      log('limpeza — corrida deixou de estar activa no contexto', {
        rideId: activeRide.id,
        status: activeRide.status,
        ui_state: activeRide.ui_state,
      });
      void clearPassengerAppRestore();
    }
  }, [activeRide?.id, activeRide?.status, activeRide?.ui_state]);

  return { persistSnapshot, runRestore };
}
