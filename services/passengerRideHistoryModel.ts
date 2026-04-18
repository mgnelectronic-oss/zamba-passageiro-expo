/**
 * Modelo partilhado do histórico de viagens do passageiro (RPC + UI).
 */

export interface RideHistoryItem {
  id: string;
  driver_name: string | null;
  driver_photo_url: string | null;
  driver_phone: string | null;
  vehicle_plate: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  origin: string | null;
  destination: string | null;
  price: number | null;
  status: string | null;
  created_at: string | null;
}

export interface RpcHistoryError {
  message: string;
  code?: string;
  details?: string;
}

export const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
export const HISTORY_DISPLAY_LIMIT = 3;

export function parsePriceFromRpc(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  return null;
}

export function normalizeRpcRow(raw: Record<string, unknown>): RideHistoryItem {
  return {
    id: String(raw.id ?? ''),
    driver_name: raw.driver_name != null ? String(raw.driver_name) : null,
    driver_photo_url: raw.driver_photo_url != null ? String(raw.driver_photo_url) : null,
    driver_phone: raw.driver_phone != null ? String(raw.driver_phone) : null,
    vehicle_plate: raw.vehicle_plate != null ? String(raw.vehicle_plate) : null,
    vehicle_brand: raw.vehicle_brand != null ? String(raw.vehicle_brand) : null,
    vehicle_model: raw.vehicle_model != null ? String(raw.vehicle_model) : null,
    vehicle_color: raw.vehicle_color != null ? String(raw.vehicle_color) : null,
    origin: raw.origin != null ? String(raw.origin) : null,
    destination: raw.destination != null ? String(raw.destination) : null,
    price: parsePriceFromRpc(raw.price),
    status: raw.status != null ? String(raw.status) : null,
    created_at: raw.created_at != null ? String(raw.created_at) : null,
  };
}

export function isCreatedAtWithinLastFourDays(createdAt: string | null): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (isNaN(t)) return false;
  return t >= Date.now() - FOUR_DAYS_MS;
}

/** Mesma regra que a listagem em `app/history.tsx` (4 dias + limite). */
export function buildPassengerHistoryDisplayList(
  rawRows: Record<string, unknown>[],
): RideHistoryItem[] {
  const afterFourDays = rawRows.filter((row) =>
    isCreatedAtWithinLastFourDays(row.created_at != null ? String(row.created_at) : null),
  );
  return afterFourDays.slice(0, HISTORY_DISPLAY_LIMIT).map((r) => normalizeRpcRow(r));
}

export function collectDriverPhotoUrls(rides: RideHistoryItem[]): string[] {
  const urls = new Set<string>();
  for (const r of rides) {
    const u = r.driver_photo_url?.trim();
    if (u) urls.add(u);
  }
  return [...urls];
}
