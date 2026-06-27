import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/** STUN pedido pelo produto; TURN deve ser acrescentado no backend se necessário. */
export const WEBRTC_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }] as const;

export type WebRtcSignalType = 'offer' | 'answer' | 'ice_candidate';

export interface RideCallSignalRow {
  id?: string;
  call_id?: string;
  ride_call_id?: string;
  signal_type?: string;
  payload?: unknown;
  sender_user_id?: string;
  receiver_user_id?: string;
  from_user_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

export function signalCallId(row: RideCallSignalRow): string | undefined {
  const id = row.call_id ?? row.ride_call_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export async function sendWebRtcSignal(params: {
  p_call_id: string;
  p_signal_type: WebRtcSignalType;
  p_payload: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.rpc('enviar_sinal_webrtc', {
    p_call_id: params.p_call_id,
    p_signal_type: params.p_signal_type,
    p_payload: params.p_payload,
  });
  if (error) {
    console.error('[webrtc] enviar_sinal_webrtc erro completo:', error);
    throw error;
  }
}

export function signalSenderId(row: RideCallSignalRow): string | undefined {
  const a = row.sender_user_id ?? row.from_user_id ?? row.user_id;
  return typeof a === 'string' ? a : undefined;
}

export function signalReceiverId(row: RideCallSignalRow): string | undefined {
  const a = row.receiver_user_id;
  return typeof a === 'string' ? a : undefined;
}

export function parseSignalPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

/** Realtime: novas linhas em `ride_call_signals` para esta chamada (call_id + receiver_user_id). */
export async function fetchRideCallSignalsForReplay(
  rideCallId: string,
  selfUserId: string,
): Promise<RideCallSignalRow[]> {
  const { data, error } = await supabase
    .from('ride_call_signals')
    .select('*')
    .eq('call_id', rideCallId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as RideCallSignalRow[]).filter((row) => {
    const callId = signalCallId(row);
    if (callId && callId !== rideCallId) return false;
    const receiver = signalReceiverId(row);
    if (receiver && receiver !== selfUserId) return false;
    const sender = signalSenderId(row);
    if (sender && sender === selfUserId) return false;
    return true;
  });
}

export function subscribeRideCallSignals(
  rideCallId: string,
  selfUserId: string,
  onSignal: (row: RideCallSignalRow) => void,
): () => void {
  void fetchRideCallSignalsForReplay(rideCallId, selfUserId).then((rows) => {
    for (const row of rows) {
      onSignal(row);
    }
  });

  const channel = supabase
    .channel(`ride_call_signals:${rideCallId}:${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_call_signals',
        filter: `call_id=eq.${rideCallId}`,
      },
      (payload) => {
        const row = payload.new as RideCallSignalRow;
        const callId = signalCallId(row);
        if (callId && callId !== rideCallId) return;

        const receiver = signalReceiverId(row);
        if (receiver && receiver !== selfUserId) return;

        const sender = signalSenderId(row);
        if (sender && sender === selfUserId) return;

        onSignal(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
