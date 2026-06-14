import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

type Handler = (payload: any) => void;
type EventType = "orders_updated" | "customers_updated" | "services_updated" | "connected";

interface RealtimeCtx {
  connected: boolean;
  subscribe: (event: EventType, handler: Handler) => () => void;
}

const Ctx = createContext<RealtimeCtx | undefined>(undefined);

const buildWsUrl = (token: string) => {
  const base = "https://laundry-pos-production.up.railway.app";
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/api/ws?token=${encodeURIComponent(token)}`;
};

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<EventType, Set<Handler>>>(new Map());
  const reconnectTimer = useRef<any>(null);
  const pingTimer = useRef<any>(null);
  const shouldReconnect = useRef(true);

  useEffect(() => {
    if (!token) {
      shouldReconnect.current = false;
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setConnected(false);
      return;
    }

    shouldReconnect.current = true;

    const connect = () => {
      try {
        const url = buildWsUrl(token);
        console.log("DEBUG: Connecting to WS:", url.split('?')[0]);
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          console.log("DEBUG: WS Connected");
          if (pingTimer.current) clearInterval(pingTimer.current);
          pingTimer.current = setInterval(() => {
            try {
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send("ping");
              }
            } catch (err) {
              console.log("DEBUG: Ping failed", err);
            }
          }, 30000);
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            const type = data.type as EventType;
            const handlers = handlersRef.current.get(type);
            if (handlers) handlers.forEach((h) => h(data.payload));
          } catch {}
        };

        ws.onerror = () => { /* ignore — onclose will handle */ };

        ws.onclose = () => {
          setConnected(false);
          if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
          if (shouldReconnect.current) {
            reconnectTimer.current = setTimeout(connect, 3000);
          }
        };
      } catch (e) {
        if (shouldReconnect.current) reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pingTimer.current) clearInterval(pingTimer.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setConnected(false);
    };
  }, [token]);

  const subscribe = (event: EventType, handler: Handler) => {
    if (!handlersRef.current.has(event)) handlersRef.current.set(event, new Set());
    handlersRef.current.get(event)!.add(handler);
    return () => {
      handlersRef.current.get(event)?.delete(handler);
    };
  };

  return <Ctx.Provider value={{ connected, subscribe }}>{children}</Ctx.Provider>;
};

export const useRealtime = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRealtime must be inside RealtimeProvider");
  return v;
};

/** Subscribe to a server event and run handler. Handler is recreated when deps change. */
export const useRealtimeEvent = (event: EventType, handler: Handler) => {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const unsub = subscribe(event, (p) => ref.current(p));
    return unsub;
  }, [event, subscribe]);
};
