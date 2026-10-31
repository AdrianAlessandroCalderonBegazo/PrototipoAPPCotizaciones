// Proyectos (ERP · Fase 2): crear con nombre y presupuesto, estados con historial, fotos y gastos.
// Los gastos vienen de la caja chica y la caja diaria (Finanzas, categoría «Gasto de proyecto») y de la cuenta principal.
import { cajaDisponible } from './caja.js';
import { consulta, enTransaccion } from './db.js';
import { aCentimos, deCentimos, monto, montoEntrada } from './dinero.js';
import { falla } from './errores.js';

export const ESTADOS = ['activo', 'pausado', 'finalizado'];
export const CAUSAS_PAUSA = ['Esperando permiso o conexión SEAL', 'Pago del cliente pendiente', 'Falta de equipos / importación', 'Clima o acceso a obra', 'Otra causa'];
const OPCIONALES = { cliente: 255, ruc_dni: 20, tipo_sistema: 120, marca: 120, ubicacion: 255, responsable: 120, notas: 2000 };

const textoONulo = (v, max) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim().slice(0, max);
  return t === '' ? null : t;
};
const entero = (v, nombre = 'id') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, `El ${nombre} no es válido.`);
  return n;
};

/** Gastos de proyectos de todas las fuentes, como una sola tabla (SQL). `$1` filtra por proyecto si se pasa. */
export async function sqlGastos(filtro = '') {
  const partes = [
    `SELECT 'cuenta_principal' AS origen, m.id::text AS id, m.fecha::text AS fecha, m.concepto, m.categoria, m.monto::text AS monto,
            m.registrado_por AS por, m.documento AS comprobante, '{}'::text[] AS adjuntos, NULL::text AS ciudad, m.proyecto_id, m.creado_en::text AS registrado_en
       FROM cuenta_movimientos m WHERE m.tipo = 'egreso' AND NOT m.anulado AND m.proyecto_id IS NOT NULL ${filtro && `AND m.proyecto_id = ${filtro}`}`,
    // Caja ICR (Fase 11): gastos físicos y digitales con proyecto (un depósito a la cuenta principal no es gasto).
    `SELECT 'caja_icr', m.id::text, m.fecha::text, m.descripcion, COALESCE(m.subcategoria, m.categoria), m.monto::text,
            m.creado_por, CASE WHEN m.comprobante = 'NINGUNO' THEN NULL ELSE m.comprobante END,
            ARRAY(SELECT a.id::text FROM caja_icr_adjunto a WHERE a.mov_id = m.id ORDER BY a.id), m.medio, m.proyecto_id, m.creado_en::text
       FROM caja_icr_mov m WHERE m.tipo = 'EGRESO' AND m.origen <> 'DEPOSITO' AND NOT m.anulado AND m.proyecto_id IS NOT NULL ${filtro && `AND m.proyecto_id = ${filtro}`}`,
  ];
  if (await cajaDisponible()) {
    partes.push(
      `SELECT 'caja_chica', m.id::text, m.fecha::text, m.descripcion, COALESCE(m.subcategoria, m.categoria), m.monto::text,
              COALESCE(u.nombre, m.created_by), NULL::text, ARRAY(SELECT a.id::text FROM caja_adjunto a WHERE a.movimiento_id = m.id ORDER BY a.created_at), m.ciudad, m.proyecto_id,
              (m.created_at AT TIME ZONE 'America/Lima')::text
         FROM caja_chica_mov m LEFT JOIN usuarios u ON u.id::text = m.created_by
        WHERE m.tipo = 'EGRESO' AND m.deleted_at IS NULL AND m.proyecto_id IS NOT NULL ${filtro && `AND m.proyecto_id = ${filtro}`}`,
      `SELECT 'caja_diaria', f.id::text, h.fecha::text, f.descripcion, COALESCE(f.subcategoria, f.categoria),
              (f.caja_salida_efectivo + f.caja_salida_transf + f.cta_cte_salida)::text,
              COALESCE(u.nombre, f.created_by), CASE WHEN f.comprobante = 'NINGUNO' THEN NULL ELSE f.comprobante END,
              ARRAY(SELECT a.id::text FROM caja_adjunto a WHERE a.fila_id = f.id ORDER BY a.created_at), h.ciudad, f.proyecto_id, (f.created_at AT TIME ZONE 'America/Lima')::text
         FROM caja_fila f JOIN caja_hoja h ON h.id = f.hoja_id LEFT JOIN usuarios u ON u.id::text = f.created_by
        WHERE f.deleted_at IS NULL AND f.proyecto_id IS NOT NULL AND (f.caja_salida_efectivo + f.caja_salida_transf + f.cta_cte_salida) > 0
          ${filtro && `AND f.proyecto_id = ${filtro}`}`,
    );
  }
  return partes.join('\nUNION ALL\n');
}

