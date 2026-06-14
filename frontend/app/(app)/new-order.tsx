import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { colors, spacing, radius, formatIDR } from "../../src/theme";

interface Item { service_id: string; service_name: string; price: number; unit: string; quantity: number; }

export default function NewOrder() {
  const router = useRouter();
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.get("/services"), api.get("/customers")]);
      setServices(s.data);
      setCustomers(c.data);
    } catch (e) {
      console.warn("Failed to load data for order:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const addItem = (svc: any) => {
    const exists = items.find((i) => i.service_id === svc.id);
    if (exists) {
      setItems(items.map((i) => i.service_id === svc.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { service_id: svc.id, service_name: svc.name, price: svc.price, unit: svc.unit, quantity: 1 }]);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setItems((prev) => prev
      .map((i) => i.service_id === id ? { ...i, quantity: Math.max(0.5, +(i.quantity + delta).toFixed(1)) } : i)
    );
  };

  const removeItem = (id: string) => setItems(items.filter((i) => i.service_id !== id));

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const submit = useCallback(async () => {
    if (!customer || items.length === 0) return;
    setSaving(true);
    try {
      const res = await api.post("/orders", {
        customer_id: customer.id,
        customer_name: customer.name,
        items,
        notes,
      });
      router.replace(`/(app)/order/${res.data.id}`);
    } catch (e) {
      console.warn(e);
    } finally { setSaving(false); }
  }, [customer, items, notes, router]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  const filteredCustomers = (customers || []).filter(c => {
    const n = (c.name || "").toLowerCase();
    const p = (c.phone || "");
    const q = search.toLowerCase();
    return n.includes(q) || p.includes(q);
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="new-order-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Buat Order Baru</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Customer */}
          <Text style={styles.sectionTitle}>Pelanggan</Text>
          <Pressable testID="pick-customer" onPress={() => setPickerOpen(true)} style={styles.pickerBox}>
            {customer ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerLabel}>{customer.name}</Text>
                <Text style={styles.pickerSub}>{customer.phone}</Text>
              </View>
            ) : (
              <Text style={styles.placeholder}>Pilih pelanggan</Text>
            )}
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </Pressable>

          {/* Services */}
          <Text style={styles.sectionTitle}>Pilih Layanan</Text>
          <View style={styles.servicesGrid}>
            {services.map((s) => (
              <Pressable
                key={s.id}
                testID={`service-${s.id}`}
                onPress={() => addItem(s)}
                style={({ pressed }) => [styles.svcCard, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.svcName}>{s.name}</Text>
                <Text style={styles.svcPrice}>{formatIDR(s.price)}/{s.unit}</Text>
                <View style={styles.svcAdd}>
                  <Ionicons name="add" size={14} color="#fff" />
                </View>
              </Pressable>
            ))}
          </View>

          {/* Items */}
          {items.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Item Order</Text>
              {items.map((i) => (
                <View key={i.service_id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{i.service_name}</Text>
                    <Text style={styles.itemSub}>{formatIDR(i.price)} × {i.quantity} {i.unit}</Text>
                  </View>
                  <View style={styles.qtyBox}>
                    <Pressable onPress={() => updateQty(i.service_id, -0.5)} style={styles.qtyBtn}>
                      <Ionicons name="remove" size={16} color={colors.brand} />
                    </Pressable>
                    <Text style={styles.qtyText}>{i.quantity}</Text>
                    <Pressable onPress={() => updateQty(i.service_id, +0.5)} style={styles.qtyBtn}>
                      <Ionicons name="add" size={16} color={colors.brand} />
                    </Pressable>
                  </View>
                  <Pressable onPress={() => removeItem(i.service_id)} style={{ padding: spacing.xs }}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </>
          )}

          {/* Notes */}
          <Text style={styles.sectionTitle}>Catatan (opsional)</Text>
          <TextInput
            value={notes} onChangeText={setNotes}
            placeholder="Misal: noda berat, jangan diperas..."
            placeholderTextColor={colors.muted}
            style={styles.notesInput} multiline
          />
        </ScrollView>

        {/* Sticky bottom */}
        <View style={styles.bottom}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatIDR(total)}</Text>
          </View>
          <Pressable
            testID="submit-order-btn"
            disabled={!customer || items.length === 0 || saving}
            onPress={submit}
            style={[styles.submitBtn, (!customer || items.length === 0) && { opacity: 0.5 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.submitText}>Proses Order</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Customer picker */}
        <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Pilih Pelanggan</Text>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color={colors.muted} />
                <TextInput
                  value={search} onChangeText={setSearch}
                  placeholder="Cari nama / no. HP"
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, fontSize: 14, color: colors.onSurface }}
                />
              </View>
              <ScrollView style={{ maxHeight: 360 }}>
                {filteredCustomers.map((c) => (
                  <Pressable
                    key={c.id}
                    testID={`cust-pick-${c.id}`}
                    onPress={() => { setCustomer(c); setPickerOpen(false); setSearch(""); }}
                    style={({ pressed }) => [styles.custRow, pressed && { opacity: 0.8 }]}
                  >
                    <View style={styles.cAvatar}>
                      <Text style={styles.cAvatarText}>{c.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cName}>{c.name}</Text>
                      <Text style={styles.cPhone}>{c.phone}</Text>
                    </View>
                  </Pressable>
                ))}
                {filteredCustomers.length === 0 && (
                  <Text style={{ textAlign: "center", color: colors.muted, padding: spacing.xl }}>
                    Tidak ada pelanggan. Tambah pelanggan dulu di tab Pelanggan.
                  </Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  pickerBox: { marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pickerLabel: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  pickerSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  placeholder: { flex: 1, color: colors.muted, fontSize: 14 },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: spacing.sm },
  svcCard: { width: "48%", padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, position: "relative" },
  svcName: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  svcPrice: { fontSize: 12, color: colors.brand, marginTop: spacing.xs, fontWeight: "500" },
  svcAdd: { position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  itemName: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  itemSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyBtn: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  qtyText: { minWidth: 30, textAlign: "center", fontSize: 13, fontWeight: "600", color: colors.onSurface },
  notesInput: { marginHorizontal: spacing.lg, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minHeight: 70, textAlignVertical: "top", fontSize: 14, color: colors.onSurface },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", gap: spacing.md },
  totalLabel: { fontSize: 11, color: colors.muted },
  totalValue: { fontSize: 18, fontWeight: "700", color: colors.brand, marginTop: 2 },
  submitBtn: { flexDirection: "row", gap: spacing.xs, alignItems: "center", paddingHorizontal: spacing.xl, height: 48, borderRadius: radius.md, backgroundColor: colors.brand },
  submitText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxl },
  sheetTitle: { fontSize: 16, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.lg },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 42, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  custRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  cAvatar: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  cAvatarText: { color: colors.brand, fontWeight: "600" },
  cName: { fontSize: 14, fontWeight: "500", color: colors.onSurface },
  cPhone: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
