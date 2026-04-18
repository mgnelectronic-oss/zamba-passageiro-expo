import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  addressCacheService,
  type AddressCachePayload,
} from '@/services/cache/addressCacheService';

export interface SavedAddress {
  id: string;
  user_id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  icon: string;
  icon_color: string;
  address_type: 'home' | 'work' | 'airport' | 'custom';
  display_order: number;
  selected_via_map: boolean;
  is_quick_access: boolean;
  created_at?: string;
}

export interface RecentDestination {
  id: string;
  passenger_id: string;
  place_name: string;
  full_address: string;
  lat: number;
  lng: number;
  last_used_at: string;
}

const addressRefreshLocks = new Map<string, Promise<AddressCachePayload>>();

async function fetchSavedAddressesFromDb(userId: string): Promise<SavedAddress[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('saved_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('display_order', { ascending: true });
  if (error) return [];
  return data as SavedAddress[];
}

async function fetchRecentDestinationsFromDb(userId: string): Promise<RecentDestination[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('recent_destinations')
    .select('id, passenger_id, place_name, full_address, lat, lng, last_used_at')
    .eq('passenger_id', userId)
    .order('last_used_at', { ascending: false })
    .limit(5);
  if (error) return [];
  return data as RecentDestination[];
}

async function refreshAddressBundle(userId: string): Promise<AddressCachePayload> {
  if (addressRefreshLocks.has(userId)) return addressRefreshLocks.get(userId)!;
  const p = (async () => {
    const [saved, recent] = await Promise.all([
      fetchSavedAddressesFromDb(userId),
      fetchRecentDestinationsFromDb(userId),
    ]);
    const payload: AddressCachePayload = { saved, recent };
    await addressCacheService.set(userId, payload);
    return payload;
  })();
  addressRefreshLocks.set(userId, p);
  try {
    return await p;
  } finally {
    addressRefreshLocks.delete(userId);
  }
}

async function loadAddressBundle(userId: string): Promise<AddressCachePayload> {
  const cached = await addressCacheService.get(userId);
  if (cached) {
    void refreshAddressBundle(userId).catch(() => {});
    return cached;
  }
  return refreshAddressBundle(userId);
}

export const addressService = {
  async getSavedAddresses(userId: string): Promise<SavedAddress[]> {
    const bundle = await loadAddressBundle(userId);
    return bundle.saved;
  },

  async saveAddress(address: Omit<SavedAddress, 'id' | 'created_at'>): Promise<SavedAddress> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');

    if (address.address_type !== 'custom') {
      const { data: existing } = await supabase
        .from('saved_addresses')
        .select('id')
        .eq('user_id', address.user_id)
        .eq('address_type', address.address_type)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('saved_addresses')
          .update(address)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        await addressCacheService.invalidate(address.user_id);
        void refreshAddressBundle(address.user_id).catch(() => {});
        return data as SavedAddress;
      }
    }

    const { data, error } = await supabase
      .from('saved_addresses')
      .insert([address])
      .select()
      .single();

    if (error) throw error;
    await addressCacheService.invalidate(address.user_id);
    void refreshAddressBundle(address.user_id).catch(() => {});
    return data as SavedAddress;
  },

  async deleteAddress(id: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const { data: row } = await supabase
      .from('saved_addresses')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    const { error } = await supabase
      .from('saved_addresses')
      .delete()
      .eq('id', id);
    if (error) throw error;
    const uid = row?.user_id as string | undefined;
    if (uid) {
      await addressCacheService.invalidate(uid);
      void refreshAddressBundle(uid).catch(() => {});
    }
  },

  async updateAddressesOrder(addresses: { id: string; display_order: number }[]): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    const firstId = addresses[0]?.id;
    let userIdForCache: string | undefined;
    if (firstId) {
      const { data: row } = await supabase
        .from('saved_addresses')
        .select('user_id')
        .eq('id', firstId)
        .maybeSingle();
      userIdForCache = row?.user_id as string | undefined;
    }
    const updates = addresses.map(addr =>
      supabase
        .from('saved_addresses')
        .update({ display_order: addr.display_order })
        .eq('id', addr.id)
    );
    const results = await Promise.all(updates);
    const error = results.find(r => r.error)?.error;
    if (error) throw error;
    if (userIdForCache) {
      await addressCacheService.invalidate(userIdForCache);
      void refreshAddressBundle(userIdForCache).catch(() => {});
    }
  },

  async getRecentDestinations(userId: string): Promise<RecentDestination[]> {
    const bundle = await loadAddressBundle(userId);
    return bundle.recent;
  },

  async addRecentDestination(dest: Omit<RecentDestination, 'id' | 'last_used_at'>) {
    if (!isSupabaseConfigured) return;

    const PLACEHOLDERS = ['A obter localização…', 'A obter localização...', 'Localização Actual', 'Localização Atual'];
    if (PLACEHOLDERS.includes(dest.full_address) || PLACEHOLDERS.includes(dest.place_name)) return;
    if (!dest.full_address || dest.full_address.trim() === '') return;

    const { data: existing } = await supabase
      .from('recent_destinations')
      .select('id')
      .eq('passenger_id', dest.passenger_id)
      .eq('full_address', dest.full_address)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('recent_destinations')
        .update({ last_used_at: new Date().toISOString(), place_name: dest.place_name })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('recent_destinations')
        .insert([{ ...dest, last_used_at: new Date().toISOString() }]);
    }
    await addressCacheService.invalidate(dest.passenger_id);
    void refreshAddressBundle(dest.passenger_id).catch(() => {});
  },
};
