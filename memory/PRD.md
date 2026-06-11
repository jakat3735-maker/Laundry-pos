# Laundry POS - Product Requirements Document

## Tujuan
Aplikasi mobile manajemen usaha laundry mirip Olsera POS — untuk owner & kasir mengelola pesanan, pelanggan, layanan, laporan pendapatan, dan menerima pembayaran online via Midtrans.

## Stack
- Frontend: React Native Expo SDK 54 + Expo Router (file-based)
- Backend: FastAPI + MongoDB (motor)
- Auth: JWT (bcrypt) multi-role: `owner`, `cashier`
- Payment: Midtrans Snap (sandbox) via WebView
- Bahasa: Indonesia

## Fitur (semua sudah terimplementasi)
1. **Login multi-role** — owner / kasir, JWT, persist via SecureStore.
2. **Dashboard** — KPI pendapatan & pesanan hari ini, quick actions, list pesanan berjalan.
3. **Manajemen Pesanan** — CRUD pesanan, filter status (semua/diterima/dicuci/siap/selesai/diambil), flow status maju, share nota.
4. **Manajemen Pelanggan** — CRUD pelanggan (nama, HP, alamat).
5. **Manajemen Layanan & Harga** — CRUD layanan (reguler/express/satuan, satuan kg/pcs) — owner only.
6. **Laporan** — total pendapatan, distribusi status, hari ini vs total.
7. **Pembayaran** — Cash atau Midtrans Snap (open WebView).
8. **Manajemen Pengguna** — owner bisa tambah/hapus kasir & owner.

## Endpoint utama (prefix /api)
- POST /auth/login, /auth/register (owner-only), GET /auth/me
- /users (owner)
- /customers, /services, /orders (CRUD)
- PUT /orders/{id}/status, /orders/{id}/payment
- GET /dashboard/stats
- POST /payments/midtrans/create/{order_id}, /payments/midtrans/notification

## Konfigurasi env (backend/.env)
- MONGO_URL, DB_NAME
- JWT_SECRET
- MIDTRANS_SERVER_KEY (placeholder, perlu diganti user)
- MIDTRANS_IS_PRODUCTION=false

## Akun Demo (seed otomatis)
- Owner: owner@laundry.com / owner123
- Kasir: kasir@laundry.com / kasir123
