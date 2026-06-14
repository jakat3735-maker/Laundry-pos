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
    try {
      const res = await api.post("/auth/login", { email, password });
      if (!res.data || !res.data.access_token) {
        throw new Error("Respons server tidak valid");
      }
      const { access_token, user: u } = res.data;
      setAuthToken(access_token);

      try {
        await storage.set(TOKEN_KEY, access_token);
        if (u) await storage.set(USER_KEY, JSON.stringify(u));
      } catch (e) {
        console.warn("Storage failed", e);
      }

      setToken(access_token);
      setUser(u || null);
    } catch (error: any) {
      if (error.response) {
        console.log("DEBUG: Login failed with status:", error.response.status);
        console.log("DEBUG: Error detail:", error.response.data);
      } else if (error.request) {
        console.log("DEBUG: No response received from server. Is the backend running at", api.defaults.baseURL, "?");
      } else {
        console.log("DEBUG: Request setup error:", error.message);
      }
      throw error;
    }
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
