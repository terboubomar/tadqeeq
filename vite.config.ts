// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Publishable (public) backend values used as a build-time fallback when the
// build environment does not inject VITE_* variables. Safe to ship to browsers.
const FALLBACK_SUPABASE_URL = "https://xzquhubqlncvozioxtmk.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QcOgdjo-a9k93ILYis-v9w_227XiHDh";

const supabaseUrl = process.env["VITE_SUPABASE_URL"] || FALLBACK_SUPABASE_URL;
const supabaseKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      // Keep every renderer and router import on the same React/context instance.
      // This is explicit because stale Vite optimizer graphs can otherwise retain
      // a second copy after TanStack package upgrades.
      dedupe: ["react", "react-dom", "@tanstack/react-router"],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-router",
      ],
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
    },
  },
});
