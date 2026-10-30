// Contabilidad (ERP · Fase 2): cuentas de la empresa, movimientos de la cuenta principal, resumen, caja chica (solo lectura)
// y el envío de fondos a caja chica (una sola transacción: egreso en la cuenta + ingreso FONDO en la caja chica).
// Regla del saldo: saldo = saldo inicial (al empezar el día saldo_inicial_fecha) + movimientos desde esa fecha, sin anulados.
import { randomUUID } from 'node:crypto';
import { auditar } from './auditoria.js';
import { cajaDisponible } from './caja.js';
import { consulta, enTransaccion } from './db.js';
import { aCentimos, deCentimos, monto, montoEntrada } from './dinero.js';
import { falla } from './errores.js';
import { sqlGastos } from './proyectos.js';

export const CATEGORIAS = {
  ingreso: ['Cobro a cliente', 'Adelanto de cliente', 'Depósito de caja diaria (efectivo)', 'Préstamo / aporte', 'Devolución', 'Otros ingresos'],
  egreso: ['Proveedores / equipos', 'Materiales', 'Planilla', 'Impuestos', 'Servicios', 'Alquiler', 'Fletes', 'Comisiones bancarias', 'Gasto de proyecto', 'Envío a caja chica', 'Otros egresos'],
};
export const CIUDADES = { AQP: 'Arequipa', MOQ: 'Moquegua' };

const textoONulo = (v, max) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim().slice(0, max);
  return t === '' ? null : t;
};
const entero = (v, nombre) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, `${nombre} no es válido.`);
  return n;
};
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
function fechaValida(v, nombre = 'La fecha', { noFutura = true } = {}) {
  const f = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`))) throw falla(400, `${nombre} debe ser AAAA-MM-DD.`);
  if (noFutura && f > hoyLima()) throw falla(400, `${nombre} no puede ser futura.`);
  return f;
}

// ---------------------------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------------------------

const COLS_CUENTA = `c.id, c.nombre, c.banco, c.numero, c.cci, c.moneda, c.saldo_inicial::text AS saldo_inicial,
  c.saldo_inicial_fecha::text AS saldo_inicial_fecha, c.principal, c.activa`;

/** Saldo de cada cuenta (texto) o null si no se conoce el saldo inicial. */
async function saldos(c = { query: consulta }, cuentaId = null) {
  const { rows } = await c.query(
    `SELECT ${COLS_CUENTA},
            (SELECT COALESCE(SUM(CASE m.tipo WHEN 'ingreso' THEN m.monto ELSE -m.monto END), 0)::text
               FROM cuenta_movimientos m
              WHERE m.cuenta_id = c.id AND NOT m.anulado AND (c.saldo_inicial_fecha IS NULL OR m.fecha >= c.saldo_inicial_fecha)) AS neto,
            (SELECT max(m.fecha)::text FROM cuenta_movimientos m WHERE m.cuenta_id = c.id AND NOT m.anulado) AS ultimo_movimiento
       FROM cuentas c WHERE ($1::int IS NULL OR c.id = $1) ORDER BY c.principal DESC, c.moneda, c.id`,
    [cuentaId],
  );
  return rows.map(({ neto, ...k }) => ({
    ...k,
    saldo_inicial: monto(k.saldo_inicial),
    saldo: k.saldo_inicial === null ? null : deCentimos(aCentimos(k.saldo_inicial) + aCentimos(neto)),
  }));
}

export const listarCuentas = () => saldos();

function datosCuenta(b, parcial) {
  const d = {};
  if (!parcial || b?.nombre !== undefined) {
    d.nombre = textoONulo(b?.nombre, 120);
    if (!d.nombre) throw falla(400, 'Escribe el nombre de la cuenta (por ejemplo «BCP Cta. cte. S/»).');
  }
  for (const [k, max] of [['banco', 80], ['numero', 60], ['cci', 60]]) if (!parcial || b?.[k] !== undefined) d[k] = textoONulo(b?.[k], max);
  if (!parcial || b?.moneda !== undefined) {
    if (!['PEN', 'USD'].includes(b?.moneda)) throw falla(400, 'La moneda debe ser soles (PEN) o dólares (USD).');
    d.moneda = b.moneda;
  }
  if (!parcial || b?.saldo_inicial !== undefined || b?.saldo_inicial_fecha !== undefined) {
    const vacio = b?.saldo_inicial === null || b?.saldo_inicial === undefined || b?.saldo_inicial === '';
    if (vacio) {
      d.saldo_inicial = null;
      d.saldo_inicial_fecha = null;
    } else {
      const t = String(b.saldo_inicial).trim();
      const neg = t.startsWith('-');
      d.saldo_inicial = (neg ? '-' : '') + (t.replace('-', '') === '0' ? '0.00' : montoEntrada(t.replace('-', ''), 'El saldo inicial'));
      d.saldo_inicial_fecha = fechaValida(b?.saldo_inicial_fecha, 'La fecha del saldo inicial');
    }
  }
  if (b?.principal !== undefined) d.principal = !!b.principal;
  if (parcial && b?.activa !== undefined) d.activa = !!b.activa;
  return d;
}

export async function crearCuenta(b) {
  const d = datosCuenta(b, false);
  return enTransaccion(async (c) => {
    if (d.principal) await c.query('UPDATE cuentas SET principal = FALSE WHERE moneda = $1', [d.moneda]);
    const cols = Object.keys(d);
    const { rows } = await c.query(`INSERT INTO cuentas (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((k) => d[k]));
    return (await saldos(c, rows[0].id))[0];
  });
}

