import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /api y /uploads van a la API principal local (cd servidor/api && npm run dev).
// En el VPS los sirve Caddy desde el mismo dominio (erp.TUDOMINIO), sin CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.API_URL ?? "http://localhost:3000",
      "/uploads": process.env.API_URL ?? "http://localhost:3000",
    },
  },
});
