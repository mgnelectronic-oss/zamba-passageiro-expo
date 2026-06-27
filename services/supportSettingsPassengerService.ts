import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { SupportSettingsPassengerRow } from '@/types/supportSettingsPassenger';

const EMPTY: SupportSettingsPassengerRow = { email: null, phone: null };

/**
 * Lê o primeiro (único) registo de definições de suporte.
 * Usa `.single()` como no contrato da tabela; 0 linhas devolve `null` nos campos.
 */
export async function fetchSupportSettingsPassenger(): Promise<{
  data: SupportSettingsPassengerRow;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: EMPTY, error: new Error('Supabase não configurado') };
  }

  const { data, error } = await supabase
    .from('support_settings_passenger')
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { data: EMPTY, error: null };
    }
    return { data: EMPTY, error: new Error(error.message) };
  }

  return {
    data: {
      email: data?.email ?? null,
      phone: data?.phone ?? null,
    },
    error: null,
  };
}
