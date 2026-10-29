import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /api y /uploads van a la API principal local (cd servidor/api && npm run dev).
// En el VPS los sirve Caddy desde el mismo dominio (erp.TUDOMINIO), sin CORS.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 }, // exceljs (solo al exportar) va en su propio archivo
  server: {
    proxy: {
      // /api-caja primero: si no, "/api" también lo atraparía (aquí las claves son prefijos).
      "/api-caja": process.env.CAJA_URL ?? "http://localhost:8787",
      "/api": process.env.API_URL ?? "http://localhost:3000",
      "/uploads": process.env.API_URL ?? "http://localhost:3000",
    },
  },
});
