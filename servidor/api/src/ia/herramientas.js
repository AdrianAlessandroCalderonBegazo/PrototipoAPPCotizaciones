// Herramientas que puede usar la IA. TODAS SON DE SOLO LECTURA: ninguna escribe en la base.
// Cada una revisa el permiso de quien pregunta (la IA ve solo lo que esa persona puede ver) y los totales los calcula el servidor:
// el modelo recibe los números ya hechos y la pantalla muestra tablas y gráficos armados aquí, nunca por el modelo.
import { leerParametros } from '../configuracion.js';
import { cajaChica, listarMovimientos, resumen as resumenConta } from '../contabilidad.js';
import { calcular } from '../cotizar.js';
import { consulta } from '../db.js';
import { aCentimos, deCentimos, monto } from '../dinero.js';
import { listarComprobantes } from '../facturacion.js';
import { detalleKit, listarKits } from '../kits.js';
import { tieneNivel } from '../permisos.js';
import { detalleProyecto, listarProyectos } from '../proyectos.js';
import { buscarProductos, normalizar, productoExacto } from './indice.js';

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const mesActual = () => hoyLima().slice(0, 7);
const miles = (t) => {
  if (t === null || t === undefined) return 'Sin dato';
  const neg = String(t).startsWith('-');
  const [e, d = '00'] = String(t).replace('-', '').split('.');
  return `${neg ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d.padEnd(2, '0').slice(0, 2)}`;
};
export const soles = (t, moneda = 'PEN') => (t === null || t === undefined ? 'Sin dato' : `${moneda === 'USD' ? 'US$' : 'S/'} ${miles(t)}`);
const pct = (a, b) => {
  const B = aCentimos(b ?? '0');
  return B ? `${(Math.round(((aCentimos(a ?? '0') - B) * 1000) / B) / 10).toFixed(1)}%` : 'Sin dato';
};
const fechaPe = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const mesValido = (m) => (/^\d{4}-\d{2}$/.test(String(m ?? '')) ? m : mesActual());
const sumar = (lista) => deCentimos(lista.reduce((s, v) => s + (v ? aCentimos(v) : 0), 0));
const tabla = (titulo, columnas, filas, destacar = null) => ({ tipo: 'tabla', titulo, columnas: columnas.map(([l, a = 'left']) => ({ l, a })), filas, destacar });
const barras = (titulo, pares) => ({ tipo: 'grafico', titulo, barras: pares.map(([l, t]) => ({ l, v: Math.max(0, aCentimos(t ?? '0')) / 100, texto: soles(t) })) });
const sinPermiso = (que) => ({ modelo: { error: `La persona que pregunta no tiene permiso para ver ${que}. Díselo con amabilidad.` }, bloques: [] });

/** Precio en soles (con IGV) de un producto del catálogo. USD → S/ con el tipo de cambio de Configuración (o null si no hay). */
function precioEnSoles(p, tc) {
  if (p.precio === null || p.precio === undefined) return null;
  if (p.moneda !== 'USD') return p.precio;
  if (!tc) return null;
  const [e, d = ''] = String(tc).split('.');
  const tc4 = BigInt(e) * 10000n + BigInt(d.padEnd(4, '0').slice(0, 4));
  const c = BigInt(aCentimos(p.precio));
  return deCentimos(Number((c * tc4 * 2n + 10000n) / 20000n));
}

// ---------------------------------------------------------------------------------------------
// Cotizador IA
// ---------------------------------------------------------------------------------------------

