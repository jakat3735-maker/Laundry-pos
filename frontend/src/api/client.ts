import axios from "axios";

// Hardcoded URL untuk memastikan APK tidak kehilangan alamat server
const BASE = "https://laundry-pos-production.up.railway.app";

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 30000, // Menambah timeout jadi 30 detik
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  }
});

let _token: string | null = null;

export const setAuthToken = (token: string | null) => {
  _token = token;
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
};

export const getAuthToken = () => _token;
