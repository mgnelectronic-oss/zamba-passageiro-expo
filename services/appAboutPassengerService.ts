import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Lê o texto “Sobre” (uma linha). Usa `.select('content').single()`.
 * Sem registo (PGRST116) ou outro erro → conteúdo inexistente (ecrã usa fallback).
 */
export async function fetchAppAboutPassengerContent(): Promise<{
  content: string | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { content: null, error: new Error('Supabase não configurado') };
  }

  const { data, error } = await supabase
    .from('app_about_passenger_settings')
    .select('content')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { content: null, error: null };
    }
    return { content: null, error: new Error(error.message) };
  }

  return {
    content: typeof data?.content === 'string' ? data.content : null,
    error: null,
  };
}
