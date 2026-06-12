import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api/client";
import { useRealtimeEvent } from "@/src/contexts/RealtimeContext";
import { colors, spacing, radius } from "@/src/theme";

export default function Customers() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/customers");
      setList(res.data);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtimeEvent("customers_updated", () => load());

  const openNew = () => { setEditing(null); setName(""); setPhone(""); setAddress(""); setModal(true); };
  const openEdit = (c: any) => { setEditing(c); setName(c.name); setPhone(c.phone); setAddress(c.address || ""); setModal(true); };

  const save = async () => {
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      if (editing) await api.put(`/customers/${editing.id}`, { name, phone, address });
      else await api.post("/customers", { name, phone, address });
      setModal(false);
      load();
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    await api.delete(`/customers/${id}`);
    load();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="customers-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Pelanggan</Text>
        <Pressable testID="add-customer-btn" onPress={openNew} style={styles.fab}>
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} /> : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={colors.muted} />
              <Text style={styles.emptyText}>Belum ada pelanggan</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cname}>{item.name}</Text>
                <Text style={styles.cphone}>{item.phone}</Text>
                {!!item.address && <Text style={styles.caddr}>{item.address}</Text>}
              </View>
              <Pressable onPress={() => openEdit(item)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={18} color={colors.brand} />
              </Pressable>
              <Pressable onPress={() => del(item.id)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editing ? "Edit Pelanggan" : "Pelanggan Baru"}</Text>
            <Text style={styles.label}>Nama</Text>
            <TextInput testID="cust-name-input" value={name} onChangeText={setName} style={styles.input} placeholder="Nama pelanggan" />
            <Text style={styles.label}>No. HP</Text>
            <TextInput testID="cust-phone-input" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} placeholder="08xxxxxxxxxx" />
            <Text style={styles.label}>Alamat</Text>
            <TextInput value={address} onChangeText={setAddress} style={styles.input} placeholder="Alamat (opsional)" />
            <Pressable testID="save-customer-btn" onPress={save} disabled={saving} style={styles.saveBtn}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Simpan</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 22, fontWeight: "600", color: colors.onSurface },
  fab: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brand, fontWeight: "600" },
  cname: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  cphone: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  caddr: { fontSize: 11, color: colors.muted, marginTop: 2 },
  iconBtn: { padding: spacing.xs },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyText: { color: colors.muted, fontSize: 13, marginTop: spacing.md },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxl },
  sheetTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.lg },
  label: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: spacing.xs, fontWeight: "500" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, backgroundColor: colors.surfaceSecondary, fontSize: 14, color: colors.onSurface },
  saveBtn: { marginTop: spacing.xl, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
