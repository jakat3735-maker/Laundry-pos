export const colors = {
  surface: "#FFFFFF",
  onSurface: "#0F172A",
  surfaceSecondary: "#F8FAFC",
  onSurfaceSecondary: "#334155",
  surfaceTertiary: "#F1F5F9",
  onSurfaceTertiary: "#475569",
  surfaceInverse: "#0F172A",
  onSurfaceInverse: "#FFFFFF",
  brand: "#2563EB",
  brandPrimary: "#2563EB",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#DBEAFE",
  onBrandSecondary: "#1E3A8A",
  brandTertiary: "#EFF6FF",
  onBrandTertiary: "#2563EB",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",
  muted: "#94A3B8",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const statusColors: Record<string, { bg: string; fg: string; label: string }> = {
  diterima: { bg: "#DBEAFE", fg: "#1E3A8A", label: "Diterima" },
  dicuci: { bg: "#FEF3C7", fg: "#92400E", label: "Sedang Dicuci" },
  siap: { bg: "#D1FAE5", fg: "#065F46", label: "Siap Diambil" },
  selesai: { bg: "#E0E7FF", fg: "#3730A3", label: "Selesai" },
  diambil: { bg: "#F1F5F9", fg: "#475569", label: "Diambil" },
};

export const formatIDR = (n: number) =>
  "Rp " + (n || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
