import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, spacing, radius, statusColors, formatIDR } from "@/src/theme";

export default function Reports() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api.get("/dashboard/stats"), api.get("/orders")]);
      setStats(s.data); setOrders(o.data);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const paidOrders = orders.filter((o) => o.payment_status === "paid");
  const unpaidOrders = orders.filter((o) => o.payment_status === "unpaid");
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + o.total, 0);

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="reports-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Laporan</Text>
        <View style={styles.backBtn} />
      </View>

      {loading || !stats ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {/* Revenue */}
          <View style={styles.kpiBig}>
            <Text style={styles.kpiBigLabel}>Total Pendapatan (Lunas)</Text>
            <Text style={styles.kpiBigValue}>{formatIDR(stats.revenue_total)}</Text>
            <View style={styles.kpiRow}>
              <View style={styles.kpiInline}>
                <Text style={styles.kpiInlineLabel}>Hari Ini</Text>
                <Text style={styles.kpiInlineValue}>{formatIDR(stats.revenue_today)}</Text>
              </View>
              <View style={styles.kpiInline}>
                <Text style={styles.kpiInlineLabel}>Belum Lunas</Text>
                <Text style={[styles.kpiInlineValue, { color: colors.warning }]}>{formatIDR(unpaidTotal)}</Text>
              </View>
            </View>
          </View>

          {/* Order counts */}
          <Text style={styles.sectionTitle}>Total Order</Text>
          <View style={styles.cardsRow}>
            <View style={styles.smallCard}>
              <Text style={styles.smLabel}>Hari Ini</Text>
              <Text style={styles.smValue}>{stats.orders_today}</Text>
            </View>
            <View style={styles.smallCard}>
              <Text style={styles.smLabel}>Total</Text>
              <Text style={styles.smValue}>{stats.orders_total}</Text>
            </View>
            <View style={styles.smallCard}>
              <Text style={styles.smLabel}>Lunas</Text>
              <Text style={[styles.smValue, { color: colors.success }]}>{paidOrders.length}</Text>
            </View>
          </View>

          {/* Status breakdown */}
          <Text style={styles.sectionTitle}>Distribusi Status</Text>
          <View style={styles.statusCard}>
            {Object.entries(stats.by_status || {}).length === 0 ? (
              <Text style={{ textAlign: "center", color: colors.muted, padding: spacing.lg }}>Belum ada data</Text>
            ) : (
              Object.entries(stats.by_status).map(([k, v]: any) => {
                const max = Math.max(...Object.values(stats.by_status).map(Number));
                const pct = max > 0 ? (v / max) * 100 : 0;
                return (
                  <View key={k} style={styles.statusItem}>
                    <View style={styles.statusLabelRow}>
                      <Text style={styles.statusName}>{statusColors[k]?.label || k}</Text>
                      <Text style={styles.statusCount}>{v}</Text>
                    </View>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: statusColors[k]?.fg || colors.brand }]} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  kpiBig: { backgroundColor: colors.brand, padding: spacing.xl, borderRadius: radius.lg, gap: spacing.sm },
  kpiBigLabel: { color: "#fff", opacity: 0.85, fontSize: 13 },
  kpiBigValue: { color: "#fff", fontSize: 26, fontWeight: "700" },
  kpiRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)" },
  kpiInline: { flex: 1 },
  kpiInlineLabel: { color: "#fff", opacity: 0.8, fontSize: 11 },
  kpiInlineValue: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: spacing.xl, marginBottom: spacing.sm },
  cardsRow: { flexDirection: "row", gap: spacing.sm },
  smallCard: { flex: 1, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  smLabel: { fontSize: 11, color: colors.muted },
  smValue: { fontSize: 22, fontWeight: "700", color: colors.onSurface, marginTop: 4 },
  statusCard: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  statusItem: {},
  statusLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  statusName: { fontSize: 13, color: colors.onSurface, fontWeight: "500" },
  statusCount: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600" },
  barBg: { height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.pill },
});
