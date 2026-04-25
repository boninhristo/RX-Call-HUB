import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url?.trim() || !key) {
    throw new Error(
      "Липсват VITE_SUPABASE_URL и ключ: задайте VITE_SUPABASE_PUBLISHABLE_KEY (новият sb_publishable_…) или VITE_SUPABASE_ANON_KEY (JWT) в .env — виж .env.example."
    );
  }
  client = createClient(url.trim(), key);
  return client;
}