const COLS = `p.id, p.codigo, p.nombre, p.presupuesto::text AS presupuesto, p.moneda, p.estado, p.causa_pausa, p.cliente, p.ruc_dni, p.tipo_sistema,
  p.marca, p.ubicacion, p.responsable, p.notas, p.version, p.creado_en::text AS creado_en, p.actualizado_en::text AS actualizado_en`;

/** Porcentaje gastado con un decimal, calculado en céntimos (null si no hay presupuesto). */
export function porcentaje(gastado, presupuesto) {
  const p = aCentimos(presupuesto);
  if (p <= 0) return null;
  return Math.round((aCentimos(gastado) * 1000) / p) / 10;
}

function conGasto(p, gastado, n, ultimo) {
  const g = monto(gastado ?? '0');
  return { ...p, gastado: g, saldo: deCentimos(aCentimos(p.presupuesto) - aCentimos(g)), porcentaje: porcentaje(g, p.presupuesto), n_gastos: n ?? 0, ultimo_gasto: ultimo ?? null };
}

export async function listarProyectos({ estado, q } = {}) {
  const gastos = await sqlGastos();
  const { rows } = await consulta(
    `WITH g AS (${gastos}),
          t AS (SELECT proyecto_id, SUM(monto::numeric)::text AS gastado, count(*)::int AS n, max(fecha) AS ultimo FROM g GROUP BY proyecto_id)
     SELECT ${COLS}, t.gastado, t.n, t.ultimo
       FROM proyectos p LEFT JOIN t ON t.proyecto_id = p.id
      WHERE ($1::text IS NULL OR p.estado = $1)
        AND ($2::text IS NULL OR p.nombre ILIKE '%' || $2 || '%' OR p.codigo ILIKE '%' || $2 || '%' OR p.cliente ILIKE '%' || $2 || '%')
      ORDER BY CASE p.estado WHEN 'activo' THEN 0 WHEN 'pausado' THEN 1 ELSE 2 END, p.id DESC`,
    [ESTADOS.includes(estado) ? estado : null, textoONulo(q, 100)],
  );
  const { rows: cuenta } = await consulta('SELECT estado, count(*)::int AS n FROM proyectos GROUP BY estado');
  return {
    proyectos: rows.map(({ gastado, n, ultimo, ...p }) => conGasto(p, gastado, n, ultimo)),
    conteo: Object.fromEntries(ESTADOS.map((e) => [e, cuenta.find((c) => c.estado === e)?.n ?? 0])),
  };
}

/** Lista corta para elegir un proyecto al registrar un gasto (Finanzas y Contabilidad). */
export async function proyectosActivos() {
  const { rows } = await consulta("SELECT id, codigo, nombre FROM proyectos WHERE estado = 'activo' ORDER BY nombre");
  return rows;
}

