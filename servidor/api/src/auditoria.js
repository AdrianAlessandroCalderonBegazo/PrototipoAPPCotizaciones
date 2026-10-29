// Auditoría del ERP (tabla audit_log): movimientos de dinero, cambios de estado, emisiones, eliminaciones y cambios de
// configuración. Guarda cómo estaba antes y cómo quedó. Solo se agrega: nadie la edita ni la borra.
import { consulta } from './db.js';

/**
 * Anota un cambio. `cliente` es opcional: dentro de una transacción, pasar el cliente para que el registro
 * se guarde (o se deshaga) junto con el cambio.
 */
export async function auditar(req, { accion, entidad, entidadId = null, antes = null, despues = null, detalle = null }, cliente = null) {
  const u = req?.usuario;
  const q = cliente ?? { query: consulta };
  await q.query(
    `INSERT INTO audit_log (usuario_id, usuario, rol, accion, entidad, entidad_id, antes, despues, detalle, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
    [u?.id ?? null, u?.nombre ?? null, u?.rol ?? null, accion, entidad, entidadId == null ? null : String(entidadId),
     antes == null ? null : JSON.stringify(antes), despues == null ? null : JSON.stringify(despues), detalle, req?.ip ?? null],
  );
}

export async function listarAuditoria({ entidad, usuario, desde, hasta, limite } = {}) {
  const n = Math.min(Math.max(Number.parseInt(limite ?? '200', 10) || 200, 1), 1000);
  const { rows } = await consulta(
    `SELECT id, fecha, usuario_id, usuario, rol, accion, entidad, entidad_id, antes, despues, detalle
       FROM audit_log
      WHERE ($1::text IS NULL OR entidad = $1)
        AND ($2::text IS NULL OR usuario ILIKE '%' || $2 || '%')
        AND ($3::date IS NULL OR fecha >= $3::date)
        AND ($4::date IS NULL OR fecha < $4::date + 1)
      ORDER BY id DESC LIMIT $5`,
    [entidad || null, usuario || null, desde || null, hasta || null, n],
  );
  return rows;
}