const buscar_productos = {
  nombre: 'buscar_productos', fuente: 'Catálogo', modulo: 'cotizacion',
  descripcion: 'Busca productos reales del catálogo de ICR por nombre, marca, modelo, potencia o código. Úsala antes de proponer una cotización. Los precios incluyen IGV.',
  parametros: { type: 'object', properties: { texto: { type: 'string', description: 'Qué buscar, por ejemplo «inversor híbrido 10 kW» o «panel 550 W»' }, marca: { type: 'string' } }, required: ['texto'] },
  async ejecutar(a, { tc }) {
    const r = await buscarProductos(String(a.texto ?? ''), { limite: 8, marca: a.marca || null });
    return {
      modelo: { productos: r.map((p) => ({ codigo: p.codigo ?? `ID${p.id}`, nombre: p.nombre, marca: p.marca, precio_con_igv: p.precio ? `${p.moneda === 'USD' ? 'US$' : 'S/'} ${p.precio}` : 'Sin dato', unidad: p.unidad })), total_encontrados: r.length },
      bloques: r.length ? [tabla(`Catálogo · «${String(a.texto).slice(0, 40)}»`, [['Código'], ['Producto'], ['Marca'], ['Precio (con IGV)', 'right']], r.map((p) => [p.codigo ?? 'Sin código', p.nombre, p.marca ?? 'Sin dato', p.moneda === 'USD' ? `${soles(p.precio, 'USD')}${precioEnSoles(p, tc) ? ` (${soles(precioEnSoles(p, tc))})` : ''}` : soles(p.precio)]))] : [],
    };
  },
};

const ver_kits = {
  nombre: 'ver_kits', fuente: 'Kits', modulo: 'cotizacion',
  descripcion: 'Lista los kits de venta de ICR (paquetes armados de productos) con su total. Úsala si el pedido se parece a un kit.',
  parametros: { type: 'object', properties: { texto: { type: 'string', description: 'Filtro opcional por nombre' } } },
  async ejecutar(a) {
    const t = normalizar(a.texto ?? '');
    const ks = (await listarKits()).filter((k) => !t || normalizar(`${k.nombre} ${k.descripcion ?? ''}`).split(/\s+/).some((w) => w.length > 2 && t.includes(w)) || normalizar(k.nombre).includes(t)).slice(0, 10);
    return { modelo: { kits: ks.map((k) => ({ kit_id: k.id, nombre: k.nombre, descripcion: k.descripcion, items: k.n_items, total: k.totales ? `S/ ${k.totales.total}` : 'Sin dato (falta algún precio)' })) }, bloques: [] };
  },
};

