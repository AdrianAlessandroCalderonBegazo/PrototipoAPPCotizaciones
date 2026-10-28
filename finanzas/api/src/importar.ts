/**
 * Importa a la caja las hojas «CAJA DIARIO» transcritas (carpeta con datos.json e imagenes/recibos/).
 *
 * Qué hace, todo en una sola transacción (si algo falla no se cambia nada):
 *   1. Borra TODO lo anterior de caja diaria y caja chica: hojas, filas, envíos, gastos, fotos e historial de cambios,
 *      y pone en 0 los saldos iniciales (menos el de caja en efectivo de Arequipa, que arranca con el «saldo anterior»
 *      del primer día de la hoja).
 *   2. Crea una hoja por día con sus movimientos y adjunta la foto del recibo/voucher a su movimiento.
 *   3. Comprueba que el saldo de cada día coincide con el «saldo anterior» anotado en el papel.
 *   4. Cierra cada día con el efectivo que decía la hoja (o el calculado si no lo anotaron) y deja todo en el historial de cambios.
 *
 * Los movimientos no traen categoría ni si son internos (depósitos al banco); eso se decide en CLASIFICACION, por movimiento.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "./db";
import type { Storage } from "./storage";
import { CATS, SUBCATS } from "../../app/src/lib/data";
import { COMPROBANTES } from "../../app/src/lib/caja/types";

type Mov = {
  movimiento_id: string; fecha: string; orden: number; tipo: string; descripcion: string; responsable: string; ciudad: string;
  ingreso_efectivo: string; ingreso_yape_transf: string; salida_efectivo: string; salida_yape_transf: string; cta_cte_ingreso: string; cta_cte_salida: string;
  observacion: string; recibo?: { recibo_id: string; tipo: string; imagen_recibo: string; numero_documento?: string; monto: string } | null;
};
type Caja = { caja_id: string; fecha: string; responsable_caja: string; saldo_anterior: string; total_efectivo_escrito: string; total_efectivo_calculado: string; movimientos: Mov[] };
export type Datos = { cajas: Caja[] };

type Clase = { categoria?: (typeof CATS)[number]; subcategoria?: string; interno?: boolean; tipo?: "VTA" | "OBRA" | "OTRO"; comprobante?: (typeof COMPROBANTES)[number] };

/** Lo que la hoja de papel no dice: categoría del gasto, depósitos (movimientos internos) y tipo de cada línea. Revisable en la app. */
export const CLASIFICACION: Record<string, Clase> = {
  "CD-2026-10-01-01": { interno: true }, "CD-2026-10-01-03": { interno: true }, "CD-2026-10-19-01": { interno: true },
  "CD-2026-10-20-02": { interno: true }, "CD-2026-10-21-01": { interno: true }, "CD-2026-10-23-07": { interno: true },
  "CD-2026-10-01-02": { tipo: "VTA" }, "CD-2026-10-12-01": { tipo: "VTA" }, "CD-2026-10-14-01": { tipo: "VTA" }, "CD-2026-10-15-01": { tipo: "VTA" },
  "CD-2026-10-20-01": { tipo: "VTA" }, "CD-2026-10-20-03": { tipo: "VTA" }, "CD-2026-10-21-02": { tipo: "VTA" },
  "CD-2026-10-23-01": { tipo: "VTA" }, "CD-2026-10-23-02": { tipo: "VTA" }, "CD-2026-10-27-01": { tipo: "VTA" }, "CD-2026-10-27-02": { tipo: "VTA" },
  "CD-2026-10-16-01": { categoria: "Gastos fijos", subcategoria: "Alquiler" },
  "CD-2026-10-16-02": { categoria: "Caja chica" }, "CD-2026-10-21-04": { categoria: "Caja chica" }, "CD-2026-10-23-06": { categoria: "Caja chica" },
  "CD-2026-10-22-04": { categoria: "Caja chica" }, "CD-2026-10-23-03": { categoria: "Caja chica" }, "CD-2026-10-23-09": { categoria: "Caja chica" },
  "CD-2026-10-19-02": { categoria: "Material" }, "CD-2026-10-19-03": { categoria: "Material" }, "CD-2026-10-19-04": { categoria: "Material" },
  "CD-2026-10-20-06": { categoria: "Material" }, "CD-2026-10-22-01": { categoria: "Material" }, "CD-2026-10-22-02": { categoria: "Material" }, "CD-2026-10-27-03": { categoria: "Material" },
  "CD-2026-10-20-04": { categoria: "Proveedores" }, "CD-2026-10-20-05": { categoria: "Proveedores" },
  "CD-2026-10-20-07": { categoria: "Equipos" },
  "CD-2026-10-21-03": { categoria: "Oficina" }, "CD-2026-10-23-04": { categoria: "Oficina" },
  "CD-2026-10-22-03": { categoria: "Viáticos" }, "CD-2026-10-23-05": { categoria: "Viáticos" },
  "CD-2026-10-23-08": { categoria: "Movilidad" },
};

