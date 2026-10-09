import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  clearAppStorage,
  syncPendingWrites,
} from "../services/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function requireUser(
  payload: { user: User } | null | undefined,
  action: string,
): User {
  const fetched = payload?.user;
  if (
    !fetched ||
    typeof fetched !== "object" ||
    typeof fetched.id !== "string"
  ) {
    throw new Error(
      "The server sent an unexpected response while trying to " +
        action +
        ". Please try again.",
    );
  }
  return fetched;
}

async function syncTimezone(fetched: User): Promise<User> {
  const timezone = browserTimezone();
  if (!timezone || timezone === fetched.timezone) return fetched;
  try {
    await api("/settings", {
      method: "PUT",
      body: JSON.stringify({ timezone }),
    });
    return { ...fetched, timezone };
  } catch {
    console.warn(
      "[auth] Could not sync the browser timezone; continuing with the saved timezone.",
    );
    return fetched;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const syncedUser = useRef<string | null>(null);

  const adoptUser = useCallback(async (next: User) => {
    setAuthError(null);
    if (syncedUser.current !== next.id) {
      syncedUser.current = next.id;
      const synced = await syncTimezone(next);
      setUser(synced);
      return synced;
    }
    setUser(next);
    return next;
  }, []);

  const loadUser = useCallback(() => {
    return api<{ user: User }>("/auth/me")
      .then((result) => adoptUser(requireUser(result, "continue")))
      .catch((caught: unknown) => {
        // A missing/expired session is a normal "logged out" state: send the
        // user to the login screen, never to an error page. An unexpected
        // server error on the session check is handled the same way so the
        // dashboard is never trapped on an error screen. Only a genuine
        // network failure (can't reach the API at all) keeps the Retry UI.
        const is401 = caught instanceof ApiError && caught.status === 401;
        const isNetwork =
          caught instanceof ApiError &&
          (caught.status === 0 || caught.code === "NETWORK_ERROR");
        if (is401 || (!isNetwork && !(caught instanceof ApiError))) {
          setUser(null);
          syncedUser.current = null;
          setAuthError(null);
        } else if (isNetwork) {
          setAuthError(
            caught instanceof Error
              ? caught.message
              : "Cannot reach the server. Please check your connection and try again.",
          );
        } else {
          // HTTP error that is not 401/network: treat as logged out.
          setUser(null);
          syncedUser.current = null;
          setAuthError(null);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [adoptUser]);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    await loadUser();
  }, [loadUser]);

  useEffect(() => {
    clearAppStorage();
    void loadUser();
    const sync = () => {
      void syncPendingWrites().catch((error: unknown) => {
        console.error("[api] Could not sync pending writes:", error);
      });
    };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, timezone: browserTimezone() }),
      });
      return adoptUser(requireUser(result, "continue"));
    },
    [adoptUser],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await api<{ user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          timezone: browserTimezone(),
        }),
      });
      return adoptUser(requireUser(result, "continue"));
    },
    [adoptUser],
  );

  const forgotPassword = useCallback(async (email: string) => {
    const result = await api<{ message: string }>("/auth/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return result.message;
  }, []);

  const resetPassword = useCallback(
    async (token: string, newPassword: string) => {
      const result = await api<{ message: string }>("/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      return result.message;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      clearAppStorage();
      syncedUser.current = null;
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      login,
      register,
      forgotPassword,
      resetPassword,
      logout,
      refreshUser: fetchUser,
    }),
    [
      user,
      loading,
      authError,
      login,
      register,
      forgotPassword,
      resetPassword,
      logout,
      fetchUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