export async function detalleProyecto(idIn) {
  const id = entero(idIn, 'proyecto');
  const { rows } = await consulta(`SELECT ${COLS} FROM proyectos p WHERE p.id = $1`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese proyecto.');
  const gastos = (await consulta(`SELECT * FROM (${await sqlGastos('$1')}) g ORDER BY fecha DESC, registrado_en DESC`, [id])).rows.map((g) => ({ ...g, monto: monto(g.monto) }));
  const total = gastos.reduce((s, g) => s + aCentimos(g.monto), 0);
  const porCategoria = {};
  for (const g of gastos) {
    const k = g.categoria || 'Sin categoría';
    porCategoria[k] = (porCategoria[k] ?? 0) + aCentimos(g.monto);
  }
  const estados = (await consulta('SELECT id, estado, causa, usuario, fecha::text AS fecha FROM proyecto_estados WHERE proyecto_id = $1 ORDER BY id', [id])).rows;
  const fotos = (await consulta(
    'SELECT id, ruta, descripcion, subido_por, subido_en::text AS subido_en FROM proyecto_fotos WHERE proyecto_id = $1 AND NOT eliminado ORDER BY id DESC', [id],
  )).rows;
  return {
    proyecto: conGasto(rows[0], deCentimos(total), gastos.length, gastos[0]?.fecha),
    gastos,
    categorias: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([categoria, c]) => ({ categoria, monto: deCentimos(c), porcentaje: total ? Math.round((c * 1000) / total) / 10 : 0 })),
    estados,
    fotos,
    caja_disponible: await cajaDisponible(),
  };
}

async function siguienteCodigo(c) {
  const { rows } = await c.query(
    `INSERT INTO correlativos (clave, valor) VALUES ('proyecto', 1) ON CONFLICT (clave) DO UPDATE SET valor = correlativos.valor + 1 RETURNING valor`,
  );
  return `PRY-${String(rows[0].valor).padStart(3, '0')}`;
}

function datosOpcionales(b) {
  const out = {};
  for (const [k, max] of Object.entries(OPCIONALES)) if (k in (b ?? {})) out[k] = textoONulo(b[k], max);
  return out;
}

export async function crearProyecto(b, u) {
  const nombre = textoONulo(b?.nombre, 200);
  if (!nombre) throw falla(400, 'Escribe un nombre para el proyecto.');
  const presupuesto = montoEntrada(b?.presupuesto, 'El presupuesto');
  const extra = datosOpcionales(b);
  return enTransaccion(async (c) => {
    const codigo = await siguienteCodigo(c);
    const cols = Object.keys(extra);
    const { rows } = await c.query(
      `INSERT INTO proyectos (codigo, nombre, presupuesto, creado_por${cols.map((k) => `, ${k}`).join('')})
       VALUES ($1, $2, $3, $4${cols.map((_, i) => `, $${i + 5}`).join('')}) RETURNING id`,
      [codigo, nombre, presupuesto, u.id, ...cols.map((k) => extra[k])],
    );
    const id = rows[0].id;
    await c.query("INSERT INTO proyecto_estados (proyecto_id, estado, causa, usuario_id, usuario) VALUES ($1, 'activo', 'Proyecto creado', $2, $3)", [id, u.id, u.nombre]);
    const p = (await c.query(`SELECT ${COLS} FROM proyectos p WHERE p.id = $1`, [id])).rows[0];
    return p;
  });
}

