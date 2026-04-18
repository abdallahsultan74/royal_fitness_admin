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

    const isAdminForCurrentSession = async (): Promise<boolean> => {
      try {
        const resp = await db.rpc("is_admin");
        if (resp?.error) return false;
        const data = resp?.data;
        if (typeof data === "boolean") return data;
        if (Array.isArray(data)) {
          const first = data[0];
          if (typeof first === "boolean") return first;
          if (first && typeof first === "object" && "is_admin" in (first as any)) {
            return Boolean((first as any).is_admin);
          }
          return false;
        }
        if (data && typeof data === "object" && "is_admin" in (data as any)) {
          return Boolean((data as any).is_admin);
        }
        return false;
      } catch {
        return false;
      }
    };

    const tryEnvSignIn = async (): Promise<boolean> => {
      if (!adminEmail || !adminPassword) return false;
      try {
        await db.auth.signOut();
      } catch {
        /* ignore */
      }
      try {
        const result = await db.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword,
        });
        if (result.error) return false;
        return isAdminForCurrentSession();
      } catch {
        return false;
      }
    };

    // 1) If we already have a session, validate admin; if not admin but env creds exist, switch to env admin (Vercel / shared browser).
    const current = await db.auth.getSession();
    if (current.data.session?.user) {
      const ok = await isAdminForCurrentSession();
      if (ok) return true;
      return tryEnvSignIn();
    }

    // 2) No session: sign in with admin credentials from env (Vercel)
    return tryEnvSignIn();
  })().finally(() => {
    adminAuthPromise = null;
  });

  return adminAuthPromise;
}

export { hasFirebaseConfig };
