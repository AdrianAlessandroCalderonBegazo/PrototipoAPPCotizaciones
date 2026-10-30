/**
 * HTTP de la API de referencia (node:http, sin frameworks). Mismo formato de respuesta que el ERP:
 *   éxito:  { "status": "success", "data": … }
 *   error:  { "status": "error", "error": { "code": "…", "message": "…" } }
 * Las rutas están documentadas en docs/API.md.
 */
import http from "node:http";
import { ApiError, type Auth, type Usuario } from "./auth";
import type { Servicio } from "./service";
import type { Fin } from "./fin";
import { crearPermisos, type Permisos } from "./permisos";

type Ctx = { user: Usuario; params: Record<string, string>; query: Record<string, string>; body: any; raw: Buffer; contentType: string };
type Handler = (c: Ctx) => Promise<unknown>;
type Respuesta = { __binario: true; mime: string; bytes: Buffer };

const MAX_JSON = 1024 * 1024;
const MAX_BINARIO = 11 * 1024 * 1024;

/** Inicio de sesión contra la API principal (la que maneja los usuarios): devuelve el token y los datos de la persona. */
export type LoginPrincipal = {
  entrar(usuario: string, clave: string, ip?: string): Promise<{ token: string; usuario: { usuario: string; nombre: string; rol: string; niveles?: Record<string, string> } }>;
  salir(token: string): Promise<void>;
};

