import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const hasFirebaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const db: any = hasFirebaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;

/** When true, login UI uses localStorage only; staff checks should not require env bot credentials. */
export const isLocalAuthMode = import.meta.env.VITE_LOCAL_AUTH === "true";

let staffAuthPromise: Promise<boolean> | null = null;
let adminAuthPromise: Promise<boolean> | null = null;

async function rpcBoolean(name: string): Promise<boolean> {
  if (!db) return false;
  try {
    const resp = await db.rpc(name);
    if (resp?.error) return false;
    const data = resp?.data;
    if (typeof data === "boolean") return data;
    if (Array.isArray(data)) {
      const first = data[0];
      if (typeof first === "boolean") return first;
      return false;
    }
    if (data && typeof data === "object" && name in (data as any)) {
      return Boolean((data as any)[name]);
    }
    return false;
  } catch {
    return false;
  }
}

/** Current session is admin (profiles.role / JWT / legacy rules). */
export async function getIsAdmin(): Promise<boolean> {
  return rpcBoolean("is_admin");
}

/** Current session is coach. */
export async function getIsCoach(): Promise<boolean> {
  return rpcBoolean("is_coach");
}

/** Admin or coach — can use the staff panel. */
export async function getIsStaff(): Promise<boolean> {
  if (await getIsAdmin()) return true;
  return getIsCoach();
}

/**
 * Allow coaches + admins to use the panel. If a normal member session exists, fall back to env admin login (Vercel).
 * Does not replace an active coach session (coach stays logged in).
 */
export function ensureStaffAuth(): Promise<boolean> {
  if (staffAuthPromise) return staffAuthPromise;

  staffAuthPromise = (async () => {
    if (!db || !hasFirebaseConfig) return false;

    if (isLocalAuthMode) {
      return true;
    }

    const tryEnvSignIn = async (): Promise<boolean> => {
      if (!adminEmail || !adminPassword) {
        if (import.meta.env.DEV) {
          console.warn("[ensureStaffAuth] VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD missing; cannot fall back to env bot user.");
        }
        return false;
      }
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
        if (result.error) {
          if (import.meta.env.DEV) {
            console.warn("[ensureStaffAuth] signInWithPassword (env bot):", result.error.message);
          }
          return false;
        }
        const ok = await getIsStaff();
        if (!ok && import.meta.env.DEV) {
          console.warn(
            "[ensureStaffAuth] Env user signed in but is_admin/is_coach are false — set profiles.role to admin or coach for that user in Supabase.",
          );
        }
        return ok;
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[ensureStaffAuth] env sign-in exception:", e);
        return false;
      }
    };

    const current = await db.auth.getSession();
    if (current.data.session?.user) {
      if (await getIsStaff()) return true;
      return tryEnvSignIn();
    }

    return tryEnvSignIn();
  })().finally(() => {
    staffAuthPromise = null;
  });

  return staffAuthPromise;
}

/**
 * Strict admin only (create staff, etc.). Coach session returns false unless env admin login succeeds.
 */
export function ensureAdminAuth(): Promise<boolean> {
  if (adminAuthPromise) return adminAuthPromise;

  adminAuthPromise = (async () => {
    if (!db || !hasFirebaseConfig) return false;

    if (isLocalAuthMode) {
      return true;
    }

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
        return getIsAdmin();
      } catch {
        return false;
      }
    };

    const current = await db.auth.getSession();
    if (current.data.session?.user) {
      if (await getIsAdmin()) return true;
      // Coach (or member): only env bot can become admin; do not treat coach as admin.
      return tryEnvSignIn();
    }

    return tryEnvSignIn();
  })().finally(() => {
    adminAuthPromise = null;
  });

  return adminAuthPromise;
}

export { hasFirebaseConfig };
