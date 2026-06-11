import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api, setAuthToken } from "../api/client";

type Role = "owner" | "cashier";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

const TOKEN_KEY = "laundry_token";
const USER_KEY = "laundry_user";

const storage = {
  async get(k: string) {
    if (Platform.OS === "web") {
      try {
        return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null;
      } catch {
        return null;
      }
    }
    return await SecureStore.getItemAsync(k);
  },
  async set(k: string, v: string) {
    if (Platform.OS === "web") {
      try { localStorage.setItem(k, v); } catch {}
      return;
    }
    await SecureStore.setItemAsync(k, v);
  },
  async del(k: string) {
    if (Platform.OS === "web") {
      try { localStorage.removeItem(k); } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(k);
  },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await storage.get(TOKEN_KEY);
        const u = await storage.get(USER_KEY);
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
          setAuthToken(t);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const { access_token, user: u } = res.data;
    setAuthToken(access_token);
    await storage.set(TOKEN_KEY, access_token);
    await storage.set(USER_KEY, JSON.stringify(u));
    setToken(access_token);
    setUser(u);
  };

  const signOut = async () => {
    setAuthToken(null);
    await storage.del(TOKEN_KEY);
    await storage.del(USER_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, loading, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
};
