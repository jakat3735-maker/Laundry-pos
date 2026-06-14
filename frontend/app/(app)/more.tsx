import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/contexts/AuthContext";
import { colors, spacing, radius } from "../../src/theme";

export default function More() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const items: { icon: any; label: string; onPress: () => void; ownerOnly?: boolean }[] = [
    { icon: "pricetags-outline", label: "Layanan & Harga", onPress: () => router.push("/(app)/services") },
    { icon: "bar-chart-outline", label: "Laporan", onPress: () => router.push("/(app)/reports") },
    { icon: "people-circle-outline", label: "Manajemen Pengguna", onPress: () => router.push("/(app)/users"), ownerOnly: true },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="more-screen">
      <Text style={styles.title}>Lainnya</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.full_name?.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.uname}>{user?.full_name}</Text>
          <Text style={styles.uemail}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role === "owner" ? "Owner" : "Kasir"}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
        {items
          .filter((i) => !i.ownerOnly || user?.role === "owner")
          .map((it) => (
            <Pressable
              key={it.label}
              testID={`menu-${it.label.toLowerCase().replace(/\s/g, "-")}`}
              onPress={it.onPress}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.iconBox}>
                <Ionicons name={it.icon} size={20} color={colors.brand} />
              </View>
              <Text style={styles.rowText}>{it.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}

        <Pressable
          testID="signout-btn"
          onPress={signOut}
          style={({ pressed }) => [styles.row, { borderColor: colors.error + "30" }, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.error + "15" }]}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
          </View>
          <Text style={[styles.rowText, { color: colors.error }]}>Keluar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  title: { fontSize: 22, fontWeight: "600", color: colors.onSurface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.brand, borderRadius: radius.lg, marginBottom: spacing.lg },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 22, fontWeight: "600" },
  uname: { color: "#fff", fontSize: 16, fontWeight: "600" },
  uemail: { color: "#fff", fontSize: 12, opacity: 0.85, marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", marginTop: spacing.xs, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.2)" },
  roleText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  iconBox: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontSize: 14, color: colors.onSurface, fontWeight: "500" },
});
