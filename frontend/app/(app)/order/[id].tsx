import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share, Modal, Image, Alert, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api, getAuthToken } from "../../../src/api/client";
import { useAuth } from "../../../src/contexts/AuthContext";
import { useRealtimeEvent } from "../../../src/contexts/RealtimeContext";
import { colors, spacing, radius, statusColors, formatIDR } from "../../../src/theme";

const STATUS_FLOW = ["diterima", "dicuci", "siap", "selesai", "diambil"];

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [midtransError, setMidtransError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<"thermal" | "std" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  const downloadReceipt = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Info", "Download tidak tersedia di versi web.");
      return;
    }
    setPrinting("std");
    try {
      const filename = `nota_${order.order_no}.pdf`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      const token = getAuthToken();

      const res = await FileSystem.downloadAsync(
        `${api.defaults.baseURL}/orders/${order.id}/pdf`,
        fileUri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.status === 200) {
        await Sharing.shareAsync(fileUri);
      } else {
        throw new Error(`Gagal mendownload nota (${res.status})`);
      }
    } catch (e: any) {
      Alert.alert("Gagal", e.message || "Gagal mendownload nota");
    } finally {
      setPrinting(null);
    }
  };

  const printThermal = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Info", "Download tidak tersedia di versi web.");
      return;
    }
    setPrinting("thermal");
    try {
      const filename = `thermal_${order.order_no}.pdf`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      const token = getAuthToken();

      const res = await FileSystem.downloadAsync(
        `${api.defaults.baseURL}/orders/${order.id}/pdf-thermal`,
        fileUri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.status === 200) {
        await Sharing.shareAsync(fileUri);
      } else {
        throw new Error(`Gagal mendownload nota thermal (${res.status})`);
      }
    } catch (e: any) {
      Alert.alert("Gagal", e.message || "Gagal mendownload nota thermal");
    } finally {
      setPrinting(null);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Hapus Pesanan",
      "Apakah Anda yakin ingin menghapus pesanan ini? Tindakan ini tidak dapat dibatalkan.",
      [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: deleteOrder },
      ]
    );
  };

  const deleteOrder = async () => {
    setDeleting(true);
    try {
      await api.delete(`/orders/${id}`);
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", e?.response?.data?.detail || "Gagal menghapus pesanan");
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = async () => {
    if (!order) return;
    setEditItems(JSON.parse(JSON.stringify(order.items)));
    setEditNotes(order.notes || "");
    setEditModal(true);
    try {
      const res = await api.get("/services");
      setServices(res.data);
    } catch (e) {
      console.warn("Failed to load services", e);
    }
  };

  const updateEditQty = (sid: string, delta: number) => {
    setEditItems(prev => prev.map(i =>
      i.service_id === sid ? { ...i, quantity: Math.max(0.1, +(i.quantity + delta).toFixed(1)) } : i
    ));
  };

  const addEditItem = (svc: any) => {
    const exists = editItems.find(i => i.service_id === svc.id);
    if (exists) {
      updateEditQty(svc.id, 1);
    } else {
      setEditItems([...editItems, { service_id: svc.id, service_name: svc.name, price: svc.price, unit: svc.unit, quantity: 1 }]);
    }
  };

  const removeEditItem = (sid: string) => {
    setEditItems(prev => prev.filter(i => i.service_id !== sid));
  };

  const saveEdit = async () => {
    if (editItems.length === 0) {
      Alert.alert("Error", "Minimal harus ada 1 item");
      return;
    }
    setSavingEdit(true);
    try {
      const body = {
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        items: editItems,
        notes: editNotes
      };
      const res = await api.put(`/orders/${order.id}`, body);
      setOrder(res.data);
      setEditModal(false);
      Alert.alert("Sukses", "Pesanan berhasil diperbarui");
    } catch (e: any) {
      Alert.alert("Gagal", e?.response?.data?.detail || "Gagal memperbarui pesanan");
    } finally {
      setSavingEdit(false);
    }
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
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable onPress={printThermal} disabled={!!printing} style={styles.iconBtn}>
            {printing === "thermal" ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Image
                source={require("../../../assets/images/Print Portable.png")}
                style={[{ width: 24, height: 24 }, printing === "std" && { opacity: 0.3 }]}
                resizeMode="contain"
              />
            )}
          </Pressable>
          <Pressable onPress={downloadReceipt} disabled={!!printing} style={styles.iconBtn}>
            {printing === "std" ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Image
                source={require("../../../assets/images/Std.png")}
                style={[{ width: 24, height: 24 }, printing === "thermal" && { opacity: 0.3 }]}
                resizeMode="contain"
              />
            )}
          </Pressable>
          {user?.role === "owner" && (
            <>
              <Pressable onPress={openEdit} style={[styles.iconBtn, { marginLeft: spacing.xs }]}>
                <Ionicons name="create-outline" size={20} color={colors.brand} />
              </Pressable>
              <Pressable onPress={confirmDelete} disabled={deleting} style={[styles.iconBtn, { marginLeft: spacing.xs }]}>
                {deleting ? <ActivityIndicator size="small" color={colors.error} /> : <Ionicons name="trash-outline" size={20} color={colors.error} />}
              </Pressable>
            </>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {/* Status & order info */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.orderNo}>{order.order_no}</Text>
              <Text style={styles.cust}>{order.customer_name}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: statusColors[order.status as keyof typeof statusColors]?.bg || colors.brandTertiary }]}>
              <Text style={{ color: statusColors[order.status as keyof typeof statusColors]?.fg || colors.brand, fontSize: 11, fontWeight: "600" }}>
                {statusColors[order.status as keyof typeof statusColors]?.label || order.status}
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
                    {statusColors[s as keyof typeof statusColors]?.label || s}
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

      {/* Edit Modal */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setEditModal(false)} />
          <View style={styles.editSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Rincian Pesanan</Text>
              <Pressable onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: '80%' }}>
              <Text style={styles.editSectionTitle}>Item Saat Ini</Text>
              {editItems.map((item, idx) => (
                <View key={idx} style={styles.editItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editItemName}>{item.service_name}</Text>
                    <Text style={styles.editItemSub}>{formatIDR(item.price)} / {item.unit}</Text>
                  </View>
                  <View style={styles.editQtyBox}>
                    <Pressable onPress={() => updateEditQty(item.service_id, -0.1)} style={styles.editQtyBtn}>
                      <Ionicons name="remove" size={16} color={colors.brand} />
                    </Pressable>
                    <Text style={styles.editQtyText}>{item.quantity}</Text>
                    <Pressable onPress={() => updateEditQty(item.service_id, 0.1)} style={styles.editQtyBtn}>
                      <Ionicons name="add" size={16} color={colors.brand} />
                    </Pressable>
                  </View>
                  <Pressable onPress={() => removeEditItem(item.service_id)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>
              ))}

              <Text style={styles.editSectionTitle}>Tambah Layanan</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                <View style={styles.servicesRow}>
                  {services.map(s => (
                    <Pressable key={s.id} onPress={() => addEditItem(s)} style={styles.svcChip}>
                      <Text style={styles.svcChipText}>{s.name}</Text>
                      <Ionicons name="add" size={14} color={colors.brand} />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.editSectionTitle}>Catatan</Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Tambah catatan..."
                style={styles.editNotesInput}
                multiline
              />
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Pressable
                onPress={saveEdit}
                disabled={savingEdit}
                style={[styles.saveEditBtn, savingEdit && { opacity: 0.5 }]}
              >
                {savingEdit ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.saveEditBtnText}>Simpan Perubahan</Text>
                )}
              </Pressable>
            </View>
          </View>
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
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  editSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, flex: 1, marginTop: 40 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  editSectionTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  editItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  editItemName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  editItemSub: { fontSize: 12, color: colors.muted },
  editQtyBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.md },
  editQtyBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  editQtyText: { fontSize: 14, fontWeight: "700", minWidth: 30, textAlign: "center" },
  servicesRow: { flexDirection: "row", gap: spacing.sm },
  svcChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 4 },
  svcChipText: { fontSize: 12, fontWeight: "500", color: colors.onSurfaceSecondary },
  editNotesInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 80, textAlignVertical: "top", backgroundColor: colors.surfaceSecondary },
  sheetFooter: { marginTop: spacing.xl, paddingBottom: spacing.lg },
  saveEditBtn: { height: 50, backgroundColor: colors.brand, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  saveEditBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
