// ERP · Fase 4: Inicio (un solo pedido con todo lo del panel), alertas/notificaciones y búsqueda global.
// Cada parte se arma solo si el rol puede ver ese módulo (matriz de permisos).
import { cajaDisponible } from './caja.js';
import { leerParametros } from './configuracion.js';
import { resumen as resumenConta, cajaChica } from './contabilidad.js';
import { consulta } from './db.js';
import { aCentimos } from './dinero.js';
import { tieneNivel } from './permisos.js';
import { listarProyectos } from './proyectos.js';

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const sumarDias = (f, n) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function permisosDe(u) {
  const [proyectos, contabilidad, cotizacion, logistica, almacen, cajaChicaN, configuracion] = await Promise.all(
    ['proyectos', 'contabilidad', 'cotizacion', 'logistica', 'almacen', 'caja_chica', 'configuracion'].map((m) => tieneNivel(u, m)),
  );
  const proyectosCompleto = await tieneNivel(u, 'proyectos', 'completo');
  const cotizacionCompleto = await tieneNivel(u, 'cotizacion', 'completo');
  const contabilidadCompleto = await tieneNivel(u, 'contabilidad', 'completo');
  return { proyectos, contabilidad, cotizacion, logistica: logistica || almacen, caja_chica: cajaChicaN || contabilidad, configuracion, proyectosCompleto, cotizacionCompleto, contabilidadCompleto };
}

// ---------------------------------------------------------------------------------------------
// Alertas (las mismas del panel y de la campana). Cada una tiene una clave estable: si la situación empeora,
// la clave cambia y vuelve a aparecer como no leída.
// ---------------------------------------------------------------------------------------------

