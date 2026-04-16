import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const hasFirebaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const db: any = hasFirebaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;

let adminAuthPromise: Promise<boolean> | null = null;

export function ensureAdminAuth(): Promise<boolean> {
  if (adminAuthPromise) return adminAuthPromise;

  adminAuthPromise = (async () => {
    if (!db || !hasFirebaseConfig) return false;
    const current = await db.auth.getSession();
    if (current.data.session?.user) return true;
    if (!adminEmail || !adminPassword) return false;
    try {
      const result = await db.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword,
      });
      return !result.error;
    } catch {
      return false;
    }
  })();

  return adminAuthPromise;
}

export { hasFirebaseConfig };
