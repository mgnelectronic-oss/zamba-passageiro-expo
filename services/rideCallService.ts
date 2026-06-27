import { supabase, isSupabaseConfigured } from '@/lib/supabase';



export type RideCallStatus =

  | 'initiated'

  | 'ringing'

  | 'accepted'

  | 'ended'

  | 'rejected';



export interface RideCallRow {

  id: string;

  ride_id: string;

  status?: string | null;

  call_status?: string | null;

  caller_user_id?: string | null;

  receiver_user_id?: string | null;

  call_mode?: string | null;

  [key: string]: unknown;

}



function parseCallIdFromRpc(data: unknown): string | null {

  if (data == null) return null;

  if (typeof data === 'string' && data.length > 0) return data;

  if (typeof data === 'object') {

    const o = data as Record<string, unknown>;

    for (const key of ['p_call_id', 'call_id', 'id', 'ride_call_id']) {

      const v = o[key];

      if (typeof v === 'string' && v.length > 0) return v;

    }

  }

  return null;

}



export function rideCallRowStatus(row: RideCallRow | null): string | null {

  if (!row) return null;

  const s = row.status ?? row.call_status ?? null;

  return s != null && s !== '' ? String(s) : null;

}



export function rideCallMode(row: RideCallRow | null): string | null {

  if (!row?.call_mode) return null;

  return String(row.call_mode).toLowerCase().trim();

}



export function isInternetVoiceCall(row: RideCallRow | null): boolean {

  const mode = rideCallMode(row);

  return mode === 'internet_voice' || mode === 'internet';

}



/** Chamada recebida pelo passageiro — filtro principal: receiver_user_id (não receiver_passenger_id). */

export function isIncomingInitiatedInternetCall(row: RideCallRow, selfUserId: string): boolean {

  const receiver = row.receiver_user_id != null ? String(row.receiver_user_id).trim() : '';

  if (!receiver || receiver !== selfUserId.trim()) return false;

  if ((rideCallRowStatus(row) ?? '').toLowerCase() !== 'initiated') return false;

  return isInternetVoiceCall(row);

}



/** Mensagem amigável para o passageiro; erro técnico fica no console. */

export function rideCallUserMessage(

  error: unknown,

  context: 'start' | 'end' | 'signal',

): string {

  console.error(`[rideCall] ${context} erro técnico:`, error);

  switch (context) {

    case 'start':

      return 'Não foi possível iniciar a chamada pelo Zamba. Tente novamente ou use a opção ligar por telefone.';

    case 'end':

      return 'Não foi possível encerrar a chamada. Tente novamente.';

    case 'signal':

      return 'Não foi possível completar a ligação de áudio. Tente novamente.';

    default:

      return 'Não foi possível completar a operação de chamada. Tente novamente.';

  }

}



