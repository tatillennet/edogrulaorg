// src/main.jsx
import "./api/axios-boot"; // 🔧 GLOBAL: axios'u /api tekrarını önleyecek şekilde patch'ler
import "./api/axios-boot.js";
import "./index.css"; // ✅ Proje genel stilleri

import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Link,
  useLocation,
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import Apply from "./pages/Apply";
import Report from "./pages/Report";
import BusinessProfile from "./pages/BusinessProfile";
import VerifyEmail from "./pages/VerifyEmail";
import Results from "./pages/Results";
import SapancaBungalov from "./pages/SapancaBungalov";
import BlacklistProfile from "./pages/BlacklistProfile"; // ✅ 1. YENİ SAYFA İÇERİ AKTARILDI

/* ===================== URL Normalization (assets only) ===================== */

function normalizeAssetPath(p) {
  if (!p) return p;
  const s0 = String(p).trim();

  // Mutlak URL ise dokunma
  if (/^(https?:)?\/\//i.test(s0) || /^(data|blob):/i.test(s0)) return s0;

  let s = s0;
  if (s.startsWith("/")) return s.replace(/\/{2,}/g, "/"); // gereksiz //

  if (/^\/\/uploads\//i.test(s)) return s.replace(/^\/\//, "/"); // //uploads -> /uploads
  if (/^uploads\//i.test(s)) return "/" + s.replace(/^\/+/, ""); // uploads/... -> /uploads/...

  return s0; // göreli linkleri bozma
}

function normalizeBackgroundImage(el) {
  if (!el || !el.style) return;
  const bg = el.style.backgroundImage || "";
  if (!bg) return;
  const m = bg.match(/url\((['"]?)(.+?)\1\)/i);
  if (!m) return;
  const orig = m[2];
  const fixed = normalizeAssetPath(orig);
  if (fixed && fixed !== orig) el.style.backgroundImage = `url(${fixed})`;
}

function normalizeElementAndDescendants(root) {
  if (!root || !(root instanceof Element)) return;

  if (root.tagName === "IMG") {
    const orig = root.getAttribute("src");
    const fixed = normalizeAssetPath(orig);
    if (fixed && fixed !== orig) root.setAttribute("src", fixed);
  }

  normalizeBackgroundImage(root);

  root.querySelectorAll("img[src]").forEach((img) => {
    const o = img.getAttribute("src");
    const f = normalizeAssetPath(o);
    if (f && f !== o) img.setAttribute("src", f);
  });

  root.querySelectorAll("[style*='background']").forEach((el) =>
    normalizeBackgroundImage(el)
  );
}

function useLiveAssetFix() {
  React.useEffect(() => {
    requestAnimationFrame(() => normalizeElementAndDescendants(document.body));

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          const el = m.target;
          if (m.attributeName === "src" && el.tagName === "IMG") {
            const o = el.getAttribute("src");
            const f = normalizeAssetPath(o);
            if (f && f !== o) el.setAttribute("src", f);
          } else if (m.attributeName === "style") {
            normalizeBackgroundImage(el);
          }
        } else if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) normalizeElementAndDescendants(node);
          });
        }
      }
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "style"], // href'i izleme (linkleri bozmasın)
    });

    return () => obs.disconnect();
  }, []);
}

/* ===================== Router & Layout ===================== */

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function RootLayout() {
  useLiveAssetFix();
  return (
    <>
      <ScrollToTop />
      <Outlet />
    </>
  );
}

function NotFound() {
  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "20%",
        fontFamily: "Segoe UI, system-ui, -apple-system, Arial, sans-serif",
      }}
      role="alert"
      aria-live="assertive"
    >
      <h2 style={{ color: "#c0392b", marginBottom: 8 }}>404 - Sayfa Bulunamadı</h2>
      <p style={{ margin: "4px 0 16px" }}>Aradığınız sayfa mevcut değil.</p>
      <Link to="/" style={{ color: "#2980b9", fontWeight: 600 }}>
        Ana Sayfaya Dön
      </Link>
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootLayout />,
      children: [
        { index: true, element: <Search /> },
        { path: "apply", element: <Apply /> },
        { path: "report", element: <Report /> },

        // /ara ve /search aynı sayfa
        { path: "ara", element: <Results /> },
        { path: "search", element: <Results /> },

        // Sapanca bungalov listesi (Google tarzı)
        { path: "sapanca-bungalov-evleri", element: <SapancaBungalov /> },

        // ✅ 2. YENİ ROUTE DOĞRU YERE EKLENDİ
        { path: "kara-liste/:slug", element: <BlacklistProfile /> },

        { path: "business/:slug", element: <BusinessProfile /> },
        { path: "isletme/:slug", element: <BusinessProfile /> },
        { path: "b/:slug", element: <BusinessProfile /> },

        // dikkat: spesifik rotalardan sonra, en sonda kalsın
        { path: ":slug", element: <BusinessProfile /> },

        { path: "verify-email", element: <VerifyEmail /> },

        { path: "admin/login", element: <Login /> },
        { path: "admin/dashboard", element: <Dashboard /> },
        { path: "admin", element: <NotFound /> },

        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { future: { v7_startTransition: true, v7_relativeSplatPath: true } }
);

/* ===================== Mount ===================== */

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <RouterProvider
      router={router}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      fallbackElement={<div style={{ padding: 24, textAlign: "center" }}>Yükleniyor…</div>}
    />
  </React.StrictMode>
);
