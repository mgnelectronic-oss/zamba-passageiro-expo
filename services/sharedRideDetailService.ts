import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const LOG = '[SHARED RIDE FLOW]';
const HISTORY_RETENTION_DAYS = 7;

export type SharedRideRpcScreenMode =
  | 'live_tracking'
  | 'history_details'
  | 'cancelled_details'
  | 'unavailable'
  | string;

export type SharedRideViewMode =
  | 'live_tracking'
  | 'history_details'
  | 'cancelled_details'
  | 'unavailable'
  | 'expired_history';

export type SharedRideRouteInfo = {
  polyline: string;
  route_phase?: string;
  start_lat?: number;
  start_lng?: number;
  end_lat?: number;
  end_lng?: number;
  last_driver_lat?: number;
  last_driver_lng?: number;
  distance_meters?: number;
  duration_seconds?: number;
};

export type SharedRideDetailPayload = {
  shareId: string;
  screenMode: SharedRideRpcScreenMode;
  viewMode: SharedRideViewMode;
  ride: {
    id: string;
    status: string;
    pickup_address: string;
    dropoff_address: string;
    pickup_lat?: number;
    pickup_lng?: number;
    destination_lat?: number;
    destination_lng?: number;
    started_at?: string | null;
    completed_at?: string | null;
    created_at?: string | null;
    final_fare?: number | null;
    price_estimate?: number | null;
    distance_km?: number | null;
    duration_min?: number | null;
  };
  driver: {
    name: string;
    photo_url?: string | null;
    phone?: string | null;
  };
  vehicle: {
    brand?: string | null;
    model?: string | null;
    plate?: string | null;
    category?: string | null;
  };
  route: SharedRideRouteInfo | null;
  daysSinceCompletion: number | null;
};

function log(message: string, extra?: Record<string, unknown>): void {
  if (extra) console.log(LOG, message, extra);
  else console.log(LOG, message);
}

function parseNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseStr(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysSinceCompletion(completedAt: unknown): number | null {
  const d = parseDate(completedAt);
  if (!d) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
}

export function resolveSharedRideViewMode(
  screenMode: string | null | undefined,
  completedAt: unknown,
): SharedRideViewMode {
  const mode = parseStr(screenMode).toLowerCase();
  const days = daysSinceCompletion(completedAt);

  if (mode === 'live_tracking') return 'live_tracking';
  if (mode === 'cancelled_details') return 'cancelled_details';
  if (mode === 'unavailable') return 'unavailable';

  if (mode === 'history_details') {
    if (days != null && days > HISTORY_RETENTION_DAYS) return 'expired_history';
    return 'history_details';
  }

  return 'unavailable';
}

function unwrapRpcRow(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  return typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

function pickNested(
  root: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = root[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/** Ignora rota to_pickup como rota final de viagem concluída. */
export function parseSharedRideRoute(
  routeRaw: unknown,
  rideStatus: string,
): SharedRideRouteInfo | null {
  if (!routeRaw || typeof routeRaw !== 'object') return null;
  const route = routeRaw as Record<string, unknown>;
  const phase = parseStr(route.route_phase).toLowerCase();
  const status = rideStatus.toLowerCase();

  if (status === 'completed' && phase === 'to_pickup') {
    log('route ignorada — to_pickup em viagem concluída', { rideStatus: status });
    return null;
  }

  const polyline = typeof route.polyline === 'string' ? route.polyline.trim() : '';
  if (!polyline) return null;

  return {
    polyline,
    route_phase: phase || undefined,
    start_lat: parseNum(route.start_lat),
    start_lng: parseNum(route.start_lng),
    end_lat: parseNum(route.end_lat),
    end_lng: parseNum(route.end_lng),
    last_driver_lat: parseNum(route.last_driver_lat),
    last_driver_lng: parseNum(route.last_driver_lng),
    distance_meters: parseNum(route.distance_meters),
    duration_seconds: parseNum(route.duration_seconds),
  };
}

function mapDetailPayload(shareId: string, row: Record<string, unknown>): SharedRideDetailPayload | null {
  const screenMode = parseStr(row.screen_mode, 'unavailable');
  const rideRaw = pickNested(row, 'ride') ?? row;
  const driverRaw = pickNested(row, 'driver') ?? pickNested(row, 'motorista');
  const vehicleRaw = pickNested(row, 'vehicle') ?? pickNested(row, 'veiculo');

  const rideId = parseStr(rideRaw.id ?? rideRaw.ride_id);
  if (!rideId) return null;

  const status = parseStr(rideRaw.status);
  const route = parseSharedRideRoute(row.route ?? rideRaw.route, status);

  const pickup_lat =
    parseNum(rideRaw.pickup_lat) ?? parseNum(route?.start_lat);
  const pickup_lng =
    parseNum(rideRaw.pickup_lng) ?? parseNum(route?.start_lng);
  const destination_lat =
    parseNum(rideRaw.destination_lat ?? rideRaw.dropoff_lat) ??
    parseNum(route?.end_lat);
  const destination_lng =
    parseNum(rideRaw.destination_lng ?? rideRaw.dropoff_lng) ??
    parseNum(route?.end_lng);

  const completed_at =
    (rideRaw.completed_at as string | null | undefined) ??
    (rideRaw.finished_at as string | null | undefined) ??
    null;

  const days = daysSinceCompletion(completed_at);
  const viewMode = resolveSharedRideViewMode(screenMode, completed_at);

  const distance_km =
    parseNum(rideRaw.distance_km) ??
    (route?.distance_meters != null ? route.distance_meters / 1000 : undefined);
  const duration_min =
    parseNum(rideRaw.duration_min) ??
    (route?.duration_seconds != null ? route.duration_seconds / 60 : undefined);

  return {
    shareId,
    screenMode,
    viewMode,
    daysSinceCompletion: days,
    ride: {
      id: rideId,
      status,
      pickup_address: parseStr(rideRaw.pickup_address),
      dropoff_address: parseStr(
        rideRaw.dropoff_address ?? rideRaw.destination_address,
      ),
      ...(pickup_lat != null && pickup_lng != null ? { pickup_lat, pickup_lng } : {}),
      ...(destination_lat != null && destination_lng != null
        ? { destination_lat, destination_lng }
        : {}),
      started_at: (rideRaw.started_at as string | null | undefined) ?? null,
      completed_at,
      created_at: (rideRaw.created_at as string | null | undefined) ?? null,
      final_fare: parseNum(rideRaw.final_fare) ?? null,
      price_estimate: parseNum(rideRaw.price_estimate) ?? null,
      distance_km: distance_km ?? null,
      duration_min: duration_min ?? null,
    },
    driver: {
      name: parseStr(
        driverRaw?.full_name ??
          driverRaw?.name ??
          rideRaw.driver_name,
        'Motorista',
      ),
      photo_url:
        parseStr(driverRaw?.avatar_url ?? driverRaw?.photo_url ?? rideRaw.driver_photo_url) ||
        null,
      phone:
        parseStr(driverRaw?.phone ?? rideRaw.driver_phone) || null,
    },
    vehicle: {
      brand: parseStr(vehicleRaw?.brand ?? vehicleRaw?.vehicle_brand ?? rideRaw.vehicle_brand) || null,
      model: parseStr(vehicleRaw?.model ?? vehicleRaw?.vehicle_model ?? rideRaw.vehicle_model) || null,
      plate: parseStr(vehicleRaw?.plate ?? vehicleRaw?.vehicle_plate ?? rideRaw.vehicle_plate) || null,
      category:
        parseStr(vehicleRaw?.category ?? vehicleRaw?.vehicle_category ?? rideRaw.vehicle_category) ||
        null,
    },
    route,
  };
}

export async function fetchSharedRideDetail(
  shareId: string,
): Promise<{ detail: SharedRideDetailPayload | null; error: string | null }> {
  if (!isSupabaseConfigured || !shareId?.trim()) {
    return { detail: null, error: 'Partilha indisponível' };
  }

  log('consultar obter_detalhe_viagem_partilhada', { share_id: shareId });

  try {
    const { data, error } = await supabase.rpc('obter_detalhe_viagem_partilhada', {
      p_share_id: shareId.trim(),
    });

    if (error) {
      log('erro RPC', { share_id: shareId, message: error.message });
      return { detail: null, error: 'Partilha indisponível' };
    }

    const row = unwrapRpcRow(data);
    if (!row) {
      log('resposta vazia', { share_id: shareId });
      return { detail: null, error: 'Partilha indisponível' };
    }

    const screenMode = parseStr(row.screen_mode, 'unavailable');
    const rideProbe = pickNested(row, 'ride') ?? row;
    const completedAt =
      rideProbe.completed_at ?? rideProbe.finished_at ?? null;
    const days = daysSinceCompletion(completedAt);

    log('resposta obter_detalhe_viagem_partilhada', {
      share_id: shareId,
      screen_mode: screenMode,
      ride_status: rideProbe.status ?? null,
      completed_at: completedAt,
      days_since_completion: days != null ? Number(days.toFixed(2)) : null,
      route_null: row.route == null,
    });

    const detail = mapDetailPayload(shareId, row);
    if (!detail) {
      return { detail: null, error: 'Partilha indisponível' };
    }

    log('decisão de ecrã', {
      share_id: shareId,
      view_mode: detail.viewMode,
      route_null: detail.route == null,
    });

    if (detail.route == null) {
      log('mapa sem polyline — origem/destino apenas', {
        share_id: shareId,
        view_mode: detail.viewMode,
      });
    }

    return { detail, error: null };
  } catch (e) {
    log('erro capturado', {
      share_id: shareId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { detail: null, error: 'Não foi possível carregar esta partilha.' };
  }
}

/** Actualização em tempo real — só para live_tracking. */
export async function fetchSharedRideLiveSnapshot(rideId: string): Promise<{
  driver_lat?: number;
  driver_lng?: number;
  route_polyline?: string;
  ride_status?: string;
} | null> {
  if (!isSupabaseConfigured || !rideId?.trim()) return null;

  try {
    const { data, error } = await supabase.rpc('obter_corrida_partilhada', {
      p_ride_id: rideId.trim(),
    });
    if (error) return null;

    const row = unwrapRpcRow(data);
    if (!row) return null;

    const ride = pickNested(row, 'ride') ?? {};
    const route = row.route && typeof row.route === 'object' ? (row.route as Record<string, unknown>) : null;
    const status = parseStr(ride.status);
    const parsedRoute = parseSharedRideRoute(route, status);

    return {
      ride_status: status || undefined,
      driver_lat:
        parseNum(ride.driver_lat) ?? parseNum(route?.last_driver_lat),
      driver_lng:
        parseNum(ride.driver_lng) ?? parseNum(route?.last_driver_lng),
      route_polyline: parsedRoute?.polyline,
    };
  } catch {
    return null;
  }
}

export function formatSharedRideDateTime(value: unknown): string {
  const d = parseDate(value);
  if (!d) return '—';
  return d.toLocaleString('pt-MZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSharedRideTime(value: unknown): string {
  const d = parseDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });
}

export function formatSharedRideDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
}

export function formatSharedRideDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return `${km.toLocaleString('pt-MZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function formatSharedRidePrice(
  finalFare: number | null | undefined,
  priceEstimate: number | null | undefined,
): string {
  const amount = finalFare ?? priceEstimate;
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`;
}

export function sharedRideUnavailableMessage(viewMode: SharedRideViewMode): string {
  switch (viewMode) {
    case 'expired_history':
      return 'Histórico expirado';
    case 'unavailable':
      return 'Partilha indisponível';
    case 'cancelled_details':
      return 'Viagem cancelada';
    default:
      return 'Indisponível';
  }
}
