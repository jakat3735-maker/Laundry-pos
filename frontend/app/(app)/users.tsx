import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, Redirect } from "expo-router";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/contexts/AuthContext";
import { colors, spacing, radius } from "../../src/theme";

export default function Users() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"owner" | "cashier">("cashier");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (user && user.role !== "owner") return <Redirect href="/(app)/dashboard" />;

  const load = useCallback(async () => {
    try {
      const res = await api.get("/users");
      setList(res.data);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setEmail(""); setFullName(""); setPassword(""); setRole("cashier"); setErr(null); setModal(true); };

  const save = async () => {
    setErr(null);
    if (!email.trim() || !password.trim() || !fullName.trim()) return;
    setSaving(true);
    try {
      await api.post("/auth/register", { email, password, full_name: fullName, role });
      setModal(false);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Gagal menambahkan user");
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    await api.delete(`/users/${id}`);
    load();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="users-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Manajemen Pengguna</Text>
        <Pressable testID="add-user-btn" onPress={openNew} style={styles.fab}>
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} /> : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={[styles.avatar, item.role === "owner" && { backgroundColor: colors.brand }]}>
                <Ionicons name={item.role === "owner" ? "shield-checkmark" : "person"} size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.uname}>{item.full_name}</Text>
                <Text style={styles.uemail}>{item.email}</Text>
              </View>
              <View style={[styles.roleBadge, item.role === "owner" && { backgroundColor: colors.brand }]}>
                <Text style={[styles.roleText, item.role === "owner" && { color: "#fff" }]}>
                  {item.role === "owner" ? "Owner" : "Kasir"}
                </Text>
              </View>
              {item.id !== user?.id && (
                <Pressable onPress={() => del(item.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setModal(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Tambah Pengguna</Text>
            <Text style={styles.label}>Nama Lengkap</Text>
            <TextInput testID="usr-name-input" value={fullName} onChangeText={setFullName} style={styles.input} />
            <Text style={styles.label}>Email</Text>
            <TextInput testID="usr-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
            <Text style={styles.label}>Password</Text>
            <TextInput testID="usr-password-input" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
            <Text style={styles.label}>Role</Text>
            <View style={styles.segments}>
              {[{ id: "cashier", label: "Kasir" }, { id: "owner", label: "Owner" }].map((r) => (
                <Pressable key={r.id} onPress={() => setRole(r.id as any)} style={[styles.segment, role === r.id && styles.segmentActive]}>
                  <Text style={[styles.segmentText, role === r.id && styles.segmentTextActive]}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
            {err && <Text style={styles.err}>{err}</Text>}
            <Pressable testID="save-user-btn" onPress={save} disabled={saving} style={styles.saveBtn}>
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
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
  uname: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  uemail: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  roleText: { fontSize: 11, fontWeight: "600", color: colors.onSurfaceSecondary },
  iconBtn: { padding: spacing.xs },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxl },
  sheetTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.lg },
  label: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: spacing.xs, fontWeight: "500" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, backgroundColor: colors.surfaceSecondary, fontSize: 14, color: colors.onSurface },
  segments: { flexDirection: "row", gap: spacing.sm },
  segment: { flex: 1, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segmentText: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "500" },
  segmentTextActive: { color: "#fff" },
  err: { marginTop: spacing.md, color: colors.error, fontSize: 12 },
  saveBtn: { marginTop: spacing.xl, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
