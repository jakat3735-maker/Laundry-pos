import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, spacing, radius, formatIDR } from "@/src/theme";

const CATS = [
  { id: "reguler", label: "Reguler" },
  { id: "express", label: "Express" },
  { id: "satuan", label: "Satuan" },
];
const UNITS = [{ id: "kg", label: "kg" }, { id: "pcs", label: "pcs" }];

export default function Services() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<"kg" | "pcs">("kg");
  const [category, setCategory] = useState<"reguler" | "express" | "satuan">("reguler");
  const [saving, setSaving] = useState(false);

  const isOwner = user?.role === "owner";

  const load = useCallback(async () => {
    try {
      const res = await api.get("/services");
      setList(res.data);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setEditing(null); setName(""); setPrice(""); setUnit("kg"); setCategory("reguler"); setModal(true); };
  const openEdit = (s: any) => { setEditing(s); setName(s.name); setPrice(String(s.price)); setUnit(s.unit); setCategory(s.category); setModal(true); };

  const save = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      const body = { name, price: parseFloat(price), unit, category };
      if (editing) await api.put(`/services/${editing.id}`, body);
      else await api.post("/services", body);
      setModal(false);
      load();
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    await api.delete(`/services/${id}`);
    load();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="services-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Layanan & Harga</Text>
        {isOwner ? (
          <Pressable testID="add-service-btn" onPress={openNew} style={styles.fab}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        ) : <View style={styles.backBtn} />}
      </View>

      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} /> : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={[styles.catBadge, { backgroundColor: item.category === "express" ? "#FEF3C7" : item.category === "satuan" ? "#E0E7FF" : colors.brandTertiary }]}>
                <Text style={[styles.catText, { color: item.category === "express" ? "#92400E" : item.category === "satuan" ? "#3730A3" : colors.brand }]}>
                  {item.category.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.sname}>{item.name}</Text>
                <Text style={styles.sprice}>{formatIDR(item.price)} / {item.unit}</Text>
              </View>
              {isOwner && (
                <>
                  <Pressable onPress={() => openEdit(item)} style={styles.iconBtn}>
                    <Ionicons name="create-outline" size={18} color={colors.brand} />
                  </Pressable>
                  <Pressable onPress={() => del(item.id)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </>
              )}
            </View>
          )}
        />
      )}

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editing ? "Edit Layanan" : "Layanan Baru"}</Text>
            <Text style={styles.label}>Nama Layanan</Text>
            <TextInput testID="svc-name-input" value={name} onChangeText={setName} style={styles.input} />
            <Text style={styles.label}>Harga</Text>
            <TextInput testID="svc-price-input" value={price} onChangeText={setPrice} keyboardType="numeric" style={styles.input} />

            <Text style={styles.label}>Satuan</Text>
            <View style={styles.segments}>
              {UNITS.map((u) => (
                <Pressable key={u.id} onPress={() => setUnit(u.id as any)} style={[styles.segment, unit === u.id && styles.segmentActive]}>
                  <Text style={[styles.segmentText, unit === u.id && styles.segmentTextActive]}>{u.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Kategori</Text>
            <View style={styles.segments}>
              {CATS.map((c) => (
                <Pressable key={c.id} onPress={() => setCategory(c.id as any)} style={[styles.segment, category === c.id && styles.segmentActive]}>
                  <Text style={[styles.segmentText, category === c.id && styles.segmentTextActive]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable testID="save-svc-btn" onPress={save} disabled={saving} style={styles.saveBtn}>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  fab: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  catBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  catText: { fontSize: 10, fontWeight: "700" },
  sname: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  sprice: { fontSize: 12, color: colors.brand, marginTop: 2, fontWeight: "500" },
  iconBtn: { padding: spacing.xs },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxl },
  sheetTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.lg },
  label: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: spacing.xs, fontWeight: "500" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, backgroundColor: colors.surfaceSecondary, fontSize: 14, color: colors.onSurface },
  segments: { flexDirection: "row", gap: spacing.sm },
  segment: { flex: 1, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segmentText: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "500" },
  segmentTextActive: { color: "#fff" },
  saveBtn: { marginTop: spacing.xl, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