export function crearServidor(opts: { auth: Auth; svc: Servicio; fin?: Fin; modo?: "caja" | "fin"; permisos?: Permisos; loginPrincipal?: LoginPrincipal; corsOrigin?: string; prefijo?: string; loginDev?: boolean }) {
  const { auth, svc, fin, modo = "caja", loginPrincipal, corsOrigin = "", prefijo = "", loginDev = false } = opts;
  const permisos = opts.permisos ?? crearPermisos({});
  const rutas: { metodo: string; patron: RegExp; claves: string[]; binario?: boolean; h: Handler }[] = [];
  const ruta = (metodo: string, path: string, h: Handler, binario = false) => {
    const claves: string[] = [];
    const patron = new RegExp("^" + path.replace(/:([a-z_]+)/g, (_, k) => (claves.push(k), "([^/]+)")) + "/?$");
    rutas.push({ metodo, patron, claves, binario, h });
  };

  ruta("GET", "/caja/permisos", async (c) => svc.permisos(c.user), false);
  ruta("GET", "/caja/version", () => svc.version());
  ruta("GET", "/caja/estado", (c) => svc.estado(c.query.ciudad));
  ruta("PUT", "/caja/config/:ciudad", (c) => svc.putConfig(c.params.ciudad, c.body, c.user));
  ruta("POST", "/caja/hojas/abrir", (c) => svc.abrirHoja(c.body, c.user));
  ruta("GET", "/caja/hojas", (c) => svc.hojas(c.query));
  ruta("PATCH", "/caja/hojas/:id", (c) => svc.patchHoja(c.params.id, c.body, c.user));
  ruta("POST", "/caja/hojas/:id/cerrar", (c) => svc.cerrarHoja(c.params.id, c.body, c.user));
  ruta("POST", "/caja/hojas/:id/reabrir", (c) => svc.reabrirHoja(c.params.id, c.body, c.user));
  ruta("GET", "/caja/auditoria", (c) => svc.auditoria(c.query, c.user));
  ruta("GET", "/caja/alertas", (c) => svc.alertas(c.query, c.user));
  ruta("GET", "/caja/resumen", (c) => svc.resumen(c.user));
  ruta("PUT", "/caja/filas/:id", (c) => svc.putFila(c.params.id, c.body, c.user));
  ruta("DELETE", "/caja/filas/:id", (c) => svc.deleteFila(c.params.id, c.user));
  ruta("POST", "/caja/transferencias", (c) => svc.crearTransferencia(c.body, c.user));
  ruta("DELETE", "/caja/transferencias/:id", (c) => svc.anularTransferencia(c.params.id, c.user));
  ruta("PUT", "/caja/adjuntos/:id", (c) => svc.putAdjunto(c.params.id, c.query, c.contentType, c.raw, c.user), true);
  ruta("GET", "/caja/adjuntos/:id", async (c) => ({ __binario: true, ...(await svc.getAdjunto(c.params.id)) }) as Respuesta);
  ruta("DELETE", "/caja/adjuntos/:id", (c) => svc.deleteAdjunto(c.params.id, c.user));
  ruta("GET", "/caja/proyectos", () => svc.proyectosActivos());
  ruta("GET", "/caja-chica/movimientos", (c) => svc.movimientosChica(c.query));
  ruta("PUT", "/caja-chica/movimientos/:id", (c) => svc.putMovChica(c.params.id, c.body, c.user));
  ruta("DELETE", "/caja-chica/movimientos/:id", (c) => svc.deleteMovChica(c.params.id, c.user));
  ruta("POST", "/caja/erp/reintentar", (c) => svc.reintentarErp(c.user));

  // ICR Finanzas 2 (docs/API-V2.md): rutas /v2 sobre sus propias tablas (fin_*). En modo "fin" (el servicio de la versión 2)
  // solo existen estas; en modo "caja" (versión 1) no.
  if (modo === "fin") rutas.length = 0;
  if (fin && modo === "fin") {
    ruta("GET", "/v2/snapshot", (c) => fin.snapshot(c.query));
    ruta("PUT", "/v2/cuentas/:id", (c) => fin.putCuenta(c.params.id, c.body, c.user));
    ruta("POST", "/v2/cuentas/:id/aviso-prueba", (c) => fin.probarAviso(c.params.id, c.user));
    ruta("PUT", "/v2/personas/:id", (c) => fin.putPersona(c.params.id, c.body, c.user));
    ruta("PUT", "/v2/mov/:id", (c) => fin.putMov(c.params.id, c.body, c.user));
    ruta("DELETE", "/v2/mov/:id", (c) => fin.deleteMov(c.params.id, c.user));
    ruta("POST", "/v2/cuadres", (c) => fin.postCuadre(c.body, c.user));
    ruta("PUT", "/v2/adjuntos/:id", (c) => fin.putAdjunto(c.params.id, c.query, c.contentType, c.raw, c.user), true);
    ruta("GET", "/v2/adjuntos/:id", async (c) => ({ __binario: true, ...(await fin.getAdjunto(c.params.id)) }) as Respuesta);
    ruta("DELETE", "/v2/adjuntos/:id", (c) => fin.deleteAdjunto(c.params.id));
  }

  const leer = (req: http.IncomingMessage, max: number) =>
    new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = [];
      let n = 0;
      req.on("data", (d: Buffer) => {
        n += d.length;
        if (n > max) {
          reject(new ApiError(413, "CUERPO_MUY_GRANDE", "El envío es demasiado grande."));
          req.destroy();
        } else partes.push(d);
      });
      req.on("end", () => resolve(Buffer.concat(partes)));
      req.on("error", reject);
    });

  return http.createServer(async (req, res) => {
    const cors: Record<string, string> = corsOrigin
      ? { "Access-Control-Allow-Origin": corsOrigin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", Vary: "Origin" }
      : {};
    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...cors });
      res.end(JSON.stringify(payload));
    };
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return void res.end();
      }
      const url = new URL(req.url ?? "/", "http://x");
      let path = url.pathname;
      if (prefijo && path.startsWith(prefijo)) path = path.slice(prefijo.length) || "/";
      if (path === "/health") return json(200, { status: "success", data: { ok: true } });

      // Solo desarrollo (AUTH_MODE=dev): el ERP real es quien inicia sesión en producción.
      if (loginDev && req.method === "POST" && path === "/auth/login") {
        const c = JSON.parse((await leer(req, MAX_JSON)).toString("utf8") || "{}");
        const usuario = String(c.usuario ?? c.email ?? "");
        if (!usuario || !(c.clave ?? c.password)) throw new ApiError(400, "DATOS_INVALIDOS", "Ingresa tu usuario y tu clave.");
        const nombre = usuario.split("@")[0];
        return json(200, { status: "success", data: { token: `dev:${nombre}:admin`, user: { nombre_completo: nombre, email: usuario, rol_codigo: "admin" }, permisos: permisos.de({ rol: "admin" }) } });
      }

      // Inicio de sesión: la app de Finanzas entra con el mismo usuario y clave del resto de la plataforma.
      if (loginPrincipal && req.method === "POST" && path === "/auth/login") {
        const cuerpo = JSON.parse((await leer(req, MAX_JSON)).toString("utf8") || "{}");
        const usuario = String(cuerpo.usuario ?? cuerpo.email ?? "").trim();
        const clave = String(cuerpo.clave ?? cuerpo.password ?? "");
        if (!usuario || !clave) throw new ApiError(400, "DATOS_INVALIDOS", "Ingresa tu usuario y tu clave.");
        // La IP de quien entra (la pone Caddy): así la API principal limita los intentos fallidos por persona y no bloquea a todos.
        const ip = String(req.headers["x-forwarded-for"] ?? "").split(",").pop()?.trim() || req.socket.remoteAddress || undefined;
        const r = await loginPrincipal.entrar(usuario, clave, ip);
        const quien = { rol: r.usuario.rol, nivelCaja: r.usuario.niveles?.caja_chica as Usuario["nivelCaja"] };
        if (!permisos.acceso(quien)) {
          await loginPrincipal.salir(r.token).catch(() => {});
          throw new ApiError(403, "SIN_ACCESO", "Tu rol no tiene acceso a Finanzas. Pídele acceso al administrador.");
        }
        return json(200, { status: "success", data: { token: r.token, user: { nombre_completo: r.usuario.nombre, email: r.usuario.usuario, rol_codigo: r.usuario.rol }, permisos: permisos.de(quien) } });
      }

      const r = rutas.find((x) => x.metodo === req.method && x.patron.test(path));
      if (!r) throw new ApiError(404, "RUTA_NO_ENCONTRADA", "No existe esa ruta.");
      const user = await auth(req.headers.authorization);
      if (path !== "/caja/permisos" && !permisos.acceso(user)) throw new ApiError(403, "SIN_ACCESO", "Tu rol no tiene acceso a Finanzas. Pídele acceso al administrador.");
      // Con acceso de solo lectura se ve todo, pero no se registra ni se cambia nada.
      if (req.method !== "GET" && !permisos.escribir(user)) throw new ApiError(403, "SIN_PERMISO", "Tu rol solo puede ver Finanzas: no puede registrar ni cambiar nada.");
      const m = r.patron.exec(path)!;
      const params = Object.fromEntries(r.claves.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const raw = ["POST", "PUT", "PATCH"].includes(req.method!) ? await leer(req, r.binario ? MAX_BINARIO : MAX_JSON) : Buffer.alloc(0);
      let body: any = {};
      if (!r.binario && raw.length) {
        try {
          body = JSON.parse(raw.toString("utf8"));
        } catch {
          throw new ApiError(400, "JSON_INVALIDO", "El cuerpo no es un JSON válido.");
        }
      }
      const out = await r.h({ user, params, query: Object.fromEntries(url.searchParams), body, raw, contentType: String(req.headers["content-type"] ?? "") });
      if (out && (out as Respuesta).__binario) {
        const f = out as Respuesta;
        res.writeHead(200, { "Content-Type": f.mime, "Cache-Control": "private, max-age=31536000, immutable", ...cors });
        return void res.end(f.bytes);
      }
      json(200, { status: "success", data: out });
    } catch (e) {
      if (e instanceof ApiError) return json(e.status, { status: "error", error: { code: e.code, message: e.message } });
      console.error(e);
      json(500, { status: "error", error: { code: "ERROR_INTERNO", message: "Ocurrió un error inesperado." } });
    }
  });
}
