// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact,
// tailwindcss, tsConfigPaths, nitro, componentTagger, etc. Do NOT add them manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "html", networkTimeoutSeconds: 5 },
            },
            {
              urlPattern: /\.(?:js|css|woff2)$/,
              handler: "CacheFirst",
              options: { cacheName: "static-assets", expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
            {
              urlPattern: /supabase\.co\/rest\/v1\//,
              handler: "NetworkFirst",
              options: { cacheName: "supabase-rest", networkTimeoutSeconds: 5, expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 } },
            },
          ],
        },
      }),
    ],
  },
});
