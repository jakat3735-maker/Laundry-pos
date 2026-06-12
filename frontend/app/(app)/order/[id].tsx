import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";
import { api } from "@/src/api/client";
import { useRealtimeEvent } from "@/src/contexts/RealtimeContext";
import { colors, spacing, radius, statusColors, formatIDR } from "@/src/theme";

const STATUS_FLOW = ["diterima", "dicuci", "siap", "selesai", "diambil"];

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [midtransError, setMidtransError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/orders/${id}`);
      setOrder(res.data);
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeEvent("orders_updated", (p) => {
    if (!p?.order_no || p.order_no === order?.order_no) load();
  });

  const nextStatus = async () => {
    if (!order) return;
    const idx = STATUS_FLOW.indexOf(order.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    setUpdating(true);
    try {
      const res = await api.put(`/orders/${order.id}/status`, { status: next });
      setOrder(res.data);
    } finally { setUpdating(false); }
  };

  const markPaidCash = async () => {
    setUpdating(true);
    try {
      const res = await api.put(`/orders/${order.id}/payment`, { payment_status: "paid", payment_method: "cash" });
      setOrder(res.data);
    } finally { setUpdating(false); }
  };

  const payMidtrans = async () => {
    setMidtransError(null);
    setUpdating(true);
    try {
      const res = await api.post(`/payments/midtrans/create/${order.id}`);
      if (res.data.redirect_url) setSnapUrl(res.data.redirect_url);
      else setMidtransError("Tidak menerima redirect_url dari Midtrans");
    } catch (e: any) {
      setMidtransError(e?.response?.data?.detail || "Gagal menghubungi Midtrans. Pastikan MIDTRANS_SERVER_KEY sudah dikonfigurasi di backend/.env");
    } finally { setUpdating(false); }
  };

  const shareReceipt = async () => {
    if (!order) return;
    const lines = [
      `*Nota Laundry POS*`,
      `No: ${order.order_no}`,
      `Pelanggan: ${order.customer_name}`,
      ``,
      ...order.items.map((i: any) => `${i.service_name} ${i.quantity}${i.unit} × ${formatIDR(i.price)} = ${formatIDR(i.price * i.quantity)}`),
      ``,
      `Total: ${formatIDR(order.total)}`,
      `Status: ${statusColors[order.status]?.label}`,
      `Pembayaran: ${order.payment_status === "paid" ? "Lunas" : "Belum bayar"}`,
    ];
    try { await Share.share({ message: lines.join("\n") }); } catch {}
  };

  if (loading || !order) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  const statusIdx = STATUS_FLOW.indexOf(order.status);
  const canAdvance = statusIdx >= 0 && statusIdx < STATUS_FLOW.length - 1;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="order-detail-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Detail Order</Text>
        <Pressable testID="share-btn" onPress={shareReceipt} style={styles.iconBtn}>
          <Ionicons name="share-outline" size={20} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {/* Status & order info */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.orderNo}>{order.order_no}</Text>
              <Text style={styles.cust}>{order.customer_name}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: statusColors[order.status]?.bg }]}>
              <Text style={{ color: statusColors[order.status]?.fg, fontSize: 11, fontWeight: "600" }}>
                {statusColors[order.status]?.label}
              </Text>
            </View>
          </View>

          <View style={styles.stepsRow}>
            {STATUS_FLOW.map((s, i) => {
              const done = i <= statusIdx;
              return (
                <View key={s} style={styles.stepItem}>
                  <View style={[styles.stepDot, done && { backgroundColor: colors.brand }]} />
                  {i < STATUS_FLOW.length - 1 && (
                    <View style={[styles.stepLine, done && { backgroundColor: colors.brand }]} />
                  )}
                  <Text style={[styles.stepLabel, done && { color: colors.brand, fontWeight: "600" }]}>
                    {statusColors[s].label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Items */}
        <Text style={styles.sectionTitle}>Rincian</Text>
        <View style={styles.card}>
          {order.items.map((i: any, idx: number) => (
            <View key={idx} style={[styles.itemRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.iName}>{i.service_name}</Text>
                <Text style={styles.iSub}>{i.quantity} {i.unit} × {formatIDR(i.price)}</Text>
              </View>
              <Text style={styles.iTotal}>{formatIDR(i.price * i.quantity)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>{formatIDR(order.total)}</Text>
          </View>
          {!!order.notes && (
            <View style={styles.notesBox}>
              <Ionicons name="document-text-outline" size={14} color={colors.muted} />
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          )}
        </View>

        {/* Payment status */}
        <Text style={styles.sectionTitle}>Pembayaran</Text>
        <View style={[styles.card, { flexDirection: "row", alignItems: "center", gap: spacing.md }]}>
          <Ionicons
            name={order.payment_status === "paid" ? "checkmark-circle" : "alert-circle"}
            size={28}
            color={order.payment_status === "paid" ? colors.success : colors.warning}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.payTitle}>
              {order.payment_status === "paid" ? "Sudah Lunas" : "Belum Dibayar"}
            </Text>
            {order.payment_method && <Text style={styles.paySub}>via {order.payment_method}</Text>}
          </View>
        </View>

        {midtransError && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{midtransError}</Text>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.bottom}>
        {order.payment_status !== "paid" && (
          <Pressable testID="pay-cash-btn" onPress={markPaidCash} disabled={updating} style={[styles.actionBtn, styles.btnPrimary]}>
            {updating ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <Text style={styles.actionText}>Tandai Lunas (Cash)</Text>
              </>
            )}
          </Pressable>
        )}
        {canAdvance && (
          <Pressable testID="next-status-btn" onPress={nextStatus} disabled={updating} style={[styles.actionBtn, styles.btnPrimary, { marginTop: order.payment_status !== "paid" ? spacing.sm : 0 }]}>
            {updating ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="arrow-forward-circle" size={16} color="#fff" />
                <Text style={styles.actionText}>Lanjut → {statusColors[STATUS_FLOW[statusIdx + 1]].label}</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* Midtrans WebView */}
      <Modal visible={!!snapUrl} animationType="slide" onRequestClose={() => setSnapUrl(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          <View style={styles.header}>
            <Pressable onPress={() => { setSnapUrl(null); load(); }} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.title}>Pembayaran Midtrans</Text>
            <View style={styles.iconBtn} />
          </View>
          {snapUrl && <WebView source={{ uri: snapUrl }} startInLoadingState />}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderNo: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  cust: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  stepsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  stepItem: { alignItems: "center", flex: 1 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border, marginBottom: spacing.xs, zIndex: 1 },
  stepLine: { position: "absolute", top: 4, left: "60%", right: "-40%", height: 2, backgroundColor: colors.border },
  stepLabel: { fontSize: 9, color: colors.muted, textAlign: "center", marginTop: 2 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  iName: { fontSize: 13, fontWeight: "500", color: colors.onSurface },
  iSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  iTotal: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  totalLabel: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "500" },
  totalVal: { fontSize: 17, fontWeight: "700", color: colors.brand },
  notesBox: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm },
  notesText: { flex: 1, fontSize: 12, color: colors.onSurfaceSecondary },
  payTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  paySub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  errorBox: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, backgroundColor: "#FEE2E2", borderRadius: radius.md, marginTop: spacing.md, alignItems: "flex-start" },
  errorText: { flex: 1, fontSize: 12, color: colors.error },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, height: 46, borderRadius: radius.md },
  btnPrimary: { backgroundColor: colors.brand },
  btnSecondary: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand },
  actionText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
