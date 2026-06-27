import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapLatLng } from '@/components/maps/types';
import { haversineKm, isValidMapCoord } from '@/lib/geo';

const LOG = '[PASSENGER DRIVER MARKER ANIMATION]';

/** Intervalo de tick da animação (~25 fps). */
const TICK_MS = 40;

/**
 * Movimento mínimo (metros) para desencadear animação.
 * Abaixo deste valor o marcador fica estável (anti-tremor).
 */
const MIN_MOVE_M = 4;

/**
 * Salto máximo permitido (metros).
 * Acima disto o marcador encaixa directamente (GPS impossível).
 * 300 m permite ≤ 130 km/h com ~8 s de delay de entrega.
 */
const MAX_JUMP_M = 300;

/** Velocidade de referência para calcular duração (m/s ≈ 36 km/h cidade). */
const CITY_SPEED_MPS = 10;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Suavização ease-in-out para movimento mais natural. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Duração da animação adaptada à distância:
 *   distM=10 → 600 ms | distM=50 → 1 200 ms | distM≥120 → 1 200 ms
 */
function calcDurationMs(distM: number): number {
  return Math.max(600, Math.min(1200, (distM / CITY_SPEED_MPS) * 1000 * 0.8));
}

export type SmoothDriverMarkerResult = {
  /** Posição interpolada a mostrar no mapa. Null enquanto não há posição inicial. */
  animatedPosition: MapLatLng | null;
  isAnimating: boolean;
};

/**
 * Suaviza a posição do marcador do motorista para evitar saltos bruscos de GPS.
 *
 * - `rawPosition`: posição resolvida (já pode ser ancoragem na polyline ou posição directa).
 * - `enabled`: só deve ser `true` na fase de recolha; em on_trip deve ser `false`.
 *
 * Quando `enabled` é `false`, retorna `rawPosition` sem processamento.
 */
export function useSmoothDriverMarkerPosition(input: {
  rawPosition: MapLatLng | null;
  enabled: boolean;
}): SmoothDriverMarkerResult {
  // Posição actualmente renderizada (resultado da animação).
  const [renderedPos, setRenderedPos] = useState<MapLatLng | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Refs de estado da animação (stable, sem re-render ao escrever).
  const animPosRef = useRef<MapLatLng | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fromRef = useRef<MapLatLng | null>(null);
  const toRef = useRef<MapLatLng | null>(null);
  const startMsRef = useRef<number>(0);
  const durationMsRef = useRef<number>(0);

  const stopAnim = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup ao desmontar.
  useEffect(() => () => stopAnim(), [stopAnim]);

  // Quando desactivado, limpar estado.
  useEffect(() => {
    if (input.enabled) return;
    stopAnim();
    animPosRef.current = null;
    setRenderedPos(null);
    setIsAnimating(false);
  }, [input.enabled, stopAnim]);

  // Reagir a nova posição crua.
  useEffect(() => {
    if (!input.enabled) return;

    const newPos = input.rawPosition;
    if (!newPos || !isValidMapCoord(newPos.latitude, newPos.longitude)) return;

    const fromPos = animPosRef.current;

    // Primeira posição — posicionar sem animação.
    if (!fromPos) {
      animPosRef.current = { ...newPos };
      setRenderedPos({ ...newPos });
      if (__DEV__) {
        console.log(LOG, 'nova posição inicial', {
          lat: newPos.latitude.toFixed(5),
          lng: newPos.longitude.toFixed(5),
        });
      }
      return;
    }

    const distM =
      haversineKm(fromPos.latitude, fromPos.longitude, newPos.latitude, newPos.longitude) * 1000;

    // Salto impossível → encaixar directamente.
    if (distM > MAX_JUMP_M) {
      if (__DEV__) {
        console.log(LOG, 'salto impossível ignorado — snap directo', { distM: Math.round(distM) });
      }
      stopAnim();
      animPosRef.current = { ...newPos };
      setRenderedPos({ ...newPos });
      setIsAnimating(false);
      return;
    }

    // Micro-movimento → ignorar para evitar tremor.
    if (distM < MIN_MOVE_M) {
      if (__DEV__) {
        console.log(LOG, 'micro-movimento ignorado', { distM: distM.toFixed(1) });
      }
      return;
    }

    // Iniciar animação a partir da posição animada actual.
    const durationMs = calcDurationMs(distM);
    stopAnim();

    fromRef.current = { ...fromPos };
    toRef.current = { ...newPos };
    startMsRef.current = Date.now();
    durationMsRef.current = durationMs;
    setIsAnimating(true);

    if (__DEV__) {
      console.log(LOG, 'animação iniciada', {
        distM: Math.round(distM),
        durationMs,
        from: `${fromPos.latitude.toFixed(5)},${fromPos.longitude.toFixed(5)}`,
        to: `${newPos.latitude.toFixed(5)},${newPos.longitude.toFixed(5)}`,
      });
    }

    intervalRef.current = setInterval(() => {
      const from = fromRef.current;
      const to = toRef.current;
      if (!from || !to) return;

      const elapsed = Date.now() - startMsRef.current;
      const rawT = Math.min(1, elapsed / durationMsRef.current);
      const t = easeInOut(rawT);

      const pos: MapLatLng = {
        latitude: lerp(from.latitude, to.latitude, t),
        longitude: lerp(from.longitude, to.longitude, t),
      };

      animPosRef.current = pos;
      setRenderedPos({ latitude: pos.latitude, longitude: pos.longitude });

      if (rawT >= 1) {
        stopAnim();
        setIsAnimating(false);
        if (__DEV__) console.log(LOG, 'animação concluída');
      }
    }, TICK_MS);
  }, [
    input.enabled,
    // Só reactivar quando a posição realmente muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    input.rawPosition?.latitude,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    input.rawPosition?.longitude,
    stopAnim,
  ]);

  if (!input.enabled) {
    return { animatedPosition: input.rawPosition, isAnimating: false };
  }

  return {
    // Fallback para rawPosition enquanto a primeira posição ainda não foi processada.
    animatedPosition: renderedPos ?? input.rawPosition,
    isAnimating,
  };
}
