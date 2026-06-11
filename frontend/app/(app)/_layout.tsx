import React from "react";
import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors } from "@/src/theme";

export default function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Pesanan",
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Pelanggan",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Lainnya",
          tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="new-order" options={{ href: null }} />
      <Tabs.Screen name="order/[id]" options={{ href: null }} />
      <Tabs.Screen name="services" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="users" options={{ href: null }} />
    </Tabs>
  );
}