const proponer_cotizacion = {
  nombre: 'proponer_cotizacion', fuente: 'Generado por IA', modulo: 'cotizacion', final: true,
  descripcion: 'Propone la cotización final. Usa los CÓDIGOS de buscar_productos (o kit_id de ver_kits). NO pongas precios: el sistema los toma del catálogo. Para mano de obra u otros servicios sin código, usa solo «descripcion».',
  parametros: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Título corto, por ejemplo «Híbrido 10 kW · bodega Cerro Colorado»' },
      kit_id: { type: 'integer', description: 'Opcional: kit base' },
      items: { type: 'array', items: { type: 'object', properties: { codigo: { type: 'string' }, descripcion: { type: 'string' }, cantidad: { type: 'number' } }, required: ['cantidad'] } },
    },
    required: ['titulo', 'items'],
  },
  async ejecutar(a, { tc }) {
    const lineas = [];
    const notas = [];
    if (Number.isInteger(Number(a.kit_id)) && Number(a.kit_id) > 0) {
      try {
        const k = await detalleKit(Number(a.kit_id));
        for (const i of k.items) lineas.push({ producto_id: i.producto_id ?? null, codigo: i.codigo ?? null, descripcion: i.descripcion, unidad: i.unidad ?? null, cantidad: i.cantidad, precio_unitario: i.precio_efectivo, origen: `Kit ${k.nombre}` });
      } catch {
        notas.push('El kit indicado no existe.');
      }
    }
    for (const it of Array.isArray(a.items) ? a.items.slice(0, 60) : []) {
      let cant = Number(it?.cantidad);
      if (!(cant > 0) || cant > 100000) cant = 1;
      const cantidad = (Math.round(cant * 100) / 100).toFixed(2);
      const p = (it?.codigo && (await productoExacto(String(it.codigo).replace(/^ID(\d+)$/, '$1')))) || (it?.descripcion && (await productoExacto(String(it.descripcion)))) || null;
      if (p) lineas.push({ producto_id: p.id, codigo: p.codigo, descripcion: p.nombre, unidad: p.unidad, cantidad, precio_unitario: precioEnSoles(p, tc), origen: 'Catálogo', moneda_original: p.moneda, ...(p.moneda === 'USD' && !tc ? { nota: 'En US$ y no hay tipo de cambio en Configuración' } : {}) });
      else {
        const desc = String(it?.descripcion || it?.codigo || '').trim().slice(0, 255);
        if (desc) lineas.push({ producto_id: null, codigo: null, descripcion: desc, unidad: null, cantidad, precio_unitario: null, origen: it?.codigo ? 'No está en el catálogo' : 'Servicio o ítem libre' });
      }
    }
    const conPrecio = lineas.filter((l) => l.precio_unitario !== null);
    let totales = null;
    if (conPrecio.length) {
      const c = calcular(conPrecio.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario })));
      totales = c.totales;
      let k = 0;
      for (const l of lineas) if (l.precio_unitario !== null) l.importe = c.lineas[k++].importe;
    }
    for (const l of lineas) if (l.precio_unitario === null) l.importe = null;
    const sinPrecio = lineas.filter((l) => l.precio_unitario === null);
    const tarjeta = { titulo: String(a.titulo ?? 'Cotización propuesta').slice(0, 120), items: lineas, totales, faltan_precios: sinPrecio.length, tipo_cambio: lineas.some((l) => l.moneda_original === 'USD') ? tc : null, fecha_precios: hoyLima(), notas };
    return {
      tarjeta,
      modelo: { ok: lineas.length > 0, items: lineas.length, total_con_igv: totales ? `S/ ${totales.total}` : null, sin_precio: sinPrecio.map((l) => l.descripcion), aviso: 'Explica brevemente la propuesta. No repitas la lista ni inventes precios: la tarjeta ya los muestra.' },
      bloques: [],
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Asistente IA
// ---------------------------------------------------------------------------------------------

const resumen_finanzas = {
  nombre: 'resumen_finanzas', fuente: 'Contabilidad', modulo: 'contabilidad',
  descripcion: 'Ingresos, egresos y flujo neto de la cuenta principal en un mes (por defecto el actual), comparado con el mes anterior, y egresos por categoría y por proyecto.',
  parametros: { type: 'object', properties: { mes: { type: 'string', description: 'AAAA-MM' } } },
  async ejecutar(a) {
    const r = await resumenConta({ mes: mesValido(a.mes) });
    const k = r.kpis;
    const neto = deCentimos(aCentimos(k.ingresos_mes) - aCentimos(k.egresos_mes));
    const netoAnt = deCentimos(aCentimos(k.ingresos_mes_anterior) - aCentimos(k.egresos_mes_anterior));
    return {
      modelo: { mes: r.mes, cuenta: r.cuenta?.nombre ?? null, saldo_actual: r.cuenta?.saldo ?? null, ingresos: k.ingresos_mes, egresos: k.egresos_mes, flujo_neto: neto, ingresos_mes_anterior: k.ingresos_mes_anterior, egresos_mes_anterior: k.egresos_mes_anterior, variacion_ingresos: pct(k.ingresos_mes, k.ingresos_mes_anterior), variacion_egresos: pct(k.egresos_mes, k.egresos_mes_anterior), egresos_por_categoria: r.egresos_por_categoria.slice(0, 8), egresos_por_proyecto: r.egresos_por_proyecto.slice(0, 5).map((p) => ({ proyecto: p.nombre, total: p.total })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: `Ingresos ${r.mes}`, v: soles(k.ingresos_mes), c: 'primario' }, { l: `Egresos ${r.mes}`, v: soles(k.egresos_mes), c: 'peligro' }, { l: 'Flujo neto', v: soles(neto) }, { l: 'Ingresos vs. mes anterior', v: pct(k.ingresos_mes, k.ingresos_mes_anterior) }] },
        ...(r.egresos_por_categoria.length ? [barras(`Egresos por categoría · ${r.mes}`, r.egresos_por_categoria.slice(0, 8).map((c) => [c.categoria, c.monto]))] : []),
        tabla('Flujo de los últimos meses', [['Mes'], ['Ingresos', 'right'], ['Egresos', 'right'], ['Neto', 'right']], r.flujo.map((f) => [f.mes, soles(f.ingresos), soles(f.egresos), soles(deCentimos(aCentimos(f.ingresos) - aCentimos(f.egresos)))])),
      ],
      extra: { neto_anterior: netoAnt },
    };
  },
};