const num = (v: unknown) => Math.round((Number(v ?? 0) || 0) * 100) / 100;
/** UUID estable a partir de un texto: volver a importar produce los mismos ids. */
const uuidDe = (s: string) => {
  const h = createHash("sha1").update("icr-finanzas-import:" + s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const COMPROBANTE_DE_RECIBO: Record<string, (typeof COMPROBANTES)[number]> = { FACTURA_ELECTRONICA: "FACTURA", DEPOSITO_BANCARIO: "RECIBO", VOUCHER_POS: "RECIBO" };

export type Informe = {
  dias: { fecha: string; filas: number; fotos: number; saldoAnterior: number; saldoFinal: number; contado: number; diferencia: number }[];
  filas: number; fotos: number; borrado: { hojas: number; filas: number; chica: number; fotos: number };
};

export async function importarCaja(o: { db: Db; storage: Storage; carpeta: string; confirmar: boolean; log?: (s: string) => void }): Promise<Informe> {
  const { db, storage, carpeta, confirmar } = o;
  const log = o.log ?? (() => {});
  const datos: Datos = JSON.parse(await fs.readFile(path.join(carpeta, "datos.json"), "utf8"));
  const cajas = [...datos.cajas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!cajas.length) throw new Error("datos.json no trae ninguna hoja.");
  if (new Set(cajas.map((c) => c.fecha)).size !== cajas.length) throw new Error("Hay dos hojas con la misma fecha.");

  // ---- 1. leer y validar todo ANTES de tocar la base -----------------------------------------------
  type Fila = { id: string; hojaFecha: string; ciudad: string; orden: number; tipo: string; descripcion: string; responsable: string; comprobante: string; ie: number; it: number; se: number; st: number; ci: number; cs: number; categoria: string | null; subcategoria: string | null; interno: boolean; obs: string; movId: string };
  type Foto = { id: string; filaId: string; bytes: Buffer; nombre: string; fecha: string; ciudad: string };
  const filas: Fila[] = [];
  const fotos: Foto[] = [];
  for (const c of cajas) {
    for (const m of [...c.movimientos].sort((a, b) => a.orden - b.orden)) {
      const k = CLASIFICACION[m.movimiento_id] ?? {};
      const ie = num(m.ingreso_efectivo), it = num(m.ingreso_yape_transf), se = num(m.salida_efectivo), st = num(m.salida_yape_transf), ci = num(m.cta_cte_ingreso), cs = num(m.cta_cte_salida);
      if (ie + it + se + st + ci + cs <= 0) throw new Error(`${m.movimiento_id}: no tiene ningún importe.`);
      const salidaReal = !k.interno && se + st + cs > 0;
      if (salidaReal && !k.categoria) throw new Error(`${m.movimiento_id} («${m.descripcion}»): es un gasto y falta su categoría en CLASIFICACION.`);
      if (k.categoria && !(CATS as readonly string[]).includes(k.categoria)) throw new Error(`${m.movimiento_id}: categoría «${k.categoria}» no válida.`);
      if (k.subcategoria && !(SUBCATS["Gastos fijos"] as readonly string[]).includes(k.subcategoria)) throw new Error(`${m.movimiento_id}: subcategoría no válida.`);
      const id = uuidDe(m.movimiento_id);
      const comprobante = k.comprobante ?? (m.recibo ? COMPROBANTE_DE_RECIBO[m.recibo.tipo] ?? "RECIBO" : "NINGUNO");
      filas.push({
        id, hojaFecha: c.fecha, ciudad: m.ciudad || "AQP", orden: m.orden, tipo: k.tipo ?? (m.tipo || "OTRO"), descripcion: m.descripcion.trim(), responsable: (m.responsable || "").trim(), comprobante,
        ie, it, se, st, ci, cs, categoria: salidaReal ? k.categoria! : null, subcategoria: salidaReal && k.subcategoria ? k.subcategoria : null, interno: !!k.interno, obs: (m.observacion || "").trim(), movId: m.movimiento_id,
      });
      if (m.recibo?.imagen_recibo) {
        const bytes = await fs.readFile(path.join(carpeta, m.recibo.imagen_recibo)).catch(() => {
          throw new Error(`${m.movimiento_id}: no encuentro la imagen ${m.recibo!.imagen_recibo}.`);
        });
        fotos.push({ id: uuidDe(m.recibo.recibo_id), filaId: id, bytes, nombre: `${m.recibo.recibo_id}.jpg`, fecha: c.fecha, ciudad: m.ciudad || "AQP" });
      }
    }
  }
  const saldoInicial = num(cajas[0].saldo_anterior);

  // ---- 2. fotos nuevas al almacenamiento (los ids son fijos; si algo falla después sobran archivos inocuos) ------
  const viejos = (await db.query<{ archivo: string }>(`SELECT archivo FROM caja_adjunto`)).map((r) => r.archivo);
  if (confirmar) for (const f of fotos) await storage.put(f.id, f.bytes);

  // ---- 3. la base, todo o nada ----------------------------------------------------------------------
  const informe: Informe = { dias: [], filas: filas.length, fotos: fotos.length, borrado: { hojas: 0, filas: 0, chica: 0, fotos: viejos.length } };
  const ROLLBACK = new Error("simulacro");
  try {
    await db.tx(async (t) => {
      const q = async (sql: string, p: unknown[] = []) => t.query<Record<string, any>>(sql, p);
      const cuenta = async (tabla: string) => Number((await q(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n);
      informe.borrado.hojas = await cuenta("caja_hoja");
      informe.borrado.filas = await cuenta("caja_fila");
      informe.borrado.chica = await cuenta("caja_chica_mov");
      await q(`DELETE FROM caja_adjunto`);
      await q(`DELETE FROM caja_fila`);
      await q(`DELETE FROM caja_chica_mov`);
      await q(`DELETE FROM caja_transferencia`);
      await q(`DELETE FROM caja_hoja`);
      await q(`DELETE FROM caja_auditoria`);
      await q(`UPDATE caja_config SET saldo_inicial_caja = 0, saldo_inicial_cta_cte = 0, saldo_inicial_caja_chica = 0, updated_by = 'importación', updated_at = now()`);
      const ciudadBase = filas[0].ciudad;
      await q(`UPDATE caja_config SET saldo_inicial_caja = $2 WHERE ciudad = $1`, [ciudadBase, saldoInicial]);
      await q(`INSERT INTO caja_auditoria (usuario, rol, accion, entidad, ciudad, despues, motivo) VALUES ('Importación', 'sistema', 'config', 'config', $1, $2::jsonb, $3)`,
        [ciudadBase, JSON.stringify({ saldo_inicial_caja: saldoInicial, saldo_inicial_cta_cte: 0, saldo_inicial_caja_chica: 0 }), "Saldos iniciales al importar las hojas de papel de octubre"]);

      for (const c of cajas) {
        const ciudad = c.movimientos[0]?.ciudad || "AQP";
        const hojaId = uuidDe("hoja:" + ciudad + c.fecha);
        await q(`INSERT INTO caja_hoja (id, ciudad, fecha, responsable_caja, created_by, updated_by) VALUES ($1::uuid, $2, $3::date, $4, 'importación', 'importación')`, [hojaId, ciudad, c.fecha, (c.responsable_caja || "").trim()]);
        for (const f of filas.filter((x) => x.hojaFecha === c.fecha)) {
          await q(
            `INSERT INTO caja_fila (id, hoja_id, orden, tipo, descripcion, responsable, comprobante, caja_ingreso_efectivo, caja_ingreso_transf, caja_salida_efectivo, caja_salida_transf,
                                    cta_cte_ingreso, cta_cte_salida, categoria, subcategoria, interno, created_by, updated_by)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'importación', 'importación')`,
            [f.id, hojaId, f.orden, f.tipo, f.descripcion, f.responsable, f.comprobante, f.ie, f.it, f.se, f.st, f.ci, f.cs, f.categoria, f.subcategoria, f.interno],
          );
          await q(`INSERT INTO caja_auditoria (usuario, rol, accion, entidad, entidad_id, ciudad, fecha_dia, despues, motivo) VALUES ('Importación', 'sistema', 'crear', 'fila', $1, $2, $3::date, $4::jsonb, $5)`,
            [f.id, ciudad, c.fecha, JSON.stringify({ descripcion: f.descripcion, responsable: f.responsable, comprobante: f.comprobante, caja_ingreso_efectivo: f.ie, caja_ingreso_transf: f.it, caja_salida_efectivo: f.se, caja_salida_transf: f.st, categoria: f.categoria }),
             `Importado de la hoja de papel del ${c.fecha}${f.obs ? ` · observación: ${f.obs}` : ""}`]);
        }
        for (const ft of fotos.filter((x) => x.fecha === c.fecha)) {
          await q(`INSERT INTO caja_adjunto (id, fila_id, archivo, mime, bytes, nombre, created_by) VALUES ($1::uuid, $2::uuid, $1, 'image/jpeg', $3, $4, 'importación')`, [ft.id, ft.filaId, ft.bytes.length, ft.nombre]);
        }
      }

      // ---- comprobación contra el papel y cierre de cada día ----
      for (const c of cajas) {
        const ciudad = c.movimientos[0]?.ciudad || "AQP";
        const [r] = await q(`SELECT r.id, r.saldo_anterior_caja::float8 AS ant, r.saldo_final_caja::float8 AS fin FROM v_caja_hoja_resumen r WHERE r.ciudad = $1 AND r.fecha = $2::date`, [ciudad, c.fecha]);
        if (Math.abs(r.ant - num(c.saldo_anterior)) > 0.005) throw new Error(`El ${c.fecha} el saldo anterior calculado (${r.ant}) no coincide con el de la hoja (${c.saldo_anterior}). No se cambió nada.`);
        const escrito = c.total_efectivo_escrito === "" || c.total_efectivo_escrito == null ? null : num(c.total_efectivo_escrito);
        const contado = escrito ?? r.fin;
        const dif = Math.round((contado - r.fin) * 100) / 100;
        const nota = escrito === null ? "La hoja de papel no tenía anotado el total; se usó el saldo calculado." : dif !== 0 ? `La hoja de papel decía ${contado.toFixed(2)} y el sistema calcula ${r.fin.toFixed(2)}.` : "";
        await q(`UPDATE caja_hoja SET cerrada_en = now(), cerrada_por = 'Importación (hoja de papel)', efectivo_contado = $2, saldo_calculado = $3, diferencia = $4, nota_cierre = $5 WHERE id = $1::uuid`, [r.id, contado, r.fin, dif, nota]);
        await q(`INSERT INTO caja_auditoria (usuario, rol, accion, entidad, entidad_id, ciudad, fecha_dia, despues, motivo) VALUES ('Importación', 'sistema', 'cerrar', 'hoja', $1, $2, $3::date, $4::jsonb, $5)`,
          [r.id, ciudad, c.fecha, JSON.stringify({ efectivo_contado: contado, saldo_calculado: r.fin, diferencia: dif }), nota || null]);
        const nFilas = filas.filter((x) => x.hojaFecha === c.fecha).length;
        informe.dias.push({ fecha: c.fecha, filas: nFilas, fotos: fotos.filter((x) => x.fecha === c.fecha).length, saldoAnterior: r.ant, saldoFinal: r.fin, contado, diferencia: dif });
      }
      if (!confirmar) throw ROLLBACK; // simulacro: se calcula todo y se deshace
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }

  // ---- 4. con la base ya confirmada, se borran las fotos viejas que quedaron huérfanas ----------------
  if (confirmar) {
    const nuevas = new Set(fotos.map((f) => f.id));
    for (const v of viejos) if (!nuevas.has(v)) await storage.del(v);
  }
  log(confirmar ? "Importación confirmada." : "Simulacro: no se cambió nada.");
  return informe;
}
