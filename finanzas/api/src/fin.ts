/**
 * Reglas de negocio de ICR Finanzas 2 (libro único de movimientos sobre varias cuentas). Sin HTTP: recibe y devuelve
 * objetos, así se prueba directo y se puede portar tal cual al ERP. Convive con service.ts (versión 1) sobre la misma base.
 */
import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import { ApiError, type Usuario } from "./auth";
import type { Storage } from "./storage";
import { bad, fechaDe, importe, iso, texto, uuid, hoyLima } from "./service";
import { sinNotificador, type Notificador } from "./telegram";
import { r2, reposicion, validarMov } from "../../app2/src/lib/fin/calc";
import { textoReposicion } from "../../app2/src/lib/fin/reposicion";
import { ORIGENES, TIPOS_CUENTA, TIPOS_MOV, TIPOS_PERSONA, type Cuenta, type Mov } from "../../app2/src/lib/fin/types";

type Row = Record<string, any>;
const MIMES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTO = 10 * 1024 * 1024;

const cuentaDe = (r: Row) => ({
  id: r.id, nombre: r.nombre, tipo: r.tipo, titular: r.titular, referencia: r.referencia, saldo_inicial: r.saldo_inicial, saldo_base: r.saldo_base ?? r.saldo_inicial, umbral: r.umbral,
  aviso_whatsapp: r.aviso_whatsapp, aviso_telegram: r.aviso_telegram, activa: r.activa, orden: r.orden, updated_at: iso(r.updated_at),
});
const personaDe = (r: Row) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, alias: r.alias ?? [], menu_monto: r.menu_monto, activa: r.activa, updated_at: iso(r.updated_at) });
const COLS_CUENTA = `id, nombre, tipo, titular, referencia, saldo_inicial::float8 AS saldo_inicial, umbral::float8 AS umbral, aviso_whatsapp, aviso_telegram, activa, orden, updated_at`;
const COLS_MOV = `m.id, m.tipo, m.fecha::text AS fecha, m.hora, m.cuenta_id, m.destino_id, m.monto::float8 AS monto, m.categoria, m.subcategoria, m.concepto, m.pagado_a, m.pagado_a_id,
  m.nro_operacion, m.origen, m.creado, m.created_by, m.updated_at`;

const movDe = (r: Row, para: Row[], adjuntos: Row[]) => ({
  id: r.id, tipo: r.tipo, fecha: r.fecha, hora: r.hora, cuenta_id: r.cuenta_id, destino_id: r.destino_id ?? "", monto: r.monto, categoria: r.categoria, subcategoria: r.subcategoria, concepto: r.concepto,
  pagado_a: r.pagado_a, pagado_a_id: r.pagado_a_id ?? "", para: para.filter((p) => p.mov_id === r.id).map((p) => ({ persona_id: p.persona_id, monto: p.monto })),
  nro_operacion: r.nro_operacion, origen: r.origen, creado: iso(r.creado), creado_por: r.created_by ?? "", updated_at: iso(r.updated_at),
  adjuntos: adjuntos.filter((a) => a.mov_id === r.id).map((a) => ({ id: a.id, mime: a.mime, bytes: a.bytes, nombre: a.nombre ?? undefined, synced: true })),
});

export type DepsFin = { db: Db; storage: Storage; notificar?: Notificador; env?: NodeJS.ProcessEnv; hoy?: () => string };

