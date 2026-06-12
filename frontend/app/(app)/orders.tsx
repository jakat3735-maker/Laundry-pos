import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useRealtimeEvent } from "@/src/contexts/RealtimeContext";
import { colors, spacing, radius, statusColors, formatIDR } from "@/src/theme";

const FILTERS = [
  { id: "semua", label: "Semua" },
  { id: "diterima", label: "Diterima" },
  { id: "dicuci", label: "Dicuci" },
  { id: "siap", label: "Siap" },
  { id: "selesai", label: "Selesai" },
  { id: "diambil", label: "Diambil" },
];

export default function Orders() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("semua");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (f: string) => {
    try {
      const res = await api.get("/orders", { params: { status_filter: f } });
      setOrders(res.data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(filter); }, [filter, load]));
  useRealtimeEvent("orders_updated", () => load(filter));

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="orders-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Pesanan</Text>
        <Pressable
          testID="new-order-fab"
          onPress={() => router.push("/(app)/new-order")}
          style={styles.fab}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Buat Order</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              testID={`filter-chip-${f.id}`}
              onPress={() => setFilter(f.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
      ) : orders.length === 0 ? (
        <View style={styles.empty} testID="orders-empty">
          <Ionicons name="basket-outline" size={56} color={colors.muted} />
          <Text style={styles.emptyText}>Tidak ada pesanan di status ini</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(filter); }}
              tintColor={colors.brand}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`order-card-${item.order_no}`}
              onPress={() => router.push(`/(app)/order/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.orderNo}>{item.order_no}</Text>
                  <View style={[styles.badge, { backgroundColor: statusColors[item.status]?.bg }]}>
                    <Text style={{ color: statusColors[item.status]?.fg, fontSize: 11, fontWeight: "600" }}>
                      {statusColors[item.status]?.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cust}>{item.customer_name}</Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemCount}>{item.items.length} item</Text>
                  <Text style={styles.total}>{formatIDR(item.total)}</Text>
                </View>
                <View style={styles.payRow}>
                  <Ionicons
                    name={item.payment_status === "paid" ? "checkmark-circle" : "time-outline"}
                    size={14}
                    color={item.payment_status === "paid" ? colors.success : colors.warning}
                  />
                  <Text style={[styles.payText, { color: item.payment_status === "paid" ? colors.success : colors.warning }]}>
                    {item.payment_status === "paid" ? "Lunas" : "Belum Bayar"}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: "600", color: colors.onSurface },
  fab: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.brand, paddingHorizontal: spacing.md, height: 38,
    borderRadius: radius.pill,
  },
  fabText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  chipsScroll: { maxHeight: 56, minHeight: 56 },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", paddingVertical: spacing.sm },
  chip: {
    height: 36, paddingHorizontal: 14, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderNo: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  cust: { fontSize: 14, color: colors.onSurfaceSecondary, marginVertical: spacing.xs },
  itemCount: { fontSize: 12, color: colors.muted },
  total: { fontSize: 15, fontWeight: "600", color: colors.brand },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  payRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  payText: { fontSize: 12, fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  emptyText: { color: colors.muted, marginTop: spacing.md, fontSize: 13 },
});
