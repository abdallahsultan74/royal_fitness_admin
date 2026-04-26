import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import { db, getIsStaff, hasFirebaseConfig } from "../firebase";
import { localAuthEnabled } from "../buildConfig";

type AdminUser = {
  uid: string;
  email: string;
  name: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type AuthContextType = {
  user: AdminUser | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  isAuthenticated: false,
});

const STORAGE_KEY = "royal_admin_auth";
const forceLocalAuth = localAuthEnabled;

function mapAuthUser(firebaseUser: User): AdminUser {
  return {
    uid: firebaseUser.id,
    email: firebaseUser.email ?? "admin@royalfitness.com",
    name: (firebaseUser.user_metadata?.name as string | undefined) ?? "Royal Admin",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const canUseRemoteAuth = Boolean(db && hasFirebaseConfig && !forceLocalAuth);

  useEffect(() => {
    if (!canUseRemoteAuth) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setUser(JSON.parse(raw) as AdminUser);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
      return;
    }

    let cancelled = false;

    const syncFromSession = async (sessionUser: User | null) => {
      if (!sessionUser) {
        if (!cancelled) setUser(null);
        return;
      }
      const ok = await getIsStaff();
      if (!ok) {
        try {
          await db.auth.signOut();
        } catch {
          /* ignore */
        }
        if (!cancelled) setUser(null);
        return;
      }
      if (!cancelled) setUser(mapAuthUser(sessionUser));
    };

    db.auth
      .getSession()
      .then(({ data }) => syncFromSession(data.session?.user ?? null))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: listener } = db.auth.onAuthStateChange((_event, session) => {
      syncFromSession(session?.user ?? null).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [canUseRemoteAuth]);

  const login = async ({ email, password }: LoginPayload) => {
    if (!email || !password) throw new Error("Missing credentials");

    if (!canUseRemoteAuth) {
      const localUser: AdminUser = {
        uid: "local-admin",
        email,
        name: "Royal Admin",
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localUser));
      setUser(localUser);
      return;
    }

    const response = await db.auth.signInWithPassword({ email, password });
    if (response.error) throw response.error;
    const ok = await getIsStaff();
    if (!ok) {
      try {
        await db.auth.signOut();
      } catch {
        /* ignore */
      }
      setUser(null);
      throw new Error("USER_NOT_ALLOWED");
    }
    if (response.data.user) setUser(mapAuthUser(response.data.user));
  };

  const logout = async () => {
    if (!canUseRemoteAuth) {
      localStorage.removeItem(STORAGE_KEY);
      setUser(null);
      return;
    }
    await db.auth.signOut();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  return useContext(AuthContext);
}
