import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("owner@laundry.com");
  const [password, setPassword] = useState("owner123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(app)/dashboard");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Login gagal. Cek email/password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="signin-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <LinearGradient
            colors={[colors.brandTertiary, colors.surface]}
            style={styles.hero}
          >
            <View style={styles.logoBox}>
              <Ionicons name="water" size={42} color={colors.brand} />
            </View>
            <Text style={styles.title}>Laundry POS</Text>
            <Text style={styles.subtitle}>Kelola usaha laundry Anda dengan mudah</Text>
          </LinearGradient>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={18} color={colors.muted} />
              <TextInput
                testID="signin-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="email@laundry.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Password</Text>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
              <TextInput
                testID="signin-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={styles.input}
              />
            </View>

            {error && (
              <Text testID="signin-error" style={styles.error}>{error}</Text>
            )}

            <Pressable
              testID="signin-submit-button"
              onPress={onSubmit}
              disabled={loading}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.btnText}>Masuk</Text>
              )}
            </Pressable>

            <View style={styles.demoBox}>
              <Text style={styles.demoTitle}>Akun Demo:</Text>
              <Text style={styles.demoText}>Owner: owner@laundry.com / owner123</Text>
              <Text style={styles.demoText}>Kasir: kasir@laundry.com / kasir123</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1 },
  hero: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  logoBox: {
    width: 72, height: 72, borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.brand, shadowOpacity: 0.15, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  title: {
    marginTop: spacing.lg, fontSize: 24, fontWeight: "600", color: colors.onSurface,
  },
  subtitle: {
    marginTop: spacing.xs, color: colors.onSurfaceSecondary, fontSize: 14,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  label: { fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: spacing.sm, fontWeight: "500" },
  inputBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 48, backgroundColor: colors.surfaceSecondary,
  },
  input: { flex: 1, fontSize: 15, color: colors.onSurface },
  error: { color: colors.error, marginTop: spacing.md, fontSize: 13 },
  btn: {
    marginTop: spacing.xl, height: 50, borderRadius: radius.md,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  btnText: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 15 },
  demoBox: {
    marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  demoTitle: { fontSize: 12, fontWeight: "600", color: colors.onBrandTertiary, marginBottom: spacing.xs },
  demoText: { fontSize: 12, color: colors.onBrandSecondary, marginTop: 2 },
});
