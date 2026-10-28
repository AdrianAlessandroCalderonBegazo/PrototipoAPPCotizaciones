/**
 * Arranque de la API de referencia.
 *
 * Producción:  DATABASE_URL=postgres://… MAIN_API_URL=http://api:3000 UPLOAD_DIR=/data/fotos API_PREFIX=/api-caja npm start
 * Desarrollo:  AUTH_MODE=dev npm start   (Postgres en memoria con PGlite + migración aplicada; nada se guarda)
 *
 * MODO=fin → ICR Finanzas 2 (rutas /v2, MIGRACIONES_DIR=db/migrations-fin, CREAR_BASE=1 crea su base; AUTH_DATABASE_URL = base donde están los usuarios y sesiones).
 * Variables: PORT (8787), DATABASE_URL, MAIN_API_URL (la API de usuarios) | AUTH_MODE=dev, UPLOAD_DIR (./uploads), FINANZAS_ROLES… (ver permisos.ts),
 *   ERP_API_URL (si se define, cada ingreso/gasto real se refleja en el ERP; si no, no se refleja nada),
 *   CORS_ORIGIN (solo si la app vive en otro origen), API_PREFIX (p. ej. /api-caja).
 */
import { applyMigrations, asegurarBase, migrar, pgDb, pgliteDb } from "./db";
import { authDesdeEntorno } from "./auth";
import { diskStorage, memoryStorage } from "./storage";
import { espejoHttp, sinEspejo } from "./erp";
import { crearServicio } from "./service";
import { crearServidor, type LoginPrincipal } from "./server";
import { loginHttp } from "./login";
import { crearPermisos } from "./permisos";
import { crearFin } from "./fin";
import { sinNotificador, telegramNotificador } from "./telegram";

const env = process.env;
const dev = env.AUTH_MODE === "dev";
// MODO=fin: el servicio de ICR Finanzas 2 (rutas /v2, su propia base y sus propias migraciones). Por defecto, ICR Finanzas 1 (rutas /caja).
const modo = env.MODO === "fin" ? "fin" : "caja";
if (env.DATABASE_URL && env.CREAR_BASE === "1" && (await asegurarBase(env.DATABASE_URL))) console.log("Base de datos creada.");
const db = env.DATABASE_URL ? await pgDb(env.DATABASE_URL) : await pgliteDb();
if (!env.DATABASE_URL) {
  if (!dev) throw new Error("Define DATABASE_URL (o AUTH_MODE=dev para probar con una base en memoria).");
  await applyMigrations(db);
  console.log("Modo desarrollo: base en memoria, se pierde al apagar.");
} else {
  // Producción: las tablas nuevas se crean solas al arrancar (una sola vez cada migración).
  for (const m of await migrar(db, env.MIGRACIONES_DIR || undefined)) console.log(`Migración aplicada: ${m}`);
}
const permisos = crearPermisos(env);
const storage = dev && !env.UPLOAD_DIR ? memoryStorage() : diskStorage(env.UPLOAD_DIR ?? "./uploads");
const svc = crearServicio({ db, env, permisos, storage, mirror: env.ERP_API_URL ? espejoHttp(env.ERP_API_URL) : sinEspejo });
// ICR Finanzas 2: rutas /v2. TELEGRAM_BOT_TOKEN activa el aviso automático de reposición.
const fin = crearFin({ db, storage, env, notificar: env.TELEGRAM_BOT_TOKEN ? telegramNotificador(env.TELEGRAM_BOT_TOKEN) : sinNotificador });
// Las sesiones se validan en la base de la API principal (AUTH_DATABASE_URL); así cada versión puede tener su propia base de datos y los usuarios son los mismos.
const authDb = env.AUTH_DATABASE_URL ? await pgDb(env.AUTH_DATABASE_URL) : db;
// Los usuarios y las sesiones los maneja la API principal; esta API solo valida el token y pide el inicio de sesión allá.
const principal = (env.MAIN_API_URL ?? "").replace(/\/+$/, "");
const loginPrincipal: LoginPrincipal | undefined = principal ? loginHttp(principal) : undefined;
const port = Number(env.PORT ?? 8787);
crearServidor({ auth: authDesdeEntorno(env, authDb), svc, fin, modo, permisos, loginPrincipal, corsOrigin: env.CORS_ORIGIN ?? (dev ? "*" : ""), prefijo: env.API_PREFIX ?? "", loginDev: dev }).listen(port, () =>
  console.log(`API de ${modo === "fin" ? "Finanzas 2" : "caja"} escuchando en :${port}${env.ERP_API_URL ? ` · reflejando en ${env.ERP_API_URL}` : " · sin reflejo al ERP"}`),
);
