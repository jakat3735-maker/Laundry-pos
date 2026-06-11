import axios from "axios";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 20000,
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
