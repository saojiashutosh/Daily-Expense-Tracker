"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { UNAUTHORIZED_EVENT, api, tokenStore } from "./api";

interface AuthState {
  /** false until we've checked localStorage on the client */
  ready: boolean;
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  // localStorage only exists in the browser, so hydrate after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsername(tokenStore.get() ? (tokenStore.username() ?? "") : null);
    setReady(true);
  }, []);

  const signOutLocally = useCallback(() => {
    tokenStore.clear();
    setUsername(null);
    queryClient.clear();
  }, [queryClient]);

  // Token rejected by the server (expired / deleted): drop it and go to login.
  useEffect(() => {
    const onUnauthorized = () => {
      signOutLocally();
      router.replace("/login");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router, signOutLocally]);

  const login = useCallback(
    async (user: string, password: string) => {
      const { token } = await api.login(user, password);
      queryClient.clear();
      tokenStore.set(token, user);
      setUsername(user);
    },
    [queryClient],
  );

  const register = useCallback(
    async (user: string, email: string, password: string) => {
      const { token, user: created } = await api.register(user, email, password);
      queryClient.clear();
      tokenStore.set(token, created.username);
      setUsername(created.username);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Even if the server call fails we still want to sign out locally.
    }
    signOutLocally();
  }, [signOutLocally]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      username,
      isAuthenticated: username !== null,
      login,
      register,
      logout,
    }),
    [ready, username, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