const movimientos_cuenta = {
  nombre: 'movimientos_cuenta', fuente: 'Contabilidad', modulo: 'contabilidad',
  descripcion: 'Movimientos de la cuenta principal con filtros (fechas, ingreso/egreso, categoría o texto). Devuelve los totales ya sumados.',
  parametros: { type: 'object', properties: { desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' }, tipo: { type: 'string', enum: ['ingreso', 'egreso'] }, categoria: { type: 'string' }, texto: { type: 'string' } } },
  async ejecutar(a) {
    const f = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? v : undefined);
    const r = await listarMovimientos({ desde: f(a.desde), hasta: f(a.hasta), tipo: ['ingreso', 'egreso'].includes(a.tipo) ? a.tipo : undefined, categoria: a.categoria || undefined, q: a.texto || undefined });
    const m = r.movimientos.filter((x) => !x.anulado);
    return {
      modelo: { cuenta: r.cuenta?.nombre ?? null, cantidad: m.length, total_ingresos: r.totales.ingresos, total_egresos: r.totales.egresos, primeros: m.slice(0, 15).map((x) => ({ fecha: x.fecha, tipo: x.tipo, concepto: x.concepto, categoria: x.categoria, monto: x.monto, proyecto: x.proyecto_nombre ?? null })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: 'Movimientos', v: String(m.length) }, { l: 'Ingresos', v: soles(r.totales.ingresos), c: 'primario' }, { l: 'Egresos', v: soles(r.totales.egresos), c: 'peligro' }] },
        ...(m.length ? [tabla('Movimientos de la cuenta principal', [['Fecha'], ['Concepto'], ['Categoría'], ['Monto', 'right']], m.slice(0, 20).map((x) => [fechaPe(x.fecha), x.concepto, x.categoria ?? 'Sin dato', `${x.tipo === 'ingreso' ? '+' : '−'} ${soles(x.monto)}`]))] : []),
      ],
    };
  },
};

const proyectos = {
  nombre: 'proyectos', fuente: 'Proyectos', modulo: 'proyectos',
  descripcion: 'Proyectos con su presupuesto, lo gastado y el % usado. Filtra por estado (activo, pausado, finalizado) o texto.',
  parametros: { type: 'object', properties: { estado: { type: 'string', enum: ['activo', 'pausado', 'finalizado'] }, texto: { type: 'string' } } },
  async ejecutar(a) {
    const r = await listarProyectos({ estado: a.estado, q: a.texto });
    const ps = r.proyectos;
    return {
      modelo: { conteo_por_estado: r.conteo, proyectos: ps.slice(0, 20).map((p) => ({ codigo: p.codigo, nombre: p.nombre, estado: p.estado, causa_pausa: p.causa_pausa, presupuesto: p.presupuesto, gastado: p.gastado, porcentaje: p.porcentaje })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: 'Activos', v: String(r.conteo.activo) }, { l: 'Pausados', v: String(r.conteo.pausado) }, { l: 'Finalizados', v: String(r.conteo.finalizado) }] },
        ...(ps.length ? [tabla('Proyectos', [['Proyecto'], ['Estado'], ['Presupuesto', 'right'], ['Gastado', 'right'], ['%', 'right']], ps.slice(0, 20).map((p) => [`${p.codigo} · ${p.nombre}`, p.estado, soles(p.presupuesto), soles(p.gastado), p.porcentaje === null ? 'Sin dato' : `${p.porcentaje}%`]))] : []),
      ],
    };
  },
};

