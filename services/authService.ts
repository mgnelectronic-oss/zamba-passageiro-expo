import { File as ExpoFile } from 'expo-file-system';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { profileCacheService } from '@/services/cache/profileCacheService';
import { clearSessionCaches } from '@/services/cache/sessionCacheCleanup';
import { cacheLog } from '@/services/cache/cacheService';

/** Texto legível para UI a partir de erros do Supabase ou excepções desconhecidas. */
export function formatErrorMessage(e: unknown): string {
  if (e === null || e === undefined) return 'Erro desconhecido. Tente novamente.';
  if (typeof e === 'string') return e;
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === 'string' && msg) {
      const code = o.code;
      const details = o.details;
      const parts: string[] = [msg];
      if (typeof code === 'string' && code) parts.push(`(${code})`);
      if (typeof details === 'string' && details) parts.push(String(details));
      return parts.join(' ');
    }
  }
  return 'Erro ao enviar verificação. Tente novamente.';
}

export interface UserProfile {
  id: string;
  full_name?: string;
  phone?: string;
  role?: string;
  verification_status?: 'approved' | 'pending' | 'rejected' | null;
  verification_rejected_reason?: string | null;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

async function fetchProfileFromDb(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data as UserProfile | null;
}

export const authService = {
  async signIn(email: string, password: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) await clearSessionCaches(user.id);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser() {
    if (!isSupabaseConfigured) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    if (!isSupabaseConfigured) return null;

    const cached = await profileCacheService.get(userId);
    if (cached) {
      void fetchProfileFromDb(userId).then((fresh) => {
        if (fresh) {
          void profileCacheService.set(userId, fresh);
          cacheLog('profile', 'bg_refresh');
        }
      });
      return cached;
    }

    try {
      const fresh = await fetchProfileFromDb(userId);
      if (fresh) {
        await profileCacheService.set(userId, fresh);
        return fresh;
      }
    } catch {
      /* rede indisponível */
    }

    return profileCacheService.getIgnoringExpiry(userId);
  },

  async updateProfile(fullName: string, phone: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) throw error;
    await profileCacheService.invalidate(user.id);
    const updated = await fetchProfileFromDb(user.id);
    if (updated) await profileCacheService.set(user.id, updated);
  },

  async submitVerification(userId: string, verificationData: {
    document_type: 'BI' | 'Passaporte';
    document_front_url: string;
    document_back_url?: string;
    selfie_url: string;
  }) {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: 'pending',
        verification_document_type: verificationData.document_type,
        document_front_url: verificationData.document_front_url,
        document_back_url: verificationData.document_back_url,
        selfie_url: verificationData.selfie_url,
        avatar_url: verificationData.selfie_url,
        verification_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;
    await profileCacheService.invalidate(userId);
    const refreshed = await fetchProfileFromDb(userId);
    if (refreshed) await profileCacheService.set(userId, refreshed);
  },

  async uploadVerificationFile(userId: string, type: string, fileUri: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const fileName = `${user.id}/${type}_${Date.now()}.jpg`;

    let arrayBuffer: ArrayBuffer;
    try {
      const local = new ExpoFile(fileUri);
      arrayBuffer = await local.arrayBuffer();
    } catch (readErr) {
      throw new Error(
        readErr instanceof Error
          ? readErr.message
          : 'Não foi possível ler a imagem. Tente capturar novamente.',
      );
    }
    if (arrayBuffer.byteLength === 0) {
      throw new Error('A imagem está vazia. Tente capturar novamente.');
    }

    const { error } = await supabase.storage
      .from('passenger_documents')
      .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('passenger_documents')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  },

  onAuthStateChange(callback: (user: any) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null);
    });
    return subscription;
  },
};