export async function calcularAlertas(u, datos = {}) {
  const p = datos.permisos ?? (await permisosDe(u));
  const param = await leerParametros();
  const hoy = hoyLima();
  const out = [];

  if (p.proyectos) {
    const lista = datos.proyectos ?? (await listarProyectos({})).proyectos;
    for (const x of lista.filter((y) => y.estado !== 'finalizado' && y.porcentaje !== null)) {
      if (x.porcentaje >= param.presupuesto_limite_pct) {
        out.push({ clave: `presupuesto:${x.id}:limite`, nivel: 'alta', icono: 'warning', titulo: `${x.nombre} superó su presupuesto (${x.porcentaje}% gastado).`, origen: 'Proyectos', ruta: `/proyectos/${x.id}`, cta: 'Ver proyecto' });
      } else if (x.porcentaje >= param.presupuesto_aviso_pct) {
        out.push({ clave: `presupuesto:${x.id}:aviso`, nivel: 'media', icono: 'trending_up', titulo: `${x.nombre} llegó al ${x.porcentaje}% de su presupuesto.`, origen: 'Proyectos', ruta: `/proyectos/${x.id}`, cta: 'Ver proyecto' });
      }
    }
  }

  if (p.caja_chica && (await cajaDisponible())) {
    const { rows } = await consulta('SELECT ciudad, saldo::text AS saldo FROM v_caja_chica_saldo');
    for (const r of rows) {
      if (aCentimos(r.saldo) < 0) out.push({ clave: `caja_negativa:${r.ciudad}:${hoy}`, nivel: 'alta', icono: 'savings', titulo: `La caja chica de ${r.ciudad === 'AQP' ? 'Arequipa' : 'Moquegua'} está en negativo.`, origen: 'Caja chica', ruta: p.contabilidad ? '/contabilidad' : null, cta: 'Ver caja chica' });
    }
    const { rows: sf } = await consulta(
      `SELECT count(*)::int AS n FROM caja_chica_mov m WHERE m.deleted_at IS NULL AND m.tipo = 'EGRESO' AND m.fecha >= date_trunc('month', $1::date)
         AND NOT EXISTS (SELECT 1 FROM caja_adjunto a WHERE a.movimiento_id = m.id)`,
      [hoy],
    );
    if (sf[0].n > 0) out.push({ clave: `sin_foto:${hoy.slice(0, 7)}:${Math.ceil(sf[0].n / 5) * 5}`, nivel: 'media', icono: 'receipt', titulo: `${sf[0].n} gasto${sf[0].n === 1 ? '' : 's'} de caja chica de este mes sin foto del recibo.`, origen: 'Caja chica', ruta: p.contabilidad ? '/contabilidad' : null, cta: 'Revisar' });
  }

  if (p.contabilidad) {
    const { rows } = await consulta("SELECT id, nombre FROM cuentas WHERE activa AND principal AND saldo_inicial IS NULL");
    for (const c of rows) out.push({ clave: `sin_saldo_inicial:${c.id}`, nivel: 'info', icono: 'account_balance', titulo: `La cuenta «${c.nombre}» no tiene saldo inicial: su saldo se muestra «Sin dato».`, origen: 'Contabilidad', ruta: '/contabilidad', cta: 'Registrar saldo' });
    const { rows: neg } = await consulta(
      `SELECT c.id, c.nombre FROM cuentas c WHERE c.activa AND c.saldo_inicial IS NOT NULL
         AND c.saldo_inicial + COALESCE((SELECT SUM(CASE m.tipo WHEN 'ingreso' THEN m.monto ELSE -m.monto END) FROM cuenta_movimientos m
               WHERE m.cuenta_id = c.id AND NOT m.anulado AND m.fecha >= c.saldo_inicial_fecha), 0) < 0`,
    );
    for (const c of neg) out.push({ clave: `cuenta_negativa:${c.id}:${hoy}`, nivel: 'alta', icono: 'error', titulo: `La cuenta «${c.nombre}» está en negativo.`, origen: 'Contabilidad', ruta: '/contabilidad', cta: 'Ver movimientos' });
  }

  if (p.cotizacion) {
    const { rows } = await consulta(
      `SELECT id, numero, cliente, (fecha::date + validez_dias)::text AS vence FROM cotizaciones
        WHERE estado = 'enviada' AND validez_dias IS NOT NULL AND (fecha::date + validez_dias) BETWEEN $1::date - 7 AND $1::date + 3 ORDER BY 4`,
      [hoy],
    );
    for (const c of rows) {
      const vencida = c.vence < hoy;
      out.push({ clave: `cot_vence:${c.id}:${vencida ? 'vencida' : 'pronto'}`, nivel: vencida ? 'info' : 'media', icono: 'schedule', titulo: vencida ? `La cotización ${c.numero} (${c.cliente}) venció sin respuesta.` : `La cotización ${c.numero} (${c.cliente}) vence el ${c.vence.split('-').reverse().join('/')}.`, origen: 'Cotización', ruta: `/cotizacion/${c.id}`, cta: 'Ver cotización' });
    }
    if (!param.tipo_cambio.valor || (param.tipo_cambio.fecha && param.tipo_cambio.fecha < sumarDias(hoy, -7))) {
      out.push({ clave: `tc:${param.tipo_cambio.fecha ?? 'sin'}`, nivel: 'info', icono: 'currency_exchange', titulo: param.tipo_cambio.valor ? `El tipo de cambio es del ${param.tipo_cambio.fecha.split('-').reverse().join('/')}: conviene actualizarlo.` : 'Falta registrar el tipo de cambio (los productos en dólares no se pueden cotizar).', origen: 'Configuración', ruta: p.configuracion ? '/configuracion/parametros' : null, cta: 'Actualizar' });
    }
  }

  if (p.logistica) {
    const { rows } = await consulta(
      `SELECT count(*) FILTER (WHERE urgente AND estado <> 'entregado')::int AS urgentes, count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes FROM requerimientos`,
    );
    if (rows[0].urgentes) out.push({ clave: `req_urgentes:${rows[0].urgentes}`, nivel: 'alta', icono: 'priority_high', titulo: `${rows[0].urgentes} requerimiento${rows[0].urgentes === 1 ? '' : 's'} urgente${rows[0].urgentes === 1 ? '' : 's'} sin entregar.`, origen: 'Logística', ruta: '/almacen', cta: 'Ver almacén' });
    if (rows[0].pendientes) out.push({ clave: `req_pendientes:${rows[0].pendientes}`, nivel: 'media', icono: 'pending_actions', titulo: `${rows[0].pendientes} requerimiento${rows[0].pendientes === 1 ? '' : 's'} por aprobar.`, origen: 'Logística', ruta: '/almacen', cta: 'Ver almacén' });
  }

  const orden = { alta: 0, media: 1, info: 2 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

export async function notificaciones(u) {
  const alertas = await calcularAlertas(u);
  const { rows } = await consulta('SELECT clave FROM notificaciones_leidas WHERE usuario_id = $1', [u.id]);
  const leidas = new Set(rows.map((r) => r.clave));
  const lista = alertas.map((a) => ({ ...a, leida: leidas.has(a.clave) }));
  return { notificaciones: lista, sin_leer: lista.filter((a) => !a.leida).length };
}

export async function marcarLeidas(u, claves) {
  const lista = Array.isArray(claves) ? claves.map((c) => String(c).slice(0, 160)).slice(0, 200) : (await calcularAlertas(u)).map((a) => a.clave);
  for (const c of lista) {
    await consulta('INSERT INTO notificaciones_leidas (usuario_id, clave) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.id, c]);
  }
  return { leidas: lista.length };
}

// ---------------------------------------------------------------------------------------------
// Inicio: todo el panel en un pedido
// ---------------------------------------------------------------------------------------------

export async function inicio(u) {
  const p = await permisosDe(u);
  const out = { fecha: hoyLima(), permisos: p };
  let proyectos = null;
  if (p.contabilidad) {
    const r = await resumenConta({});
    out.finanzas = { cuenta: r.cuenta, cuentas: r.cuentas, kpis: r.kpis, caja: await cajaChica({}) };
  }
  if (p.proyectos) {
    proyectos = (await listarProyectos({})).proyectos;
    const param = await leerParametros();
    const activos = proyectos.filter((x) => x.estado === 'activo');
    const pausados = proyectos.filter((x) => x.estado === 'pausado');
    const { rows: desde } = pausados.length
      ? await consulta(`SELECT DISTINCT ON (proyecto_id) proyecto_id, fecha::text AS fecha FROM proyecto_estados WHERE estado = 'pausado' AND proyecto_id = ANY($1) ORDER BY proyecto_id, id DESC`, [pausados.map((x) => x.id)])
      : { rows: [] };
    out.proyectos = {
      activos: [...activos].sort((a, b) => (b.porcentaje ?? 0) - (a.porcentaje ?? 0)).slice(0, 8),
      pausados: pausados.map((x) => ({ ...x, pausado_desde: desde.find((d) => d.proyecto_id === x.id)?.fecha ?? null })),
      total_activos: activos.length,
      con_alerta: activos.filter((x) => x.porcentaje !== null && x.porcentaje >= param.presupuesto_aviso_pct).length,
      aviso_pct: param.presupuesto_aviso_pct,
      limite_pct: param.presupuesto_limite_pct,
    };
  }
  if (p.cotizacion) {
    const { rows } = await consulta(
      `SELECT id, numero, cliente, sistema, estado, origen, fecha::text AS fecha, total::text AS total FROM cotizaciones
        WHERE fecha >= date_trunc('month', now() AT TIME ZONE 'America/Lima') ORDER BY fecha DESC, id DESC LIMIT 6`,
    );
    const { rows: n } = await consulta(
      `SELECT count(*)::int AS mes, COALESCE(SUM(total), 0)::text AS monto, count(*) FILTER (WHERE estado = 'aceptada')::int AS aceptadas
         FROM cotizaciones WHERE fecha >= date_trunc('month', now() AT TIME ZONE 'America/Lima')`,
    );
    out.cotizaciones = { ultimas: rows, del_mes: n[0].mes, monto_mes: n[0].monto, aceptadas_mes: n[0].aceptadas };
  }
  if (p.logistica) {
    const { rows } = await consulta(
      `SELECT count(*) FILTER (WHERE estado = 'pendiente')::int AS por_aprobar, count(*) FILTER (WHERE estado IN ('aprobado','listo'))::int AS por_entregar,
              count(*) FILTER (WHERE urgente AND estado <> 'entregado')::int AS urgentes FROM requerimientos`,
    );
    const { rows: h } = await consulta(`SELECT count(*) FILTER (WHERE estado = 'pendiente')::int AS fuera, count(*) FILTER (WHERE estado = 'registrado')::int AS por_confirmar FROM checklists_herramientas`);
    out.logistica = { ...rows[0], herramientas_fuera: h[0].fuera, salidas_por_confirmar: h[0].por_confirmar };
  }
  out.alertas = await calcularAlertas(u, { permisos: p, proyectos });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Búsqueda global (Ctrl+K)
// ---------------------------------------------------------------------------------------------

const SIN_TILDES = (col) => `translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;
const limpiar = (q) => String(q ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 80);

// «79800.5» → «S/ 79,800.50» (solo texto, sin pasar por float)
function monto(t, moneda = 'PEN') {
  if (t === null || t === undefined) return null;
  const [e, d = ''] = String(t).replace('-', '').split('.');
  return `${moneda === 'USD' ? 'US$' : 'S/'} ${e.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(d + '00').slice(0, 2)}`;
}

export async function buscar(u, qIn) {
  const q = limpiar(qIn);
  if (q.length < 2) return { grupos: [] };
  const p = await permisosDe(u);
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const grupos = [];
  if (p.proyectos) {
    const { rows } = await consulta(`SELECT id, codigo, nombre, estado, cliente FROM proyectos WHERE ${SIN_TILDES('nombre')} LIKE $1 OR lower(codigo) LIKE $1 OR ${SIN_TILDES("coalesce(cliente,'')")} LIKE $1 ORDER BY id DESC LIMIT 5`, [like]);
    if (rows.length) grupos.push({ grupo: 'Proyectos', items: rows.map((r) => ({ titulo: r.nombre, detalle: [r.codigo, r.cliente, r.estado].filter(Boolean).join(' · '), icono: 'solar_power', ruta: `/proyectos/${r.id}` })) });
  }
  if (p.cotizacion) {
    const { rows } = await consulta(`SELECT id, numero, cliente, total::text AS total, estado FROM cotizaciones WHERE lower(numero) LIKE $1 OR ${SIN_TILDES('cliente')} LIKE $1 ORDER BY fecha DESC LIMIT 5`, [like]);
    if (rows.length) grupos.push({ grupo: 'Cotizaciones', items: rows.map((r) => ({ titulo: `${r.numero} · ${r.cliente || 'Cliente sin nombre'}`, detalle: [r.estado ?? 'sin estado', monto(r.total)].filter(Boolean).join(' · '), icono: 'request_quote', ruta: `/cotizacion/${r.id}` })) });
    const { rows: pr } = await consulta(
      `SELECT id, nombre, codigo_erp AS codigo, marca, precio_venta::text AS precio, moneda FROM productos
        WHERE NOT eliminado AND (${SIN_TILDES('nombre')} LIKE $1 OR lower(coalesce(codigo_erp,'')) LIKE $1 OR lower(coalesce(referencia_interna,'')) LIKE $1 OR ${SIN_TILDES("coalesce(marca,'')")} LIKE $1)
        ORDER BY nombre LIMIT 6`,
      [like],
    );
    if (pr.length) grupos.push({ grupo: 'Productos', items: pr.map((r) => ({ titulo: r.nombre, detalle: [r.codigo, r.marca, monto(r.precio, r.moneda)].filter(Boolean).join(' · '), icono: 'inventory_2', ruta: `/cotizacion?tab=catalogo&q=${encodeURIComponent(r.codigo ?? r.nombre)}` })) });
  }
  if (p.contabilidad) {
    const { rows } = await consulta(
      `SELECT m.id, m.concepto, m.fecha::text AS fecha, m.monto::text AS monto, m.tipo, m.documento, c.moneda FROM cuenta_movimientos m JOIN cuentas c ON c.id = m.cuenta_id
        WHERE ${SIN_TILDES('m.concepto')} LIKE $1 OR lower(coalesce(m.documento,'')) LIKE $1 OR ${SIN_TILDES("coalesce(m.contraparte,'')")} LIKE $1 ORDER BY m.fecha DESC LIMIT 5`,
      [like],
    );
    if (rows.length) grupos.push({ grupo: 'Movimientos de la cuenta', items: rows.map((r) => ({ titulo: r.concepto, detalle: [r.fecha.split('-').reverse().join('/'), `${r.tipo === 'ingreso' ? '+' : '−'} ${monto(r.monto, r.moneda)}`, r.documento].filter(Boolean).join(' · '), icono: 'account_balance', ruta: `/contabilidad?q=${encodeURIComponent(r.concepto)}` })) });
  }
  if (p.logistica) {
    const { rows } = await consulta(`SELECT id, numero, obra, estado FROM requerimientos WHERE lower(numero) LIKE $1 OR ${SIN_TILDES('obra')} LIKE $1 OR ${SIN_TILDES('solicitante')} LIKE $1 ORDER BY fecha_creacion DESC LIMIT 5`, [like]);
    if (rows.length) grupos.push({ grupo: 'Requerimientos', items: rows.map((r) => ({ titulo: `${r.numero} · ${r.obra}`, detalle: r.estado, icono: 'inventory_2', ruta: '/almacen' })) });
  }
  return { grupos };
}
