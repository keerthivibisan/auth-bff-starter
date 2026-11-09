import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const bffTarget = env.VITE_BFF_BASE_URL || "http://localhost:3001";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Keeps the SPA and BFF same-origin in dev so the session cookie
        // (and its SameSite policy) behaves exactly as it will in
        // production, where the BFF is expected to serve the SPA directly.
        "/api": {
          target: bffTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