async function bloquear(c, id) {
  const { rows } = await c.query(`SELECT ${COLS} FROM proyectos p WHERE p.id = $1 FOR UPDATE`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese proyecto.');
  return rows[0];
}

const conflicto = () => falla(409, 'Otra persona cambió este proyecto mientras lo veías. Se actualizó: revisa y vuelve a intentarlo.');

export async function editarProyecto(idIn, b) {
  const id = entero(idIn, 'proyecto');
  return enTransaccion(async (c) => {
    const antes = await bloquear(c, id);
    if (antes.estado === 'finalizado') throw falla(409, 'El proyecto está finalizado: ya no se puede cambiar.');
    if (b?.version !== undefined && Number(b.version) !== antes.version) throw conflicto();
    const cambios = datosOpcionales(b);
    if (b?.nombre !== undefined) {
      cambios.nombre = textoONulo(b.nombre, 200);
      if (!cambios.nombre) throw falla(400, 'El proyecto necesita un nombre.');
    }
    if (b?.presupuesto !== undefined) cambios.presupuesto = montoEntrada(b.presupuesto, 'El presupuesto');
    const cols = Object.keys(cambios);
    if (!cols.length) return { antes, despues: antes };
    await c.query(
      `UPDATE proyectos SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, version = version + 1, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`,
      [id, ...cols.map((k) => cambios[k])],
    );
    const despues = (await c.query(`SELECT ${COLS} FROM proyectos p WHERE p.id = $1`, [id])).rows[0];
    return { antes, despues };
  });
}

/** activo → pausado (con causa) | finalizado; pausado → activo | finalizado; finalizado no cambia más. */
export async function cambiarEstado(idIn, b, u) {
  const id = entero(idIn, 'proyecto');
  const estado = String(b?.estado ?? '');
  if (!ESTADOS.includes(estado)) throw falla(400, 'Estado no válido.');
  return enTransaccion(async (c) => {
    const antes = await bloquear(c, id);
    if (b?.version !== undefined && Number(b.version) !== antes.version) throw conflicto();
    if (antes.estado === 'finalizado') throw falla(409, 'El proyecto ya está finalizado: no se puede reactivar ni pausar.');
    if (antes.estado === estado) throw falla(409, `El proyecto ya está ${estado}.`);
    let causa = null;
    if (estado === 'pausado') {
      causa = textoONulo(b?.causa, 500);
      if (!causa) throw falla(400, 'Indica la causa de la pausa.');
    }
    await c.query(
      `UPDATE proyectos SET estado = $2, causa_pausa = $3, version = version + 1, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`,
      [id, estado, causa],
    );
    const nota = estado === 'finalizado' ? textoONulo(b?.nota, 500) : causa;
    await c.query('INSERT INTO proyecto_estados (proyecto_id, estado, causa, usuario_id, usuario) VALUES ($1, $2, $3, $4, $5)', [id, estado, nota, u.id, u.nombre]);
    const despues = (await c.query(`SELECT ${COLS} FROM proyectos p WHERE p.id = $1`, [id])).rows[0];
    return { antes, despues };
  });
}

const RUTA_FOTO = /^\/uploads\/[0-9a-f]{24}\.(jpg|jpeg|png|webp)$/;

export async function agregarFotos(idIn, fotos, u) {
  const id = entero(idIn, 'proyecto');
  const lista = Array.isArray(fotos) ? fotos : [];
  if (!lista.length) throw falla(400, 'No llegaron fotos.');
  if (lista.length > 30) throw falla(400, 'Sube como máximo 30 fotos a la vez.');
  for (const f of lista) if (!RUTA_FOTO.test(String(f?.ruta ?? ''))) throw falla(400, 'Una de las fotos no se subió bien. Vuelve a intentarlo.');
  return enTransaccion(async (c) => {
    const p = await bloquear(c, id);
    if (p.estado === 'finalizado') throw falla(409, 'El proyecto está finalizado: ya no recibe fotos.');
    const out = [];
    for (const f of lista) {
      const { rows } = await c.query(
        `INSERT INTO proyecto_fotos (proyecto_id, ruta, descripcion, subido_por_id, subido_por) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, ruta, descripcion, subido_por, subido_en::text AS subido_en`,
        [id, f.ruta, textoONulo(f.descripcion, 255), u.id, u.nombre],
      );
      out.push(rows[0]);
    }
    return out;
  });
}

export async function quitarFoto(idIn, fotoIn) {
  const id = entero(idIn, 'proyecto');
  const fotoId = entero(fotoIn, 'foto');
  return enTransaccion(async (c) => {
    const p = await bloquear(c, id);
    if (p.estado === 'finalizado') throw falla(409, 'El proyecto está finalizado: no se pueden quitar fotos.');
    const { rows } = await c.query('UPDATE proyecto_fotos SET eliminado = TRUE WHERE id = $1 AND proyecto_id = $2 AND NOT eliminado RETURNING id, ruta', [fotoId, id]);
    if (!rows[0]) throw falla(404, 'Esa foto ya no está.');
    return rows[0];
  });
}
