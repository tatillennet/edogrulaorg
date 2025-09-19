// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/** Basit hedef normalizasyonu (":5000", "localhost:5000", "http://..." hepsini toparlar) */
function normalizeTarget(raw) {
  const RAW = String(raw || "").trim();
  if (!RAW) return "http://localhost:5000";
  if (/^https?:\/\//i.test(RAW)) return RAW.replace(/\/+$/, "");
  if (/^:\d+$/.test(RAW)) return `http://localhost:${RAW.slice(1)}`; // ":5000"
  return `http://${RAW}`.replace(/\/+$/, ""); // "localhost:5000" → "http://localhost:5000"
}

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = normalizeTarget(env.VITE_API_URL);

  /** Ortak proxy ayarları */
  const proxyCommon = {
    target,
    changeOrigin: true,
    secure: false,          // self-signed/HTTP arka uçlar için
    followRedirects: true,
    ws: true,               // gerekirse WebSocket
  };

  const proxy = {
    "/api": proxyCommon,
    "/uploads": {
      ...proxyCommon,
      // KÖTÜ YOLLARI DÜZELT:
      //  - ters slashları / yap
      //  - /uploads/https://uploads/... → /uploads/...
      rewrite: (p) =>
        p
          .replace(/\\+/g, "/")
          .replace(/^\/uploads\/https?:\/\/uploads\//i, "/uploads/"),
    },
  };

  return defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy,
      headers: {
        // img yüklemelerinde CORP uyarılarını önlemek için
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    },
    // Not: Vite 5'te preview.proxy desteklenir; Vite <5 ise bu blok yok sayılabilir.
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy,
    },
  });
};