const gastos_proyecto = {
  nombre: 'gastos_proyecto', fuente: 'Proyectos', modulo: 'proyectos', fuentesExtra: ['Caja chica'],
  descripcion: 'Detalle de gastos de UN proyecto (por código PRY-001 o nombre): presupuesto, gastado, por categoría, de dónde salió y cuántos no tienen comprobante.',
  parametros: { type: 'object', properties: { proyecto: { type: 'string', description: 'Código o nombre del proyecto' } }, required: ['proyecto'] },
  async ejecutar(a) {
    const t = String(a.proyecto ?? '').trim();
    const { rows } = await consulta(`SELECT id FROM proyectos WHERE lower(codigo) = lower($1) OR translate(lower(nombre), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($1), 'áéíóúüñ', 'aeiouun') || '%' ORDER BY id DESC LIMIT 1`, [t]);
    if (!rows[0]) return { modelo: { error: `No hay un proyecto que coincida con «${t}».` }, bloques: [] };
    const d = await detalleProyecto(rows[0].id);
    const p = d.proyecto;
    const sinComp = d.gastos.filter((g) => !g.comprobante && !(g.adjuntos ?? []).length).length;
    const porOrigen = ['cuenta_principal', 'caja_chica', 'caja_diaria'].map((o) => [o, sumar(d.gastos.filter((g) => g.origen === o).map((g) => g.monto))]);
    const nombreOrigen = { cuenta_principal: 'Cuenta principal', caja_chica: 'Caja chica', caja_diaria: 'Caja diaria' };
    return {
      modelo: { proyecto: `${p.codigo} · ${p.nombre}`, estado: p.estado, presupuesto: p.presupuesto, gastado: p.gastado, saldo: p.saldo, porcentaje: p.porcentaje, por_categoria: d.categorias, por_origen: Object.fromEntries(porOrigen.map(([o, t2]) => [nombreOrigen[o], t2])), gastos: d.gastos.length, gastos_sin_comprobante: sinComp },
      bloques: [
        { tipo: 'kpis', items: [{ l: 'Presupuesto', v: soles(p.presupuesto) }, { l: 'Gastado', v: soles(p.gastado), c: 'peligro' }, { l: '% usado', v: p.porcentaje === null ? 'Sin dato' : `${p.porcentaje}%` }, { l: 'Sin comprobante', v: String(sinComp) }] },
        ...(d.categorias.length ? [barras(`Gasto por categoría · ${p.codigo}`, d.categorias.map((c) => [c.categoria, c.monto]))] : []),
        ...(d.gastos.length ? [tabla(`Últimos gastos · ${p.codigo}`, [['Fecha'], ['Concepto'], ['Origen'], ['Monto', 'right']], d.gastos.slice(0, 15).map((g) => [fechaPe(g.fecha), g.concepto ?? 'Sin dato', nombreOrigen[g.origen], soles(g.monto)]))] : []),
      ],
    };
  },
};

const cotizaciones = {
  nombre: 'cotizaciones', fuente: 'Cotización', modulo: 'cotizacion',
  descripcion: 'Cotizaciones con filtros (estado borrador/enviada/aceptada/rechazada, fechas, cliente). Devuelve cantidad y monto total ya sumado.',
  parametros: { type: 'object', properties: { estado: { type: 'string', enum: ['borrador', 'enviada', 'aceptada', 'rechazada'] }, desde: { type: 'string' }, hasta: { type: 'string' }, cliente: { type: 'string' } } },
  async ejecutar(a) {
    const f = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? v : null);
    const { rows } = await consulta(
      `SELECT numero, cliente, estado, fecha::date::text AS fecha, total::text AS total FROM cotizaciones
        WHERE ($1::text IS NULL OR estado = $1) AND ($2::date IS NULL OR fecha::date >= $2) AND ($3::date IS NULL OR fecha::date <= $3)
          AND ($4::text IS NULL OR translate(lower(cliente), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($4), 'áéíóúüñ', 'aeiouun') || '%')
        ORDER BY fecha DESC LIMIT 200`,
      [['borrador', 'enviada', 'aceptada', 'rechazada'].includes(a.estado) ? a.estado : null, f(a.desde), f(a.hasta), a.cliente ? String(a.cliente).slice(0, 80) : null],
    );
    const total = sumar(rows.map((r) => r.total));
    return {
      modelo: { cantidad: rows.length, monto_total: total, por_estado: Object.fromEntries(['borrador', 'enviada', 'aceptada', 'rechazada', null].map((e) => [e ?? 'sin_estado', rows.filter((r) => r.estado === e).length])), ultimas: rows.slice(0, 10).map((r) => ({ ...r, total: monto(r.total) })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: 'Cotizaciones', v: String(rows.length) }, { l: 'Monto total', v: soles(total), c: 'primario' }, { l: 'Aceptadas', v: String(rows.filter((r) => r.estado === 'aceptada').length) }] },
        ...(rows.length ? [tabla('Cotizaciones', [['N.º'], ['Cliente'], ['Estado'], ['Fecha'], ['Total', 'right']], rows.slice(0, 20).map((r) => [r.numero, r.cliente || 'Sin nombre', r.estado ?? 'Logística', fechaPe(r.fecha), soles(monto(r.total))]))] : []),
      ],
    };
  },
};