export async function editarCuenta(idIn, b) {
  const id = entero(idIn, 'La cuenta');
  const d = datosCuenta(b, true);
  return enTransaccion(async (c) => {
    const antes = (await saldos(c, id))[0];
    if (!antes) throw falla(404, 'No existe esa cuenta.');
    if (d.moneda && d.moneda !== antes.moneda) {
      const { rows } = await c.query('SELECT 1 FROM cuenta_movimientos WHERE cuenta_id = $1 LIMIT 1', [id]);
      if (rows.length) throw falla(409, 'La cuenta ya tiene movimientos: no se puede cambiar su moneda.');
    }
    if (d.principal) await c.query('UPDATE cuentas SET principal = FALSE WHERE moneda = $1 AND id <> $2', [d.moneda ?? antes.moneda, id]);
    const cols = Object.keys(d);
    if (cols.length) await c.query(`UPDATE cuentas SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...cols.map((k) => d[k])]);
    return { antes, despues: (await saldos(c, id))[0] };
  });
}

// ---------------------------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------------------------

const COLS_MOV = `m.id, m.cuenta_id, m.fecha::text AS fecha, m.tipo, m.monto::text AS monto, m.concepto, m.categoria, m.proyecto_id,
  p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre, m.documento, m.contraparte, m.source, m.anulado, m.anulado_motivo, m.anulado_por,
  m.anulado_en::text AS anulado_en, m.registrado_por, m.creado_en::text AS creado_en`;

/** Movimientos de una cuenta con el saldo después de cada uno (null si el saldo inicial no se conoce o es anterior). */
export async function listarMovimientos(q = {}) {
  const cuentaId = q.cuenta_id ? entero(q.cuenta_id, 'La cuenta') : null;
  const cuenta = cuentaId ? (await saldos(undefined, cuentaId))[0] : (await saldos()).find((k) => k.principal) ?? (await saldos())[0];
  if (!cuenta) return { cuenta: null, movimientos: [], totales: { ingresos: '0.00', egresos: '0.00' } };
  const { rows } = await consulta(
    `SELECT ${COLS_MOV},
            CASE WHEN c.saldo_inicial IS NULL OR m.anulado OR m.fecha < c.saldo_inicial_fecha THEN NULL ELSE
              (c.saldo_inicial + SUM(CASE WHEN m.anulado OR m.fecha < c.saldo_inicial_fecha THEN 0 WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END)
                OVER (ORDER BY m.fecha, m.id))::text END AS saldo
       FROM cuenta_movimientos m JOIN cuentas c ON c.id = m.cuenta_id LEFT JOIN proyectos p ON p.id = m.proyecto_id
      WHERE m.cuenta_id = $1 ORDER BY m.fecha DESC, m.id DESC`,
    [cuenta.id],
  );
  const desde = q.desde ? fechaValida(q.desde, 'Desde', { noFutura: false }) : null;
  const hasta = q.hasta ? fechaValida(q.hasta, 'Hasta', { noFutura: false }) : null;
  const t = textoONulo(q.q, 100)?.toLowerCase();
  const lista = rows
    .filter((m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta))
    .filter((m) => !q.tipo || m.tipo === q.tipo)
    .filter((m) => !q.categoria || m.categoria === q.categoria)
    .filter((m) => !q.proyecto_id || String(m.proyecto_id) === String(q.proyecto_id))
    .filter((m) => q.anulados === '1' || !m.anulado)
    .filter((m) => !t || [m.concepto, m.documento, m.contraparte, m.proyecto_nombre, m.proyecto_codigo, m.categoria].some((x) => x?.toLowerCase().includes(t)))
    .map((m) => ({ ...m, monto: monto(m.monto), saldo: monto(m.saldo) }));
  const activos = lista.filter((m) => !m.anulado);
  const suma = (tipo) => deCentimos(activos.filter((m) => m.tipo === tipo).reduce((s, m) => s + aCentimos(m.monto), 0));
  return { cuenta, movimientos: lista, totales: { ingresos: suma('ingreso'), egresos: suma('egreso') } };
}

async function validarProyecto(c, proyectoId, monedaCuenta) {
  if (proyectoId === null) return null;
  const { rows } = await c.query('SELECT id, estado, moneda FROM proyectos WHERE id = $1', [proyectoId]);
  if (!rows[0]) throw falla(400, 'Ese proyecto no existe.');
  if (rows[0].estado === 'finalizado') throw falla(409, 'Ese proyecto está finalizado: ya no recibe gastos.');
  if (rows[0].moneda !== monedaCuenta) throw falla(400, 'El proyecto y la cuenta deben estar en la misma moneda.');
  return proyectoId;
}

export async function registrarMovimiento(b, u, req = null) {
  const cuentaId = entero(b?.cuenta_id, 'La cuenta');
  const tipo = b?.tipo;
  if (!['ingreso', 'egreso'].includes(tipo)) throw falla(400, 'Elige si es un ingreso o un egreso.');
  const valor = montoEntrada(b?.monto);
  const fecha = fechaValida(b?.fecha);
  const concepto = textoONulo(b?.concepto, 255);
  if (!concepto) throw falla(400, 'Escribe el concepto del movimiento.');
  const categoria = textoONulo(b?.categoria, 80);
  if (categoria && !CATEGORIAS[tipo].includes(categoria)) throw falla(400, 'Elige una categoría de la lista.');
  if (categoria === 'Envío a caja chica') throw falla(400, 'Para enviar dinero a caja chica usa «Enviar fondos a caja chica».');
  const proyectoId = b?.proyecto_id ? entero(b.proyecto_id, 'El proyecto') : null;
  if (proyectoId && tipo !== 'egreso') throw falla(400, 'Solo los egresos se asignan a un proyecto.');
  return enTransaccion(async (c) => {
    const { rows: cs } = await c.query('SELECT id, moneda, activa, saldo_inicial_fecha::text AS desde FROM cuentas WHERE id = $1 FOR UPDATE', [cuentaId]);
    if (!cs[0]) throw falla(404, 'No existe esa cuenta.');
    if (!cs[0].activa) throw falla(409, 'La cuenta está desactivada.');
    if (cs[0].desde && fecha < cs[0].desde) throw falla(400, `El saldo inicial de la cuenta es del ${cs[0].desde.split('-').reverse().join('/')}: registra movimientos desde esa fecha.`);
    await validarProyecto(c, proyectoId, cs[0].moneda);
    const { rows } = await c.query(
      `INSERT INTO cuenta_movimientos (cuenta_id, fecha, tipo, monto, concepto, categoria, proyecto_id, documento, contraparte, registrado_por_id, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [cuentaId, fecha, tipo, valor, concepto, categoria, proyectoId, textoONulo(b?.documento, 80), textoONulo(b?.contraparte, 255), u.id, u.nombre],
    );
    const mov = (await c.query(`SELECT ${COLS_MOV} FROM cuenta_movimientos m LEFT JOIN proyectos p ON p.id = m.proyecto_id WHERE m.id = $1`, [rows[0].id])).rows[0];
    await auditar(req ?? { usuario: u }, { accion: 'crear', entidad: 'movimiento_cuenta', entidadId: mov.id, despues: mov }, c);
    return mov;
  });
}

export async function anularMovimiento(idIn, b, u, req = null) {
  const id = entero(idIn, 'El movimiento');
  const motivo = textoONulo(b?.motivo, 500);
  if (!motivo) throw falla(400, 'Escribe por qué se anula.');
  return enTransaccion(async (c) => {
    const { rows } = await c.query(`SELECT ${COLS_MOV} FROM cuenta_movimientos m LEFT JOIN proyectos p ON p.id = m.proyecto_id WHERE m.id = $1 FOR UPDATE OF m`, [id]);
    const antes = rows[0];
    if (!antes) throw falla(404, 'No existe ese movimiento.');
    if (antes.anulado) throw falla(409, 'Ese movimiento ya está anulado.');
    if (antes.source === 'envio_caja_chica') throw falla(409, 'Un envío a caja chica no se puede anular desde el ERP: la caja ya recibió el dinero.');
    await c.query(
      `UPDATE cuenta_movimientos SET anulado = TRUE, anulado_motivo = $2, anulado_por = $3, anulado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1`,
      [id, motivo, u.nombre],
    );
    const despues = (await c.query(`SELECT ${COLS_MOV} FROM cuenta_movimientos m LEFT JOIN proyectos p ON p.id = m.proyecto_id WHERE m.id = $1`, [id])).rows[0];
    await auditar(req ?? { usuario: u }, { accion: 'anular', entidad: 'movimiento_cuenta', entidadId: id, antes, despues, detalle: motivo }, c);
    return despues;
  });
}

// ---------------------------------------------------------------------------------------------
// Resumen (dashboard)
// ---------------------------------------------------------------------------------------------

const mesDe = (f) => f.slice(0, 7);
function mesesAtras(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function resumen(q = {}) {
  const mes = /^\d{4}-\d{2}$/.test(String(q.mes ?? '')) ? q.mes : mesDe(hoyLima());
  const cuentas = await saldos();
  const cuentaId = q.cuenta_id ? entero(q.cuenta_id, 'La cuenta') : (cuentas.find((k) => k.principal && k.moneda === 'PEN') ?? cuentas[0])?.id ?? null;
  const cuenta = cuentas.find((k) => k.id === cuentaId) ?? null;
  const meses = mesesAtras(mes, 6);
  const { rows } = cuentaId
    ? await consulta(
        `SELECT to_char(m.fecha, 'YYYY-MM') AS mes, m.tipo, COALESCE(m.categoria, 'Sin categoría') AS categoria,
                SUM(m.monto)::text AS total, count(*)::int AS n
           FROM cuenta_movimientos m
          WHERE m.cuenta_id = $1 AND NOT m.anulado AND m.fecha >= $2::date AND m.fecha < ($3::date + interval '1 month')
          GROUP BY 1, 2, 3`,
        [cuentaId, `${meses[0]}-01`, `${mes}-01`],
      )
    : { rows: [] };
  const sumaMes = (m, tipo) => deCentimos(rows.filter((r) => r.mes === m && r.tipo === tipo).reduce((s, r) => s + aCentimos(r.total), 0));
  const flujo = meses.map((m) => ({ mes: m, ingresos: sumaMes(m, 'ingreso'), egresos: sumaMes(m, 'egreso') }));
  const cats = rows.filter((r) => r.mes === mes && r.tipo === 'egreso');
  const totalEg = cats.reduce((s, r) => s + aCentimos(r.total), 0);
  const anterior = meses[meses.length - 2];

  // Egresos del mes por proyecto: cuenta principal + caja chica + caja diaria.
  const { rows: porProyecto } = await consulta(
    `SELECT p.id, p.codigo, p.nombre, p.estado, SUM(g.monto::numeric)::text AS total
       FROM (${await sqlGastos()}) g JOIN proyectos p ON p.id = g.proyecto_id
      WHERE g.fecha >= $1 AND g.fecha < $2
      GROUP BY p.id ORDER BY SUM(g.monto::numeric) DESC LIMIT 10`,
    [`${mes}-01`, `${siguienteMes(mes)}-01`],
  );

  return {
    mes,
    cuentas,
    cuenta,
    kpis: {
      ingresos_mes: sumaMes(mes, 'ingreso'),
      egresos_mes: sumaMes(mes, 'egreso'),
      ingresos_mes_anterior: sumaMes(anterior, 'ingreso'),
      egresos_mes_anterior: sumaMes(anterior, 'egreso'),
      movimientos_mes: rows.filter((r) => r.mes === mes).reduce((s, r) => s + r.n, 0),
    },
    flujo,
    egresos_por_categoria: cats
      .map((r) => ({ categoria: r.categoria, monto: monto(r.total), porcentaje: totalEg ? Math.round((aCentimos(r.total) * 1000) / totalEg) / 10 : 0 }))
      .sort((a, b) => aCentimos(b.monto) - aCentimos(a.monto)),
    egresos_por_proyecto: porProyecto.map((p) => ({ ...p, total: monto(p.total) })),
    categorias: CATEGORIAS,
  };
}

function siguienteMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Caja chica (solo lectura en el ERP)
// ---------------------------------------------------------------------------------------------

export async function cajaChica(q = {}) {
  if (!(await cajaDisponible())) return { disponible: false };
  const mes = /^\d{4}-\d{2}$/.test(String(q.mes ?? '')) ? q.mes : mesDe(hoyLima());
  const desde = `${mes}-01`;
  const hasta = `${siguienteMes(mes)}-01`;
  const { rows: s } = await consulta('SELECT ciudad, saldo::text AS saldo FROM v_caja_chica_saldo ORDER BY ciudad');
  const { rows: tot } = await consulta(
    `SELECT CASE WHEN tipo = 'EGRESO' THEN 'egreso' ELSE 'ingreso' END AS lado, SUM(monto)::text AS total, count(*)::int AS n,
            count(*) FILTER (WHERE tipo = 'EGRESO' AND NOT EXISTS (SELECT 1 FROM caja_adjunto a WHERE a.movimiento_id = m.id))::int AS sin_foto
       FROM caja_chica_mov m WHERE deleted_at IS NULL AND fecha >= $1 AND fecha < $2 GROUP BY 1`,
    [desde, hasta],
  );
  const { rows: movs } = await consulta(
    `SELECT m.id::text, m.ciudad, m.fecha::text AS fecha, m.tipo, m.descripcion, m.persona, COALESCE(m.subcategoria, m.categoria) AS categoria,
            m.monto::text AS monto, m.origen, m.proyecto_id, m.proyecto_nombre, COALESCE(u.nombre, m.created_by) AS registrado_por,
            ARRAY(SELECT a.id::text FROM caja_adjunto a WHERE a.movimiento_id = m.id ORDER BY a.created_at) AS adjuntos
       FROM caja_chica_mov m LEFT JOIN usuarios u ON u.id::text = m.created_by
      WHERE m.deleted_at IS NULL ORDER BY m.fecha DESC, m.created_at DESC LIMIT 100`,
  );
  const lado = (l) => tot.find((t) => t.lado === l);
  return {
    disponible: true,
    mes,
    saldos: s.map((x) => ({ ciudad: x.ciudad, nombre: CIUDADES[x.ciudad] ?? x.ciudad, saldo: monto(x.saldo) })),
    saldo_total: deCentimos(s.reduce((a, x) => a + aCentimos(x.saldo), 0)),
    ingresos_mes: monto(lado('ingreso')?.total ?? '0'),
    egresos_mes: monto(lado('egreso')?.total ?? '0'),
    gastos_mes: lado('egreso')?.n ?? 0,
    sin_comprobante_mes: lado('egreso')?.sin_foto ?? 0,
    movimientos: movs.map((m) => ({ ...m, monto: monto(m.monto) })),
  };
}

// ---------------------------------------------------------------------------------------------
// Enviar fondos a caja chica
// ---------------------------------------------------------------------------------------------

/**
 * En una transacción: egreso en la cuenta (PEN) + ingreso FONDO en la caja chica de la ciudad + historial de Finanzas.
 * Si la cuenta quedaría en negativo (o su saldo no se conoce), solo sigue con la confirmación de un Administrador.
 */
export async function enviarFondos(b, u, req = null) {
  if (!(await cajaDisponible())) throw falla(503, 'La caja chica todavía no está lista en el servidor (falta actualizar Finanzas).');
  const cuentaId = entero(b?.cuenta_id, 'La cuenta');
  const ciudad = String(b?.ciudad ?? '');
  if (!CIUDADES[ciudad]) throw falla(400, 'Elige la caja destino (Arequipa o Moquegua).');
  const valor = montoEntrada(b?.monto);
  const concepto = textoONulo(b?.concepto, 200);
  if (!concepto) throw falla(400, 'Indica para qué es el envío.');
  const fecha = hoyLima();
  return enTransaccion(async (c) => {
    const { rows: cs } = await c.query('SELECT id, moneda, activa FROM cuentas WHERE id = $1 FOR UPDATE', [cuentaId]);
    if (!cs[0]) throw falla(404, 'No existe esa cuenta.');
    if (!cs[0].activa) throw falla(409, 'La cuenta está desactivada.');
    if (cs[0].moneda !== 'PEN') throw falla(400, 'La caja chica es en soles: envía desde una cuenta en soles.');
    const cuenta = (await saldos(c, cuentaId))[0];
    const despues = cuenta.saldo === null ? null : deCentimos(aCentimos(cuenta.saldo) - aCentimos(valor));
    const negativo = despues === null || aCentimos(despues) < 0;
    if (negativo) {
      const datos = { codigo: 'SALDO_NEGATIVO', saldo: cuenta.saldo, saldo_despues: despues };
      if (!b?.autorizar_negativo) {
        throw falla(409, cuenta.saldo === null
          ? 'El saldo de la cuenta no se conoce (falta el saldo inicial). Solo un Administrador puede confirmar el envío.'
          : 'La cuenta quedaría en negativo. Solo un Administrador puede confirmar el envío.', datos);
      }
      if (u.rol !== 'admin') throw falla(403, 'Solo un Administrador puede confirmar un envío que deja la cuenta en negativo.', datos);
    }
    const { rows: mv } = await c.query(
      `INSERT INTO cuenta_movimientos (cuenta_id, fecha, tipo, monto, concepto, categoria, source, registrado_por_id, registrado_por)
       VALUES ($1, $2, 'egreso', $3, $4, 'Envío a caja chica', 'envio_caja_chica', $5, $6) RETURNING id`,
      [cuentaId, fecha, valor, `Envío a caja chica ${CIUDADES[ciudad]} · ${concepto}`, u.id, u.nombre],
    );
    const movChica = randomUUID();
    const descripcion = `Fondos de la cuenta principal · ${concepto}`;
    await c.query(
      `INSERT INTO caja_chica_mov (id, ciudad, fecha, tipo, descripcion, persona, monto, origen, created_by, updated_by)
       VALUES ($1::uuid, $2, $3::date, 'FONDO', $4, $5, $6, 'ERP', $7, $7)`,
      [movChica, ciudad, fecha, descripcion, u.nombre, valor, String(u.id)],
    );
    await c.query(
      `INSERT INTO caja_auditoria (usuario_id, usuario, rol, accion, entidad, entidad_id, ciudad, fecha_dia, antes, despues, motivo)
       VALUES ($1, $2, $3, 'crear', 'mov_chica', $4, $5, $6::date, NULL, $7::jsonb, 'Envío desde el ERP')`,
      [String(u.id), u.nombre, u.rol, movChica, ciudad, fecha, JSON.stringify({ tipo: 'FONDO', descripcion, monto: Number(valor), origen: 'ERP' })],
    );
    const { rows: env } = await c.query(
      `INSERT INTO envios_caja_chica (cuenta_id, movimiento_id, caja_chica_mov_id, ciudad, fecha, monto, concepto, saldo_negativo_autorizado, usuario_id, usuario)
       VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10) RETURNING id, creado_en::text AS creado_en`,
      [cuentaId, mv[0].id, movChica, ciudad, fecha, valor, concepto, negativo, u.id, u.nombre],
    );
    const envio = { id: env[0].id, cuenta_id: cuentaId, movimiento_id: mv[0].id, caja_chica_mov_id: movChica, ciudad, fecha, monto: valor, concepto, saldo_negativo_autorizado: negativo };
    await auditar(req ?? { usuario: u }, {
      accion: 'enviar_fondos', entidad: 'envio_caja_chica', entidadId: envio.id,
      antes: { saldo_cuenta: cuenta.saldo }, despues: { ...envio, saldo_cuenta: despues },
      detalle: negativo ? 'Confirmado por un Administrador (la cuenta queda en negativo o sin saldo conocido)' : null,
    }, c);
    return { envio, saldo_antes: cuenta.saldo, saldo_despues: despues };
  });
}
