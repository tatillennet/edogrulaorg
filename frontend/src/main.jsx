// src/main.jsx
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
import Results from "./pages/Results"; // ✅ /ara & /search burada

/* ===================== URL Normalization ===================== */

/** "uploads/..", "//uploads/.." gibi göreli/hatalı yolları → "/uploads/.." yapar */
function normalizeAssetPath(p) {
  if (!p) return p;
  let s = String(p).trim();

  // 1) Mutlak URL ise (http/https) ASLA dokunma
  if (/^https?:\/\//i.test(s)) {
    return s;
  }
  // 2) Kökten başlayan yol ise gereksiz çift slash'ı normalize et
  if (s.startsWith("/")) {
    return s.replace(/\/{2,}/g, "/");
  }

  // 3) "//uploads/..." → "/uploads/..."
  if (/^\/\/uploads\//i.test(s)) return s.replace(/^\/\//, "/");

  // 4) "uploads/..." → "/uploads/..."
  if (/^uploads\//i.test(s)) return "/" + s;

  // 5) Salt dosya adı veya göreli yol → /uploads/ altına sabitle
  return ("/uploads/" + s).replace(/\/{2,}/g, "/");
}

/** style.backgroundImage içindeki url("...") kısmını da normalize eder */
function normalizeBackgroundImage(el) {
  if (!el || !el.style) return;
  const bg = el.style.backgroundImage || "";
  if (!bg || !/url\((.*?)\)/i.test(bg)) return;

  const m = bg.match(/url\((['"]?)(.+?)\1\)/i);
  if (!m) return;

  const orig = m[2];
  const fixed = normalizeAssetPath(orig);
  if (fixed && fixed !== orig) {
    el.style.backgroundImage = `url(${fixed})`;
  }
}

/** Tek bir element ve altındaki img/a/style(background) alanlarını düzelt */
function normalizeElementAndDescendants(root) {
  if (!root || !(root instanceof Element)) return;

  if (root.tagName === "IMG") {
    const orig = root.getAttribute("src");
    const fixed = normalizeAssetPath(orig);
    if (fixed && fixed !== orig) root.setAttribute("src", fixed);
  }

  if (root.tagName === "A") {
    const orig = root.getAttribute("href");
    const fixed = normalizeAssetPath(orig);
    if (fixed && fixed !== orig) root.setAttribute("href", fixed);
  }

  normalizeBackgroundImage(root);

  root.querySelectorAll("img[src]").forEach((img) => {
    const o = img.getAttribute("src");
    const f = normalizeAssetPath(o);
    if (f && f !== o) img.setAttribute("src", f);
  });

  root.querySelectorAll("a[href]").forEach((a) => {
    const o = a.getAttribute("href");
    const f = normalizeAssetPath(o);
    if (f && f !== o) a.setAttribute("href", f);
  });

  root.querySelectorAll("[style*='background']").forEach((el) =>
    normalizeBackgroundImage(el)
  );
}

/** DOM’u canlı izleyip (slider gibi) sonradan eklenenleri de düzeltir */
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
          } else if (m.attributeName === "href" && el.tagName === "A") {
            const o = el.getAttribute("href");
            const f = normalizeAssetPath(o);
            if (f && f !== o) el.setAttribute("href", f);
          } else if (m.attributeName === "style") {
            normalizeBackgroundImage(el);
          }
        } else if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              normalizeElementAndDescendants(node);
            }
          });
        }
      }
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href", "style"],
    });

    return () => obs.disconnect();
  }, []);
}

/* ===================== Router & Layout ===================== */

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function RootLayout() {
  useLiveAssetFix(); // 🔧 kritik: tüm görseller canlı düzeltilir
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
        fontFamily: "Segoe UI, sans-serif",
      }}
    >
      <h2 style={{ color: "#c0392b" }}>404 - Sayfa Bulunamadı</h2>
      <p>Aradığınız sayfa mevcut değil.</p>
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

        // ✅ /ara ve /search Results.jsx’i render ediyor
        { path: "ara", element: <Results /> },
        { path: "search", element: <Results /> },

        { path: "business/:slug", element: <BusinessProfile /> },
        { path: "isletme/:slug", element: <BusinessProfile /> },
        { path: "b/:slug", element: <BusinessProfile /> },
        { path: ":slug", element: <BusinessProfile /> },

        { path: "verify-email", element: <VerifyEmail /> },

        { path: "admin/login", element: <Login /> },
        { path: "admin/dashboard", element: <Dashboard /> },
        { path: "admin", element: <NotFound /> },

        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  {
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }
);

/* ===================== Mount ===================== */

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider
      router={router}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    />
  </React.StrictMode>
);