export const rideCallService = {

  /**

   * iniciar_chamada_internet(p_ride_id, p_caller_user_id, p_receiver_user_id, p_call_mode)

   */

  async startInternetCall(params: {

    p_ride_id: string;

    p_caller_user_id: string;

    p_receiver_user_id: string;

    p_call_mode: 'internet_voice' | 'internet';

  }): Promise<{ call_id: string | null; raw: unknown }> {

    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { data, error } = await supabase.rpc('iniciar_chamada_internet', {

      p_ride_id: params.p_ride_id,

      p_caller_user_id: params.p_caller_user_id,

      p_receiver_user_id: params.p_receiver_user_id,

      p_call_mode: params.p_call_mode,

    });

    if (error) {

      console.error('[rideCall] iniciar_chamada_internet erro completo:', error);

      throw error;

    }

    console.log('[rideCall] iniciar_chamada_internet resposta bruta:', data);

    const call_id = parseCallIdFromRpc(data);

    console.log('[rideCall] call_id resolvido:', call_id);

    return { call_id, raw: data };

  },



  /** encerrar_chamada_internet(p_call_id) — não envia ride_id. */

  async endInternetCall(params: { p_call_id: string }): Promise<void> {

    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    if (!params.p_call_id?.trim()) {

      throw new Error('p_call_id em falta');

    }

    const { error } = await supabase.rpc('encerrar_chamada_internet', {

      p_call_id: params.p_call_id,

    });

    if (error) {

      console.error('[rideCall] encerrar_chamada_internet erro completo:', error);

      throw error;

    }

  },



  async markInternetCallRinging(params: { p_call_id: string }): Promise<void> {

    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { error } = await supabase.rpc('marcar_chamada_internet_como_tocando', {

      p_call_id: params.p_call_id,

    });

    if (error) {

      console.error('[rideCall] marcar_chamada_internet_como_tocando erro completo:', error);

      throw error;

    }

  },



  async acceptInternetCall(params: { p_call_id: string }): Promise<void> {

    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { error } = await supabase.rpc('aceitar_chamada_internet', {

      p_call_id: params.p_call_id,

    });

    if (error) {

      console.error('[rideCall] aceitar_chamada_internet erro completo:', error);

      throw error;

    }

  },



  async rejectInternetCall(params: { p_call_id: string }): Promise<void> {

    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { error } = await supabase.rpc('rejeitar_chamada_internet', {

      p_call_id: params.p_call_id,

    });

    if (error) {

      console.error('[rideCall] rejeitar_chamada_internet erro completo:', error);

      throw error;

    }

  },



  async fetchLatestRideCall(rideId: string, callId?: string | null): Promise<RideCallRow | null> {

    if (!isSupabaseConfigured) return null;

    let q = supabase.from('ride_calls').select('*').eq('ride_id', rideId);

    if (callId) q = q.eq('id', callId);

    const { data, error } = await q.order('id', { ascending: false }).limit(1).maybeSingle();

    if (error) return null;

    return data as RideCallRow | null;

  },



  /**

   * Postgres Realtime em `ride_calls`. Sem `callId`, filtra pela corrida (última chamada activa).

   */

  subscribeRideCall(

    rideId: string,

    onEvent: (row: RideCallRow | null, eventType: string) => void,

    opts?: { callId?: string | null },

  ): () => void {

    const filter = opts?.callId

      ? `id=eq.${opts.callId}`

      : `ride_id=eq.${rideId}`;



    const channel = supabase

      .channel(`ride_calls_rt:${rideId}:${opts?.callId ?? 'ride'}`)

      .on(

        'postgres_changes',

        {

          event: '*',

          schema: 'public',

          table: 'ride_calls',

          filter,

        },

        (payload) => {

          const row =

            payload.new && typeof payload.new === 'object' && Object.keys(payload.new).length > 0

              ? (payload.new as RideCallRow)

              : payload.old && typeof payload.old === 'object'

                ? (payload.old as RideCallRow)

                : null;

          onEvent(row, payload.eventType);

        },

      )

      .subscribe();



    return () => {

      void supabase.removeChannel(channel);

    };

  },



  /**

   * Realtime: chamadas recebidas (motorista → passageiro).

   * Filtro Supabase: receiver_user_id = auth.uid().

   */

  subscribeIncomingInternetCalls(

    selfUserId: string,

    handlers: {

      onIncoming: (row: RideCallRow) => void;

      onUpdated?: (row: RideCallRow) => void;

    },

  ): () => void {

    if (!isSupabaseConfigured || !selfUserId.trim()) return () => undefined;

    const uid = selfUserId.trim();

    const handlePayload = (payload: { new: unknown; eventType: string }) => {

      const row =

        payload.new && typeof payload.new === 'object' && Object.keys(payload.new as object).length > 0

          ? (payload.new as RideCallRow)

          : null;

      if (!row?.id) return;

      if (payload.eventType === 'INSERT' && isIncomingInitiatedInternetCall(row, uid)) {

        handlers.onIncoming(row);

        return;

      }

      handlers.onUpdated?.(row);

    };



    const channel = supabase

      .channel(`ride_calls_incoming:${uid}:${Date.now()}`)

      .on(

        'postgres_changes',

        {

          event: 'INSERT',

          schema: 'public',

          table: 'ride_calls',

          filter: `receiver_user_id=eq.${uid}`,

        },

        handlePayload,

      )

      .on(

        'postgres_changes',

        {

          event: 'UPDATE',

          schema: 'public',

          table: 'ride_calls',

          filter: `receiver_user_id=eq.${uid}`,

        },

        handlePayload,

      )

      .subscribe();



    return () => {

      void supabase.removeChannel(channel);

    };

  },



  /**

   * Realtime: chamadas iniciadas pelo passageiro (caller_user_id = auth.uid()).

   */

  subscribeCallerInternetCalls(

    selfUserId: string,

    onUpdate: (row: RideCallRow) => void,

  ): () => void {

    if (!isSupabaseConfigured || !selfUserId.trim()) return () => undefined;

    const uid = selfUserId.trim();



    const channel = supabase

      .channel(`ride_calls_caller:${uid}:${Date.now()}`)

      .on(

        'postgres_changes',

        {

          event: '*',

          schema: 'public',

          table: 'ride_calls',

          filter: `caller_user_id=eq.${uid}`,

        },

        (payload) => {

          const row =

            payload.new && typeof payload.new === 'object' && Object.keys(payload.new).length > 0

              ? (payload.new as RideCallRow)

              : payload.old && typeof payload.old === 'object'

                ? (payload.old as RideCallRow)

                : null;

          if (row?.id) onUpdate(row);

        },

      )

      .subscribe();



    return () => {

      void supabase.removeChannel(channel);

    };

  },

};

