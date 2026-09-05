import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

/** Browser Supabase client for Realtime. Returns null if public env is missing. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    browserClient = null;
    return null;
  }

  browserClient = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return browserClient;
}