export function crearFin({ db, storage, notificar = sinNotificador, env = {}, hoy = hoyLima }: DepsFin) {
  const quien = (u: Usuario) => u.nombre || u.email || u.id;
  // Quién puede crear o cambiar cuentas (y la libreta de proveedores): por defecto admin y finanzas (FIN_ROLES_CONFIG=admin,finanzas).
  const rolesConfig = ((env.FIN_ROLES_CONFIG ?? "").trim() ? env.FIN_ROLES_CONFIG! : "admin,finanzas").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  const puedeConfigurar = (u: Usuario) => (u.rol ?? "").toLowerCase() === "admin" || rolesConfig.includes((u.rol ?? "").toLowerCase());

  async function movsDe(q: Db, where: string, params: unknown[]) {
    const movs = await q.query<Row>(`SELECT ${COLS_MOV} FROM fin_mov m WHERE m.deleted_at IS NULL ${where} ORDER BY m.fecha, m.hora, m.creado, m.id`, params);
    if (!movs.length) return [];
    const ids = movs.map((m) => m.id);
    const para = await q.query<Row>(`SELECT mov_id, persona_id, monto::float8 AS monto FROM fin_mov_para WHERE mov_id = ANY($1::uuid[])`, [ids]);
    const adjuntos = await q.query<Row>(`SELECT id, mov_id, mime, bytes, nombre FROM fin_adjunto WHERE mov_id = ANY($1::uuid[])`, [ids]);
    return movs.map((m) => movDe(m, para, adjuntos));
  }

  /** Todos los movimientos de una cuenta (para calcular reposición con lo gastado desde la última entrada). */
  async function movsDeCuenta(cuentaId: string): Promise<Mov[]> {
    const l = await movsDe(db, `AND (m.cuenta_id = $1::uuid OR m.destino_id = $1::uuid)`, [cuentaId]);
    return l as unknown as Mov[];
  }

  /**
   * Revisa si la cuenta quedó bajo su umbral y avisa (Telegram) una sola vez por bajada: `aviso_activo` evita repetir el
   * mensaje en cada movimiento mientras siga baja, y se apaga cuando el saldo vuelve a estar sobre el umbral.
   * Un fallo al avisar no hace fallar el movimiento: queda sin marcar y se reintenta en el siguiente.
   */
  async function revisarAviso(cuentaId: string) {
    const [c] = await db.query<Row>(`SELECT ${COLS_CUENTA}, aviso_activo FROM fin_cuenta WHERE id = $1::uuid`, [cuentaId]);
    if (!c || !c.activa || !(c.umbral > 0)) return;
    const movs = await movsDeCuenta(cuentaId);
    const cuenta = cuentaDe({ ...c, saldo_base: c.saldo_inicial }) as unknown as Cuenta;
    const r = reposicion(cuenta, movs);
    if (!r.bajoUmbral) {
      if (c.aviso_activo) await db.query(`UPDATE fin_cuenta SET aviso_activo = false WHERE id = $1::uuid`, [cuentaId]);
      return;
    }
    if (c.aviso_activo) return;
    try {
      await notificar({ chat: c.aviso_telegram, nombre: c.nombre }, textoReposicion(cuenta, r, hoy()));
      await db.query(`UPDATE fin_cuenta SET aviso_activo = true WHERE id = $1::uuid`, [cuentaId]);
    } catch (e) {
      console.error(`No se pudo avisar la reposición de ${c.nombre}:`, e);
    }
  }

  return {
    // ---- lectura: una sola llamada trae todo lo que la app necesita ------------------------------
    /** Cuentas (con el saldo que traían al empezar `desde`), libreta, movimientos del rango y cuadres recientes. */
    async snapshot(q: Row) {
      const hasta = q.hasta ? fechaDe(q.hasta, "hasta") : hoy();
      const desde = q.desde ? fechaDe(q.desde, "desde") : hasta;
      if (desde > hasta) throw bad("desde no puede ser posterior a hasta.");
      const cuentas = await db.query<Row>(
        `SELECT c.id, c.nombre, c.tipo, c.titular, c.referencia, c.saldo_inicial::float8 AS saldo_inicial, c.umbral::float8 AS umbral, c.aviso_whatsapp, c.aviso_telegram, c.activa, c.orden, c.updated_at,
           (c.saldo_inicial + COALESCE((SELECT SUM(CASE
              WHEN m.tipo = 'INGRESO'  AND m.cuenta_id  = c.id THEN  m.monto
              WHEN m.tipo = 'EGRESO'   AND m.cuenta_id  = c.id THEN -m.monto
              WHEN m.tipo = 'TRASPASO' AND m.cuenta_id  = c.id THEN -m.monto
              WHEN m.tipo = 'TRASPASO' AND m.destino_id = c.id THEN  m.monto ELSE 0 END)
            FROM fin_mov m WHERE m.deleted_at IS NULL AND m.fecha < $1::date AND (m.cuenta_id = c.id OR m.destino_id = c.id)), 0))::float8 AS saldo_base
         FROM fin_cuenta c ORDER BY c.orden, c.nombre`,
        [desde],
      );
      const personas = await db.query<Row>(`SELECT id, nombre, tipo, alias, menu_monto::float8 AS menu_monto, activa, updated_at FROM fin_persona ORDER BY nombre`);
      const movs = await movsDe(db, `AND m.fecha BETWEEN $1::date AND $2::date`, [desde, hasta]);
      const cuadres = await db.query<Row>(
        `SELECT id, cuenta_id, fecha::text AS fecha, saldo_real::float8 AS saldo_real, saldo_sistema::float8 AS saldo_sistema, diferencia::float8 AS diferencia, nota, created_by, created_at
         FROM fin_cuadre WHERE fecha BETWEEN $1::date AND $2::date ORDER BY created_at`,
        [desde, hasta],
      );
      return {
        cuentas: cuentas.map(cuentaDe),
        personas: personas.map(personaDe),
        movs,
        cuadres: cuadres.map((c) => ({ id: c.id, cuenta_id: c.cuenta_id, fecha: c.fecha, saldo_real: c.saldo_real, saldo_sistema: c.saldo_sistema, diferencia: c.diferencia, nota: c.nota, creado_por: c.created_by ?? "", creado: iso(c.created_at) })),
      };
    },

    // ---- cuentas y libreta ---------------------------------------------------------------------
    async putCuenta(idIn: string, b: Row, u: Usuario) {
      if (!puedeConfigurar(u)) throw new ApiError(403, "SIN_PERMISO", "No tienes permiso para crear o cambiar cuentas.");
      const id = uuid(idIn, "id");
      const nombre = texto(b.nombre, 80);
      if (!nombre) throw bad("Escribe el nombre de la cuenta.");
      if (!TIPOS_CUENTA.includes(b.tipo)) throw bad(`tipo debe ser ${TIPOS_CUENTA.join(", ")}.`);
      const saldo = Number(b.saldo_inicial ?? 0);
      if (!Number.isFinite(saldo) || Math.abs(saldo) > 999_999_999) throw bad("saldo_inicial no es un importe válido.");
      const orden = Number.isInteger(b.orden) ? b.orden : 0;
      await db.query(
        `INSERT INTO fin_cuenta (id, nombre, tipo, titular, referencia, saldo_inicial, umbral, aviso_whatsapp, aviso_telegram, activa, orden, updated_by)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, titular = EXCLUDED.titular, referencia = EXCLUDED.referencia, saldo_inicial = EXCLUDED.saldo_inicial,
           umbral = EXCLUDED.umbral, aviso_whatsapp = EXCLUDED.aviso_whatsapp, aviso_telegram = EXCLUDED.aviso_telegram, activa = EXCLUDED.activa, orden = EXCLUDED.orden,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [id, nombre, b.tipo, texto(b.titular, 80), texto(b.referencia, 20), r2(saldo), importe(b.umbral, "umbral"), texto(b.aviso_whatsapp, 30), texto(b.aviso_telegram, 40), b.activa !== false, orden, quien(u)],
      );
      await revisarAviso(id); // cambiar el umbral o el saldo inicial puede dejarla bajo (o sobre) el umbral
      const [r] = await db.query<Row>(`SELECT ${COLS_CUENTA} FROM fin_cuenta WHERE id = $1::uuid`, [id]);
      return { cuenta: cuentaDe(r) };
    },

    async putPersona(idIn: string, b: Row, u: Usuario) {
      const id = uuid(idIn, "id");
      const nombre = texto(b.nombre, 120);
      if (!nombre) throw bad("Escribe el nombre.");
      if (!TIPOS_PERSONA.includes(b.tipo)) throw bad(`tipo debe ser ${TIPOS_PERSONA.join(", ")}.`);
      const alias = (Array.isArray(b.alias) ? b.alias : []).map((a: unknown) => texto(a, 120)).filter(Boolean).slice(0, 20);
      await db.query(
        `INSERT INTO fin_persona (id, nombre, tipo, alias, menu_monto, activa, updated_by) VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, alias = EXCLUDED.alias, menu_monto = EXCLUDED.menu_monto, activa = EXCLUDED.activa, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [id, nombre, b.tipo, JSON.stringify(alias), importe(b.menu_monto, "menu_monto"), b.activa !== false, quien(u)],
      );
      const [r] = await db.query<Row>(`SELECT id, nombre, tipo, alias, menu_monto::float8 AS menu_monto, activa, updated_at FROM fin_persona WHERE id = $1::uuid`, [id]);
      return { persona: personaDe(r) };
    },

    /** Mensaje de prueba al Telegram de una cuenta (para comprobar el bot y el chat al configurar). */
    async probarAviso(idIn: string, u: Usuario) {
      if (!puedeConfigurar(u)) throw new ApiError(403, "SIN_PERMISO", "No tienes permiso para esto.");
      const [c] = await db.query<Row>(`SELECT nombre, aviso_telegram FROM fin_cuenta WHERE id = $1::uuid`, [uuid(idIn, "id")]);
      if (!c) throw new ApiError(404, "CUENTA_NO_ENCONTRADA", "No existe esa cuenta.");
      if (!c.aviso_telegram) throw bad("Esta cuenta no tiene un chat de Telegram configurado.");
      try {
        await notificar({ chat: c.aviso_telegram, nombre: c.nombre }, `Mensaje de prueba de ICR Finanzas · ${c.nombre}. Si lo ves, las solicitudes de reposición llegarán aquí.`);
      } catch (e) {
        throw new ApiError(502, "TELEGRAM_FALLO", `No se pudo enviar el mensaje: ${(e as Error).message}`);
      }
      return { ok: true };
    },

    // ---- movimientos -----------------------------------------------------------------------------
    async putMov(idIn: string, b: Row, u: Usuario) {
      const id = uuid(idIn, "id");
      if (!TIPOS_MOV.includes(b.tipo)) throw bad(`tipo debe ser ${TIPOS_MOV.join(", ")}.`);
      const fecha = fechaDe(b.fecha);
      const hora = b.hora == null || b.hora === "" ? "" : String(b.hora);
      if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw bad("hora debe ser HH:MM.");
      const cuentaId = uuid(b.cuenta_id, "cuenta_id");
      const destinoId = b.tipo === "TRASPASO" ? uuid(b.destino_id, "destino_id") : null;
      const monto = importe(b.monto, "monto", { positivo: true });
      const para = (Array.isArray(b.para) ? b.para : []).map((p: Row) => ({ persona_id: uuid(p?.persona_id, "para.persona_id"), monto: importe(p?.monto, "para.monto", { positivo: true }) }));
      if (new Set(para.map((p: Row) => p.persona_id)).size !== para.length) throw bad("Una persona aparece dos veces en el reparto.");
      const m = { tipo: b.tipo, fecha, cuenta_id: cuentaId, destino_id: destinoId ?? "", monto, categoria: texto(b.categoria, 60), subcategoria: texto(b.subcategoria, 60), para };
      const ids = await db.query<Row>(`SELECT id FROM fin_cuenta`);
      const errores = validarMov(m, ids as unknown as Cuenta[]);
      const primero = Object.values(errores)[0];
      if (primero) throw bad(primero);
      const origen = ORIGENES.includes(b.origen) ? b.origen : "MANUAL";
      const nro = texto(b.nro_operacion, 40);
      const creado = b.creado && !isNaN(Date.parse(b.creado)) ? new Date(b.creado).toISOString() : new Date().toISOString();

      const antes = await db.query<Row>(`SELECT cuenta_id, destino_id, deleted_at FROM fin_mov WHERE id = $1::uuid`, [id]);
      if (antes[0]?.deleted_at) throw new ApiError(409, "MOV_ELIMINADO", "Este movimiento ya fue eliminado.");
      if (nro) {
        const [dup] = await db.query<Row>(`SELECT id FROM fin_mov WHERE cuenta_id = $1::uuid AND nro_operacion = $2 AND deleted_at IS NULL AND id <> $3::uuid`, [cuentaId, nro, id]);
        if (dup) throw new ApiError(409, "OPERACION_DUPLICADA", `La operación ${nro} ya está registrada en esta cuenta.`);
      }
      await db.tx(async (t) => {
        await t.query(
          `INSERT INTO fin_mov (id, tipo, fecha, hora, cuenta_id, destino_id, monto, categoria, subcategoria, concepto, pagado_a, pagado_a_id, nro_operacion, origen, creado, created_by, updated_by)
           VALUES ($1::uuid, $2, $3::date, $4, $5::uuid, $6::uuid, $7, $8, $9, $10, $11, $12::uuid, $13, $14, $15::timestamptz, $16, $16)
           ON CONFLICT (id) DO UPDATE SET tipo = EXCLUDED.tipo, fecha = EXCLUDED.fecha, hora = EXCLUDED.hora, cuenta_id = EXCLUDED.cuenta_id, destino_id = EXCLUDED.destino_id, monto = EXCLUDED.monto,
             categoria = EXCLUDED.categoria, subcategoria = EXCLUDED.subcategoria, concepto = EXCLUDED.concepto, pagado_a = EXCLUDED.pagado_a, pagado_a_id = EXCLUDED.pagado_a_id,
             nro_operacion = EXCLUDED.nro_operacion, origen = EXCLUDED.origen, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [id, b.tipo, fecha, hora, cuentaId, destinoId, monto, m.categoria, m.subcategoria, texto(b.concepto, 300), texto(b.pagado_a, 200), b.pagado_a_id ? uuid(b.pagado_a_id, "pagado_a_id") : null, nro, origen, creado, quien(u)],
        );
        await t.query(`DELETE FROM fin_mov_para WHERE mov_id = $1::uuid`, [id]);
        for (const p of para) await t.query(`INSERT INTO fin_mov_para (mov_id, persona_id, monto) VALUES ($1::uuid, $2::uuid, $3)`, [id, p.persona_id, p.monto]);
      });
      // los saldos de las cuentas tocadas (antes y ahora) pueden haber cruzado el umbral
      for (const cid of new Set([cuentaId, destinoId, antes[0]?.cuenta_id, antes[0]?.destino_id].filter(Boolean) as string[])) await revisarAviso(cid);
      const [mov] = await movsDe(db, `AND m.id = $1::uuid`, [id]);
      return { mov };
    },

    async deleteMov(idIn: string, _u: Usuario) {
      const id = uuid(idIn, "id");
      const [m] = await db.query<Row>(`SELECT cuenta_id, destino_id FROM fin_mov WHERE id = $1::uuid AND deleted_at IS NULL`, [id]);
      if (m) {
        await db.query(`UPDATE fin_mov SET deleted_at = now(), updated_at = now() WHERE id = $1::uuid`, [id]);
        for (const cid of new Set([m.cuenta_id, m.destino_id].filter(Boolean) as string[])) await revisarAviso(cid);
      }
      return { ok: true };
    },

    // ---- cuadre --------------------------------------------------------------------------------
    /** Registra el saldo real de una cuenta; el servidor pone el saldo de la app y la diferencia (idempotente por id). */
    async postCuadre(b: Row, u: Usuario) {
      const id = uuid(b.id, "id");
      const cuentaId = uuid(b.cuenta_id, "cuenta_id");
      const fecha = fechaDe(b.fecha);
      const real = Number(b.saldo_real);
      if (!Number.isFinite(real) || Math.abs(real) > 999_999_999) throw bad("saldo_real no es un importe válido.");
      const [s] = await db.query<Row>(`SELECT saldo::float8 AS saldo FROM v_fin_saldo WHERE cuenta_id = $1::uuid`, [cuentaId]);
      if (!s) throw new ApiError(404, "CUENTA_NO_ENCONTRADA", "No existe esa cuenta.");
      const sistema = r2(s.saldo);
      await db.query(
        `INSERT INTO fin_cuadre (id, cuenta_id, fecha, saldo_real, saldo_sistema, diferencia, nota, created_by) VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
        [id, cuentaId, fecha, r2(real), sistema, r2(real - sistema), texto(b.nota, 300), quien(u)],
      );
      const [c] = await db.query<Row>(`SELECT id, cuenta_id, fecha::text AS fecha, saldo_real::float8 AS saldo_real, saldo_sistema::float8 AS saldo_sistema, diferencia::float8 AS diferencia, nota, created_by, created_at FROM fin_cuadre WHERE id = $1::uuid`, [id]);
      return { cuadre: { id: c.id, cuenta_id: c.cuenta_id, fecha: c.fecha, saldo_real: c.saldo_real, saldo_sistema: c.saldo_sistema, diferencia: c.diferencia, nota: c.nota, creado_por: c.created_by ?? "", creado: iso(c.created_at) } };
    },

    // ---- fotos de comprobantes ---------------------------------------------------------------------
    async putAdjunto(idIn: string, q: Row, mime: string, bytes: Buffer, u: Usuario) {
      const id = uuid(idIn, "id");
      const movId = uuid(q.mov_id, "mov_id");
      const tipo = mime.split(";")[0].trim().toLowerCase();
      if (!MIMES.includes(tipo)) throw new ApiError(415, "TIPO_NO_PERMITIDO", "Solo se aceptan fotos JPG, PNG o WebP.");
      if (!bytes.length) throw bad("La foto está vacía.");
      if (bytes.length > MAX_FOTO) throw new ApiError(413, "FOTO_MUY_GRANDE", "La foto pesa más de 10 MB.");
      const [dueno] = await db.query<Row>(`SELECT 1 AS x FROM fin_mov WHERE id = $1::uuid AND deleted_at IS NULL`, [movId]);
      if (!dueno) throw new ApiError(404, "DUENO_NO_ENCONTRADO", "El movimiento al que pertenece la foto no existe.");
      const [ya] = await db.query<Row>(`SELECT 1 AS x FROM fin_adjunto WHERE id = $1::uuid`, [id]);
      if (!ya) {
        await storage.put(id, bytes);
        await db.query(`INSERT INTO fin_adjunto (id, mov_id, archivo, mime, bytes, nombre, created_by) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`, [id, movId, id, tipo, bytes.length, texto(q.nombre, 120) || null, quien(u)]);
      }
      return { adjunto: { id, mime: tipo, bytes: bytes.length, synced: true } };
    },
    async getAdjunto(idIn: string) {
      const id = uuid(idIn, "id");
      const [a] = await db.query<Row>(`SELECT archivo, mime FROM fin_adjunto WHERE id = $1::uuid`, [id]);
      const bytes = a ? await storage.get(a.archivo) : null;
      if (!a || !bytes) throw new ApiError(404, "ADJUNTO_NO_ENCONTRADO", "No existe esa foto.");
      return { mime: a.mime as string, bytes };
    },
    async deleteAdjunto(idIn: string) {
      const id = uuid(idIn, "id");
      const [a] = await db.query<Row>(`SELECT archivo FROM fin_adjunto WHERE id = $1::uuid`, [id]);
      if (a) {
        await db.query(`DELETE FROM fin_adjunto WHERE id = $1::uuid`, [id]);
        await storage.del(a.archivo);
      }
      return { ok: true };
    },

    nuevoId: () => randomUUID(),
  };
}

export type Fin = ReturnType<typeof crearFin>;
