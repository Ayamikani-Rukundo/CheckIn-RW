import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const storage = {
    getItem(key: string) {
      if (typeof window === "undefined") return null;
      const remember = window.localStorage.getItem("nls-remember-session") === "true";
      const target = remember ? window.localStorage : window.sessionStorage;
      return target.getItem(key);
    },
    setItem(key: string, value: string) {
      if (typeof window === "undefined") return;
      const remember = window.localStorage.getItem("nls-remember-session") === "true";
      const target = remember ? window.localStorage : window.sessionStorage;
      target.setItem(key, value);
    },
    removeItem(key: string) {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    },
  };

  browserClient = createSupabaseClient(url, key, {
    auth: {
      storage,
      storageKey: "nls-supabase",
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return browserClient;
}