const comprobantes = {
  nombre: 'comprobantes', fuente: 'Facturación SUNAT', modulo: 'facturacion',
  descripcion: 'Boletas y facturas (estado borrador/enviado/emitido/anulado) de un mes. Devuelve el total emitido ya sumado y por cliente.',
  parametros: { type: 'object', properties: { mes: { type: 'string', description: 'AAAA-MM' }, estado: { type: 'string', enum: ['borrador', 'enviado', 'emitido', 'anulado'] } } },
  async ejecutar(a) {
    const mes = mesValido(a.mes);
    const todos = (await listarComprobantes()).comprobantes.filter((c) => (c.fecha_emision ?? c.creado_en).startsWith(mes) && (!a.estado || c.estado === a.estado));
    const emitidos = todos.filter((c) => c.estado === 'emitido' && c.moneda === 'PEN');
    const total = sumar(emitidos.map((c) => c.totales.total));
    const porCliente = {};
    for (const c of emitidos) porCliente[c.cliente_nombre ?? 'Sin nombre'] = sumar([porCliente[c.cliente_nombre ?? 'Sin nombre'], c.totales.total]);
    const top = Object.entries(porCliente).sort((x, y) => aCentimos(y[1]) - aCentimos(x[1])).slice(0, 8);
    return {
      modelo: { mes, comprobantes: todos.length, emitidos: emitidos.length, total_emitido_soles: total, por_cliente: Object.fromEntries(top) },
      bloques: [
        { tipo: 'kpis', items: [{ l: `Emitido ${mes}`, v: soles(total), c: 'primario' }, { l: 'Comprobantes emitidos', v: String(emitidos.length) }, { l: 'Ticket promedio', v: emitidos.length ? soles(deCentimos(Math.round(aCentimos(total) / emitidos.length))) : 'Sin dato' }] },
        ...(top.length ? [tabla(`Emitido por cliente · ${mes}`, [['Cliente'], ['Total', 'right']], top.map(([c, t]) => [c, soles(t)]), 0)] : []),
      ],
    };
  },
};

const caja_chica = {
  nombre: 'caja_chica', fuente: 'Caja chica', modulo: ['caja_chica', 'contabilidad'],
  descripcion: 'Caja chica (app de Finanzas): saldo por ciudad, ingresos y egresos del mes, gastos sin comprobante y últimos movimientos.',
  parametros: { type: 'object', properties: { mes: { type: 'string', description: 'AAAA-MM' } } },
  async ejecutar(a) {
    const r = await cajaChica({ mes: mesValido(a.mes) });
    if (!r.disponible) return { modelo: { error: 'La caja chica no está disponible en este servidor.' }, bloques: [] };
    return {
      modelo: { mes: r.mes, saldo_total: r.saldo_total, saldos: r.saldos, ingresos_mes: r.ingresos_mes, egresos_mes: r.egresos_mes, gastos_mes: r.gastos_mes, sin_comprobante: r.sin_comprobante_mes, ultimos: r.movimientos.slice(0, 10).map((m) => ({ fecha: m.fecha, tipo: m.tipo, descripcion: m.descripcion, monto: m.monto, ciudad: m.ciudad })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: 'Saldo total', v: soles(r.saldo_total) }, { l: `Egresos ${r.mes}`, v: soles(r.egresos_mes), c: 'peligro' }, { l: 'Sin comprobante', v: String(r.sin_comprobante_mes) }] },
        tabla('Últimos movimientos de caja chica', [['Fecha'], ['Descripción'], ['Ciudad'], ['Monto', 'right']], r.movimientos.slice(0, 12).map((m) => [fechaPe(m.fecha), m.descripcion ?? 'Sin dato', m.ciudad, `${m.tipo === 'EGRESO' ? '−' : '+'} ${soles(m.monto)}`])),
      ],
    };
  },
};

