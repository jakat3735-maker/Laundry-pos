import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/contexts/AuthContext";
import { useRealtimeEvent, useRealtime } from "../../src/contexts/RealtimeContext";
import { colors, spacing, radius, statusColors, formatIDR } from "../../src/theme";

interface Stats {
  revenue_today: number;
  revenue_total: number;
  orders_today: number;
  orders_total: number;
  by_status: Record<string, number>;
  active_orders: any[];
  finished_orders: any[];
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { connected } = useRealtime();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/dashboard/stats");
      setStats(res.data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeEvent("orders_updated", () => load());

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const quickActions = [
    { label: "Buat Order", icon: "add-circle", color: colors.brand, onPress: () => router.push("/(app)/new-order") },
    { label: "Pelanggan", icon: "people", color: colors.success, onPress: () => router.push("/(app)/customers") },
    { label: "Layanan", icon: "pricetags", color: colors.warning, onPress: () => router.push("/(app)/services") },
    { label: "Laporan", icon: "bar-chart", color: colors.info, onPress: () => router.push("/(app)/reports") },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>Halo, {user?.full_name ? user.full_name.split(" ")[0] : "User"}</Text>
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: connected ? colors.success : colors.muted }]} />
              <Text style={styles.role}>{user?.role === "owner" ? "Owner" : "Kasir"} • {connected ? "Live tersinkron" : "Mode offline"}</Text>
            </View>
          </View>
          <Image
            source={require("../../assets/images/icon.png")}
            style={{ width: 32, height: 32, borderRadius: 8, marginRight: spacing.sm }}
            resizeMode="contain"
          />
          <Pressable testID="logout-btn" onPress={signOut} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={{ paddingTop: spacing.xxxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <>
            {/* KPI */}
            <View style={styles.kpiRow}>
              <View style={[styles.kpi, { backgroundColor: colors.brand }]} testID="kpi-revenue">
                <Ionicons name="cash-outline" size={20} color="#fff" />
                <Text style={styles.kpiLabel}>Pendapatan Hari Ini</Text>
                <Text style={styles.kpiValue}>{formatIDR(stats?.revenue_today ?? 0)}</Text>
              </View>
              <View style={[styles.kpi, { backgroundColor: colors.surfaceInverse }]} testID="kpi-orders">
                <Ionicons name="receipt-outline" size={20} color="#fff" />
                <Text style={styles.kpiLabel}>Pesanan Hari Ini</Text>
                <Text style={styles.kpiValue}>{stats?.orders_today ?? 0}</Text>
              </View>
            </View>

            {/* Quick actions */}
            <Text style={styles.sectionTitle}>Aksi Cepat</Text>
            <View style={styles.actionsGrid}>
              {quickActions.map((a) => (
                <Pressable
                  key={a.label}
                  testID={`action-${a.label.toLowerCase().replace(" ", "-")}`}
                  onPress={a.onPress}
                  style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.8 }]}
                >
                  <View style={[styles.actionIcon, { backgroundColor: a.color + "15" }]}>
                    <Ionicons name={a.icon as any} size={22} color={a.color} />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Active orders */}
            <Text style={styles.sectionTitle}>Pesanan Berjalan</Text>
            {(stats?.active_orders?.length ?? 0) === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="basket-outline" size={42} color={colors.muted} />
                <Text style={styles.emptyText}>Belum ada pesanan hari ini</Text>
              </View>
            ) : (
              stats?.active_orders?.map((o) => (
                <Pressable
                  key={o.id}
                  testID={`active-order-${o.order_no}`}
                  onPress={() => router.push(`/(app)/order/${o.id}`)}
                  style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.85 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNo}>{o.order_no}</Text>
                    <Text style={styles.orderCust}>{o.customer_name}</Text>
                    <Text style={styles.orderTotal}>{formatIDR(o.total)}</Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusColors[o.status as keyof typeof statusColors]?.bg || colors.brandTertiary },
                    ]}
                  >
                    <Text style={{ color: statusColors[o.status as keyof typeof statusColors]?.fg, fontSize: 11, fontWeight: "600" }}>
                      {statusColors[o.status as keyof typeof statusColors]?.label || o.status}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}

            {/* Finished orders */}
            <Text style={styles.sectionTitle}>Pesanan Selesai</Text>
            {(stats?.finished_orders?.length ?? 0) === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-done-circle-outline" size={42} color={colors.muted} />
                <Text style={styles.emptyText}>Belum ada pesanan selesai</Text>
              </View>
            ) : (
              stats?.finished_orders?.map((o) => (
                <Pressable
                  key={o.id}
                  testID={`finished-order-${o.order_no}`}
                  onPress={() => router.push(`/(app)/order/${o.id}`)}
                  style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.85 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNo}>{o.order_no}</Text>
                    <Text style={styles.orderCust}>{o.customer_name}</Text>
                    <Text style={styles.orderTotal}>{formatIDR(o.total)}</Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusColors[o.status as keyof typeof statusColors]?.bg || colors.brandTertiary },
                    ]}
                  >
                    <Text style={{ color: statusColors[o.status as keyof typeof statusColors]?.fg, fontSize: 11, fontWeight: "600" }}>
                      {statusColors[o.status as keyof typeof statusColors]?.label || o.status}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg,
  },
  greet: { fontSize: 20, fontWeight: "600", color: colors.onSurface },
  role: { fontSize: 12, color: colors.onSurfaceSecondary },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  kpiRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg },
  kpi: {
    flex: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs,
  },
  kpiLabel: { color: "#fff", opacity: 0.85, fontSize: 12, marginTop: spacing.xs },
  kpiValue: { color: "#fff", fontSize: 17, fontWeight: "600" },
  sectionTitle: {
    fontSize: 14, fontWeight: "600", color: colors.onSurface,
    paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md,
  },
  actionsGrid: { flexDirection: "row", paddingHorizontal: spacing.lg, gap: spacing.sm },
  actionCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  actionIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { fontSize: 11, color: colors.onSurface, fontWeight: "500" },
  orderCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, marginHorizontal: spacing.lg,
    padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  orderNo: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  orderCust: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  orderTotal: { fontSize: 14, fontWeight: "600", color: colors.brand, marginTop: spacing.xs },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  emptyBox: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.muted, fontSize: 13 },
});
