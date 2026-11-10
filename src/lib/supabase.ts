import { createClient } from '@supabase/supabase-js';

// Chave publishable: pode ser incluída no frontend. A segurança depende das políticas RLS.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  || 'https://pwuthycrlieoctlzgewh.supabase.co';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()
  || 'sb_publishable_4aQfpuFbuX4Hs98TUSVWOQ_rmDAjlJK';

export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;