const requerimientos = {
  nombre: 'requerimientos', fuente: 'Logística', modulo: ['logistica', 'almacen'],
  descripcion: 'Requerimientos de materiales de la app Logística (pendiente, aprobado, listo, entregado), con los urgentes.',
  parametros: { type: 'object', properties: { estado: { type: 'string', enum: ['pendiente', 'aprobado', 'listo', 'entregado'] } } },
  async ejecutar(a) {
    const { rows } = await consulta(
      `SELECT numero, obra, solicitante, estado, urgente, fecha_creacion::date::text AS fecha FROM requerimientos WHERE ($1::text IS NULL OR estado = $1) ORDER BY fecha_creacion DESC LIMIT 50`,
      [['pendiente', 'aprobado', 'listo', 'entregado'].includes(a.estado) ? a.estado : null],
    );
    return {
      modelo: { cantidad: rows.length, urgentes: rows.filter((r) => r.urgente && r.estado !== 'entregado').length, lista: rows.slice(0, 15) },
      bloques: rows.length ? [tabla('Requerimientos', [['N.º'], ['Obra'], ['Solicitante'], ['Estado'], ['Fecha']], rows.slice(0, 20).map((r) => [r.numero, r.obra, r.solicitante, `${r.estado}${r.urgente ? ' · urgente' : ''}`, fechaPe(r.fecha)]))] : [],
    };
  },
};

export const HERRAMIENTAS = {
  cotizador: [buscar_productos, ver_kits, proponer_cotizacion],
  asistente: [resumen_finanzas, movimientos_cuenta, proyectos, gastos_proyecto, cotizaciones, comprobantes, caja_chica, requerimientos, buscar_productos],
};

/** Formato de Ollama para la lista de herramientas. */
export const paraOllama = (lista) => lista.map((h) => ({ type: 'function', function: { name: h.nombre, description: h.descripcion, parameters: h.parametros } }));

async function puedeUsar(u, h) {
  for (const m of [h.modulo].flat()) if (await tieneNivel(u, m, 'lectura')) return true;
  return false;
}

/** Ejecuta una herramienta pedida por el modelo, respetando los permisos de quien pregunta. Nunca lanza: los errores vuelven al modelo. */
export async function ejecutarHerramienta(lista, nombre, args, u) {
  const h = lista.find((x) => x.nombre === nombre);
  if (!h) return { modelo: { error: `La herramienta «${nombre}» no existe. Usa solo las de la lista.` }, bloques: [] };
  if (!(await puedeUsar(u, h))) return { ...sinPermiso(h.fuente), fuente: null };
  const tc = (await leerParametros()).tipo_cambio?.valor ?? null;
  try {
    const r = await h.ejecutar(args ?? {}, { u, tc });
    return { ...r, fuente: h.fuente, fuentesExtra: h.fuentesExtra ?? [], final: !!h.final };
  } catch (e) {
    return { modelo: { error: `No se pudieron leer los datos: ${e?.message ?? 'error'}` }, bloques: [], fuente: h.fuente, fallo: true };
  }
}

/** Lista de herramientas que la persona puede usar (las demás ni se le muestran al modelo). */
export async function herramientasDe(modulo, u) {
  const out = [];
  for (const h of HERRAMIENTAS[modulo]) if (await puedeUsar(u, h)) out.push(h);
  return out;
}
