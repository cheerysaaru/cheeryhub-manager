import fs from "fs";
import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages has no server-side rewrites: it serves 404.html for unknown
// paths. Copying index.html there makes refresh on a deep link boot the SPA.
function spaFallback404(): Plugin {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const candidates = [
        path.resolve(process.cwd(), "dist"),
        path.resolve(process.cwd(), "frontend/dist"),
      ];
      for (const dir of candidates) {
        const indexFile = path.join(dir, "index.html");
        if (fs.existsSync(indexFile)) {
          fs.copyFileSync(indexFile, path.join(dir, "404.html"));
          return;
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "production") {
    const apiUrl =
      process.env.VITE_API_URL ?? loadEnv(mode, process.cwd(), "").VITE_API_URL;
    let parsedApiUrl: URL;
    try {
      parsedApiUrl = new URL(apiUrl);
    } catch {
      throw new Error(
        "Production builds require VITE_API_URL=https://api.cheeryhub.space/api.",
      );
    }
    if (
      parsedApiUrl.protocol !== "https:" ||
      parsedApiUrl.hostname !== "api.cheeryhub.space" ||
      parsedApiUrl.pathname.replace(/\/+$/, "") !== "/api"
    ) {
      throw new Error(
        "Production builds require VITE_API_URL=https://api.cheeryhub.space/api.",
      );
    }
  }

  return {
    plugins: [react(), tailwindcss(), spaFallback404()],
    // '/' for the custom domain cheeryhub.space (or any root deploy).
    // Set VITE_BASE=/cheeryhub-manager/ when publishing to
    // username.github.io/cheeryhub-manager so asset URLs resolve there.
    base: process.env.VITE_BASE || "/",
    build: {
      rollupOptions: {
        output: {
          // Split heavy dependencies out of the entry chunk so the shell can be
          // cached and re-downloaded independently of app code.
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("lucide-react")) return "vendor-lucide";
            if (
              id.includes("recharts") ||
              id.includes("victory") ||
              id.includes("d3-") ||
              id.includes("internmap") ||
              id.includes("delaunator") ||
              id.includes("robust-predicates")
            ) {
              return "vendor-charts";
            }
            if (id.includes("socket.io") || id.includes("engine.io"))
              return "vendor-socket";
            if (
              /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
                id,
              )
            ) {
              return "vendor-react";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      // The app imports a shared module outside frontend/ (../../shared), so
      // allow the dev server to serve files from the repo root too.
      fs: {
        allow: [path.resolve(process.cwd(), ".."), process.cwd()],
      },
      proxy: {
        // Point this at the wrangler dev server (default 8787). Override with
        // VITE_API_PROXY_TARGET=http://localhost:4000 if you run wrangler on a
        // different port (e.g. `wrangler dev --port 4000`).
        "/api": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8787",
          changeOrigin: true,
        },
        "/socket.io": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8787",
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
