// Herramientas que puede usar la IA. TODAS SON DE SOLO LECTURA: ninguna escribe en la base.
// Cada una revisa el permiso de quien pregunta (la IA ve solo lo que esa persona puede ver) y los totales los calcula el servidor:
// el modelo recibe los números ya hechos y la pantalla muestra tablas y gráficos armados aquí, nunca por el modelo.
import { leerParametros } from '../configuracion.js';
import { cajaChica, listarMovimientos, resumen as resumenConta } from '../contabilidad.js';
import { calcular } from '../cotizar.js';
import { consulta } from '../db.js';
import { aCentimos, deCentimos, monto } from '../dinero.js';
import { listarArticulos } from '../almacen.js';
import { calcularGuiada } from './guiada.js';
import { buscar as buscarEnProveedores } from '../comparador.js';
import { listarComprobantes } from '../facturacion.js';
import { detalleKit, listarKits } from '../kits.js';
import { tieneNivel } from '../permisos.js';
import { detalleProyecto, listarProyectos } from '../proyectos.js';
import { buscarProductos, normalizar, productoExacto, productoPorId } from './indice.js';

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

/** Arma la tarjeta de una propuesta (precios del catálogo, totales del servidor). La usa también la cotización guiada. */
export const armarPropuesta = (titulo, items, tc) => proponer_cotizacion.ejecutar({ titulo, items }, { tc });

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
      const p = (Number.isInteger(Number(it?.producto_id)) && Number(it.producto_id) > 0 && (await productoPorId(it.producto_id)))
        || (it?.codigo && (await productoExacto(String(it.codigo).replace(/^ID(\d+)$/, '$1')))) || (it?.descripcion && (await productoExacto(String(it.descripcion)))) || null;
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
      modelo: { mes: r.mes, cuenta: r.cuenta?.nombre ?? null, saldo_actual: soles(r.cuenta?.saldo ?? null), ingresos: soles(k.ingresos_mes), egresos: soles(k.egresos_mes), flujo_neto: soles(neto), ingresos_mes_anterior: soles(k.ingresos_mes_anterior), egresos_mes_anterior: soles(k.egresos_mes_anterior), variacion_ingresos: pct(k.ingresos_mes, k.ingresos_mes_anterior), variacion_egresos: pct(k.egresos_mes, k.egresos_mes_anterior), egresos_por_categoria: r.egresos_por_categoria.slice(0, 8).map((c) => ({ ...c, monto: soles(c.monto) })), egresos_por_proyecto: r.egresos_por_proyecto.slice(0, 5).map((p) => ({ proyecto: p.nombre, total: soles(p.total) })) },
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
      modelo: { cuenta: r.cuenta?.nombre ?? null, cantidad: m.length, total_ingresos: soles(r.totales.ingresos), total_egresos: soles(r.totales.egresos), primeros: m.slice(0, 15).map((x) => ({ fecha: x.fecha, tipo: x.tipo, concepto: x.concepto, categoria: x.categoria, monto: soles(x.monto), proyecto: x.proyecto_nombre ?? null })) },
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
      modelo: { conteo_por_estado: r.conteo, proyectos: ps.slice(0, 20).map((p) => ({ codigo: p.codigo, nombre: p.nombre, estado: p.estado, causa_pausa: p.causa_pausa, presupuesto: soles(p.presupuesto), gastado: soles(p.gastado), porcentaje: p.porcentaje })) },
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
      modelo: { proyecto: `${p.codigo} · ${p.nombre}`, estado: p.estado, presupuesto: soles(p.presupuesto), gastado: soles(p.gastado), saldo: soles(p.saldo), porcentaje: p.porcentaje, por_categoria: d.categorias.map((c) => ({ ...c, monto: soles(c.monto) })), por_origen: Object.fromEntries(porOrigen.map(([o, t2]) => [nombreOrigen[o], soles(t2)])), gastos: d.gastos.length, gastos_sin_comprobante: sinComp },
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
      modelo: { cantidad: rows.length, monto_total: soles(total), por_estado: Object.fromEntries(['borrador', 'enviada', 'aceptada', 'rechazada', null].map((e) => [e ?? 'sin_estado', rows.filter((r) => r.estado === e).length])), ultimas: rows.slice(0, 10).map((r) => ({ ...r, total: soles(monto(r.total)) })) },
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
      modelo: { mes, comprobantes: todos.length, emitidos: emitidos.length, total_emitido: soles(total), por_cliente: Object.fromEntries(top.map(([c, t2]) => [c, soles(t2)])) },
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
      modelo: { mes: r.mes, saldo_total: soles(r.saldo_total), saldos: r.saldos.map((s) => ({ ...s, saldo: soles(s.saldo) })), ingresos_mes: soles(r.ingresos_mes), egresos_mes: soles(r.egresos_mes), gastos_mes: r.gastos_mes, sin_comprobante: r.sin_comprobante_mes, ultimos: r.movimientos.slice(0, 10).map((m) => ({ fecha: m.fecha, tipo: m.tipo, descripcion: m.descripcion, monto: m.monto, ciudad: m.ciudad })) },
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

// ---------------------------------------------------------------------------------------------
// IA de la app de Finanzas (Fase 7): caja diaria (efectivo y Yape) y caja chica, de Arequipa (AQP) y Moquegua (MOQ)
// ---------------------------------------------------------------------------------------------

const CIUDAD = { AQP: 'Arequipa', MOQ: 'Moquegua' };
const ciudadDe = (v) => {
  const t = normalizar(v ?? '').trim();
  if (!t) return null;
  if (t.startsWith('aq') || t.startsWith('areq')) return 'AQP';
  if (t.startsWith('mo')) return 'MOQ';
  return null;
};
const isoMas = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Período pedido → { desde, hasta, texto }. Por defecto, el mes actual. */
export function rangoDe(a = {}, hoy = hoyLima()) {
  const f = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? v : null);
  let desde;
  let hasta = hoy;
  if (f(a.desde) || f(a.hasta)) {
    desde = f(a.desde) ?? f(a.hasta);
    hasta = f(a.hasta) ?? hoy;
  } else {
    const dia = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
    switch (a.periodo) {
      case 'hoy': desde = hoy; break;
      case 'ayer': desde = hasta = isoMas(hoy, -1); break;
      case 'semana': desde = isoMas(hoy, -dia); break;
      case 'semana_anterior': desde = isoMas(hoy, -dia - 7); hasta = isoMas(hoy, -dia - 1); break;
      case 'mes_anterior': { const ini = `${hoy.slice(0, 7)}-01`; hasta = isoMas(ini, -1); desde = `${hasta.slice(0, 7)}-01`; break; }
      default: desde = `${hoy.slice(0, 7)}-01`;
    }
  }
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta, texto: desde === hasta ? `el ${fechaPe(desde)}` : `del ${fechaPe(desde)} al ${fechaPe(hasta)}` };
}
const PERIODO = { type: 'string', enum: ['hoy', 'ayer', 'semana', 'semana_anterior', 'mes', 'mes_anterior'], description: 'Período (por defecto «mes», el mes actual). «semana» = desde el lunes.' };
const FECHAS = { desde: { type: 'string', description: 'AAAA-MM-DD (si se pide un rango exacto)' }, hasta: { type: 'string', description: 'AAAA-MM-DD' } };
const CIUDAD_P = { type: 'string', enum: ['AQP', 'MOQ'], description: 'Ciudad: AQP = Arequipa, MOQ = Moquegua. Vacío = ambas.' };
const contar = (lista, k) => {
  const r = {};
  for (const x of lista) r[x[k] ?? 'Sin categoría'] = sumar([r[x[k] ?? 'Sin categoría'], x.monto]);
  return Object.entries(r).sort((a, b) => aCentimos(b[1]) - aCentimos(a[1]));
};

const gastos_caja_chica = {
  nombre: 'gastos_caja_chica', fuente: 'Caja chica', modulo: ['caja_chica', 'contabilidad'],
  descripcion: 'Gastos (egresos) de la caja chica en un período: total ya sumado, por categoría y ciudad, cuántos no tienen foto del recibo y la lista. Filtros: ciudad, categoría, persona, texto, solo sin recibo.',
  parametros: { type: 'object', properties: { periodo: PERIODO, ...FECHAS, ciudad: CIUDAD_P, categoria: { type: 'string', description: 'Ej. movilidad, alimentación, materiales' }, persona: { type: 'string' }, texto: { type: 'string' }, sin_recibo: { type: 'boolean', description: 'Solo los que no tienen foto del recibo' } } },
  async ejecutar(a) {
    const r = rangoDe(a);
    const ciudad = ciudadDe(a.ciudad);
    const { rows } = await consulta(
      `SELECT m.ciudad, m.fecha::text AS fecha, m.descripcion, m.persona, COALESCE(m.subcategoria, m.categoria) AS categoria, m.categoria AS grupo, m.monto::text AS monto,
              m.proyecto_nombre, EXISTS (SELECT 1 FROM caja_adjunto x WHERE x.movimiento_id = m.id) AS con_recibo
         FROM caja_chica_mov m
        WHERE m.tipo = 'EGRESO' AND m.deleted_at IS NULL AND m.fecha BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR m.ciudad = $3)
        ORDER BY m.fecha DESC, m.created_at DESC`,
      [r.desde, r.hasta, ciudad],
    );
    const t = (v) => normalizar(v ?? '').trim();
    const lista = rows.filter((m) => (!a.categoria || t(`${m.categoria} ${m.grupo}`).includes(t(a.categoria))) && (!a.persona || t(m.persona).includes(t(a.persona)))
      && (!a.texto || t(`${m.descripcion} ${m.persona} ${m.categoria} ${m.proyecto_nombre ?? ''}`).includes(t(a.texto))) && (!a.sin_recibo || !m.con_recibo));
    const total = sumar(lista.map((m) => m.monto));
    const porCat = contar(lista, 'categoria');
    const sinRecibo = lista.filter((m) => !m.con_recibo);
    return {
      modelo: { periodo: r.texto, ciudad: ciudad ? CIUDAD[ciudad] : 'Arequipa y Moquegua', total_gastado: soles(total), cantidad: lista.length, por_categoria: Object.fromEntries(porCat.slice(0, 10).map(([c, v]) => [c, soles(v)])),
        por_ciudad: Object.fromEntries(contar(lista, 'ciudad').map(([c, v]) => [CIUDAD[c] ?? c, soles(v)])), sin_recibo: sinRecibo.length, total_sin_recibo: soles(sumar(sinRecibo.map((m) => m.monto))),
        gastos: lista.slice(0, 12).map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, persona: m.persona || null, categoria: m.categoria, ciudad: CIUDAD[m.ciudad], monto: soles(m.monto), recibo: m.con_recibo })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: `Gastado ${r.texto}`, v: soles(total), c: 'peligro' }, { l: 'Gastos', v: String(lista.length) }, { l: 'Sin foto del recibo', v: String(sinRecibo.length) }] },
        ...(porCat.length ? [barras('Por categoría', porCat.slice(0, 8))] : []),
        ...(lista.length ? [tabla('Gastos de caja chica', [['Fecha'], ['Descripción'], ['Ciudad'], ['Monto', 'right'], ['Recibo']], lista.slice(0, 20).map((m) => [fechaPe(m.fecha), m.descripcion, CIUDAD[m.ciudad], soles(m.monto), m.con_recibo ? 'Sí' : 'No']))] : []),
      ],
    };
  },
};

const caja_diaria = {
  nombre: 'caja_diaria', fuente: 'Caja diaria', modulo: ['caja_chica', 'contabilidad'],
  descripcion: 'Caja diaria en un período: ingresos y salidas en efectivo y por transferencia, movimientos de Yape (cta. cte.), gastos por categoría, salidas sin comprobante y los saldos al final.',
  parametros: { type: 'object', properties: { periodo: PERIODO, ...FECHAS, ciudad: CIUDAD_P, texto: { type: 'string' } } },
  async ejecutar(a) {
    const r = rangoDe(a);
    const ciudad = ciudadDe(a.ciudad);
    const { rows } = await consulta(
      `SELECT h.ciudad, h.fecha::text AS fecha, f.descripcion, f.responsable, f.comprobante, f.interno, COALESCE(f.subcategoria, f.categoria) AS categoria,
              f.caja_ingreso_efectivo::text AS ie, f.caja_ingreso_transf::text AS it, f.caja_salida_efectivo::text AS se, f.caja_salida_transf::text AS st,
              f.cta_cte_ingreso::text AS yi, f.cta_cte_salida::text AS ys, EXISTS (SELECT 1 FROM caja_adjunto x WHERE x.fila_id = f.id) AS con_foto
         FROM caja_fila f JOIN caja_hoja h ON h.id = f.hoja_id
        WHERE f.deleted_at IS NULL AND h.fecha BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR h.ciudad = $3)
        ORDER BY h.fecha DESC, f.orden`,
      [r.desde, r.hasta, ciudad],
    );
    const t = (v) => normalizar(v ?? '').trim();
    const filas = rows.filter((f) => !a.texto || t(`${f.descripcion} ${f.responsable} ${f.categoria ?? ''}`).includes(t(a.texto)));
    const s = (k) => sumar(filas.map((f) => f[k]));
    const gastos = filas.filter((f) => !f.interno).map((f) => ({ ...f, monto: sumar([f.se, f.st, f.ys]) })).filter((f) => aCentimos(f.monto) > 0);
    const sinComp = gastos.filter((f) => f.comprobante === 'NINGUNO' && !f.con_foto);
    const { rows: sal } = await consulta(
      `SELECT DISTINCT ON (ciudad) ciudad, fecha::text AS fecha, saldo_final_caja::text AS efectivo, saldo_final_cta_cte::text AS yape
         FROM v_caja_hoja_resumen WHERE fecha <= $1::date AND ($2::text IS NULL OR ciudad = $2) ORDER BY ciudad, fecha DESC`,
      [r.hasta, ciudad],
    );
    const porCat = contar(gastos, 'categoria');
    return {
      modelo: { periodo: r.texto, ciudad: ciudad ? CIUDAD[ciudad] : 'Arequipa y Moquegua', ingresos_efectivo: soles(s('ie')), ingresos_transferencia: soles(s('it')), salidas_efectivo: soles(s('se')), salidas_transferencia: soles(s('st')),
        yape_ingresos: soles(s('yi')), yape_salidas: soles(s('ys')), gastos_reales: soles(sumar(gastos.map((g) => g.monto))), gastos_por_categoria: Object.fromEntries(porCat.slice(0, 10).map(([c, v]) => [c, soles(v)])),
        salidas_sin_comprobante: sinComp.length, saldos_al_cierre: sal.map((x) => ({ ciudad: CIUDAD[x.ciudad], dia: x.fecha, efectivo: soles(x.efectivo), yape: soles(x.yape) })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: 'Ingresos (efectivo + transf.)', v: soles(sumar([s('ie'), s('it')])), c: 'primario' }, { l: 'Salidas (efectivo + transf.)', v: soles(sumar([s('se'), s('st')])), c: 'peligro' }, { l: 'Yape: entró / salió', v: `${soles(s('yi'))} / ${soles(s('ys'))}` }, { l: 'Sin comprobante', v: String(sinComp.length) }] },
        ...(porCat.length ? [barras('Gastos por categoría', porCat.slice(0, 8))] : []),
        ...(sal.length ? [tabla('Saldos al cierre', [['Ciudad'], ['Día'], ['Efectivo', 'right'], ['Yape', 'right']], sal.map((x) => [CIUDAD[x.ciudad], fechaPe(x.fecha), soles(x.efectivo), soles(x.yape)]))] : []),
      ],
    };
  },
};

const saldos_caja = {
  nombre: 'saldos_caja', fuente: 'Caja diaria', modulo: ['caja_chica', 'contabilidad'], fuentesExtra: ['Caja chica'],
  descripcion: 'Saldos actuales: caja chica por ciudad, y efectivo y Yape de la caja diaria según el último día registrado.',
  parametros: { type: 'object', properties: {} },
  async ejecutar() {
    const { rows: ch } = await consulta('SELECT ciudad, saldo::text AS saldo FROM v_caja_chica_saldo ORDER BY ciudad');
    const { rows: di } = await consulta(`SELECT DISTINCT ON (ciudad) ciudad, fecha::text AS fecha, saldo_final_caja::text AS efectivo, saldo_final_cta_cte::text AS yape FROM v_caja_hoja_resumen ORDER BY ciudad, fecha DESC`);
    const filas = Object.keys(CIUDAD).map((c) => {
      const d = di.find((x) => x.ciudad === c);
      return [CIUDAD[c], soles(ch.find((x) => x.ciudad === c)?.saldo ?? null), d ? soles(d.efectivo) : 'Sin dato', d ? soles(d.yape) : 'Sin dato', d ? fechaPe(d.fecha) : 'Sin dato'];
    });
    return {
      modelo: { saldos: filas.map(([ciudad, chica, efectivo, yape, dia]) => ({ ciudad, caja_chica: chica, caja_diaria_efectivo: efectivo, yape, ultimo_dia_caja_diaria: dia })) },
      bloques: [
        { tipo: 'kpis', items: [{ l: 'Caja chica (total)', v: soles(sumar(ch.map((x) => x.saldo))) }, { l: 'Efectivo caja diaria', v: di.length ? soles(sumar(di.map((x) => x.efectivo))) : 'Sin dato' }, { l: 'Yape', v: di.length ? soles(sumar(di.map((x) => x.yape))) : 'Sin dato' }] },
        tabla('Saldos por ciudad', [['Ciudad'], ['Caja chica', 'right'], ['Efectivo', 'right'], ['Yape', 'right'], ['Último día']], filas),
      ],
    };
  },
};

const gastos_proyecto_caja = {
  nombre: 'gastos_proyecto_caja', fuente: 'Caja chica', modulo: ['caja_chica', 'contabilidad'], fuentesExtra: ['Caja diaria'],
  descripcion: 'Cuánto se gastó en UN proyecto (por código PRY-001 o nombre) desde la caja chica y la caja diaria. Si la persona puede ver Proyectos, también da el presupuesto y el total del proyecto.',
  parametros: { type: 'object', properties: { proyecto: { type: 'string', description: 'Código o nombre del proyecto' } }, required: ['proyecto'] },
  async ejecutar(a, { u }) {
    const q = String(a.proyecto ?? '').trim();
    const { rows: ps } = await consulta(`SELECT id, codigo, nombre FROM proyectos WHERE lower(codigo) = lower($1) OR translate(lower(nombre), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($1), 'áéíóúüñ', 'aeiouun') || '%' ORDER BY id DESC LIMIT 1`, [q]);
    const p = ps[0];
    if (!p) return { modelo: { error: `No hay un proyecto que coincida con «${q}».` }, bloques: [] };
    const { rows } = await consulta(
      `SELECT 'Caja chica' AS origen, m.fecha::text AS fecha, m.descripcion, m.ciudad, m.monto::text AS monto FROM caja_chica_mov m WHERE m.proyecto_id = $1 AND m.tipo = 'EGRESO' AND m.deleted_at IS NULL
       UNION ALL
       SELECT 'Caja diaria', h.fecha::text, f.descripcion, h.ciudad, (f.caja_salida_efectivo + f.caja_salida_transf + f.cta_cte_salida)::text FROM caja_fila f JOIN caja_hoja h ON h.id = f.hoja_id
        WHERE f.proyecto_id = $1 AND f.deleted_at IS NULL AND NOT f.interno AND (f.caja_salida_efectivo + f.caja_salida_transf + f.cta_cte_salida) > 0
       ORDER BY 2 DESC`,
      [p.id],
    );
    const total = sumar(rows.map((g) => g.monto));
    const modelo = { proyecto: `${p.codigo} · ${p.nombre}`, gastado_desde_cajas: soles(total), gastos: rows.length, por_origen: Object.fromEntries(contar(rows, 'origen').map(([o, v]) => [o, soles(v)])) };
    const kpis = [{ l: 'Desde las cajas', v: soles(total), c: 'peligro' }, { l: 'Gastos', v: String(rows.length) }];
    if (await tieneNivel(u, 'proyectos', 'lectura')) {
      const d = (await detalleProyecto(p.id)).proyecto;
      Object.assign(modelo, { presupuesto: soles(d.presupuesto), gastado_total_proyecto: soles(d.gastado), porcentaje_usado: d.porcentaje });
      kpis.push({ l: 'Presupuesto', v: soles(d.presupuesto) }, { l: '% usado (todo el proyecto)', v: d.porcentaje === null ? 'Sin dato' : `${d.porcentaje}%` });
    }
    return {
      modelo,
      bloques: [{ tipo: 'kpis', items: kpis }, ...(rows.length ? [tabla(`Gastos de ${p.codigo} desde las cajas`, [['Fecha'], ['Descripción'], ['Origen'], ['Monto', 'right']], rows.slice(0, 20).map((g) => [fechaPe(g.fecha), g.descripcion, `${g.origen} · ${CIUDAD[g.ciudad] ?? g.ciudad}`, soles(g.monto)]))] : [])],
    };
  },
};

const precios_proveedores = {
  nombre: 'precios_proveedores', fuente: 'Lista de proveedor', modulo: 'comparador',
  descripcion: 'Compara precios de un producto entre proveedores (listas y páginas web): costo en soles con IGV, cuál es el más barato con precio vigente y de cuándo es cada precio.',
  parametros: { type: 'object', properties: { producto: { type: 'string', description: 'Producto, modelo o código, por ejemplo «MultiPlus-II 48/3000»' } }, required: ['producto'] },
  async ejecutar(a) {
    const r = await buscarEnProveedores({ q: String(a.producto ?? '') });
    const filas = r.resultados.slice(0, 10);
    const mejor = filas.find((x) => x.id === r.mejor?.id);
    return {
      modelo: { referencia: r.referencia?.descripcion ?? null, mejor_opcion: mejor ? { proveedor: mejor.proveedor, costo_total: soles(mejor.total), fecha_precio: mejor.fecha_lista } : null, ahorro_vs_siguiente: r.mejor?.ahorro ? soles(r.mejor.ahorro) : null,
        resultados: filas.map((x) => ({ proveedor: x.proveedor, descripcion: x.descripcion, coincidencia: x.coincidencia, precio: soles(x.precio, x.moneda), en_soles_con_igv: soles(x.soles), costo_total: soles(x.total), vigente: x.vigente, fecha: x.fecha_lista })) },
      bloques: filas.length ? [tabla(`Precios de proveedores · «${String(a.producto).slice(0, 40)}»`, [['Proveedor'], ['Producto'], ['Coincidencia'], ['Precio', 'right'], ['Costo total S/', 'right'], ['Fecha']],
        filas.map((x) => [x.proveedor, x.descripcion, x.coincidencia, soles(x.precio, x.moneda), soles(x.total), `${fechaPe(x.fecha_lista)}${x.vigente ? '' : ' (desactualizado)'}`]), filas.findIndex((x) => x.id === r.mejor?.id) >= 0 ? filas.findIndex((x) => x.id === r.mejor?.id) : null)] : [],
    };
  },
};

const stock_almacen = {
  nombre: 'stock_almacen', fuente: 'Almacén', modulo: 'almacen',
  descripcion: 'Stock actual del almacén: cuánto hay de un artículo (o de todos los que están bajo su mínimo), su unidad y ubicación.',
  parametros: { type: 'object', properties: { articulo: { type: 'string', description: 'Nombre, código o categoría; vacío = solo los que están bajo el mínimo' } } },
  async ejecutar(a) {
    const q = String(a.articulo ?? '').trim();
    const r = await listarArticulos(q ? { q } : { bajo: '1' });
    const filas = r.articulos.slice(0, 15);
    return {
      modelo: { consulta: q || 'bajo el mínimo', articulos: filas.map((x) => ({ nombre: x.nombre, stock: `${x.stock} ${x.unidad}`, minimo: x.stock_minimo ?? 'Sin dato', bajo_minimo: x.bajo, ubicacion: x.ubicacion ?? 'Sin dato' })), total: r.articulos.length },
      bloques: filas.length ? [tabla(q ? `Stock · «${q.slice(0, 40)}»` : 'Artículos bajo su stock mínimo', [['Artículo'], ['Stock', 'right'], ['Mínimo', 'right'], ['Ubicación']],
        filas.map((x) => [x.nombre, `${x.stock} ${x.unidad}`, x.stock_minimo ?? 'Sin dato', x.ubicacion ?? 'Sin dato']), null)] : [],
    };
  },
};

const cotizacion_guiada = {
  nombre: 'cotizacion_guiada', fuente: 'Catálogo', modulo: 'cotizacion', final: true,
  descripcion: 'Arma la cotización de un sistema solar completo con reglas fijas (5.5 h de sol): paneles, inversor y, si es híbrido o aislado, baterías del catálogo, con precios y totales.',
  parametros: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['ongrid', 'hibrido', 'aislado'] },
      consumo_kwh_mes: { type: 'number', description: 'Consumo mensual en kWh, si se sabe' },
      potencia_kw: { type: 'number', description: 'Potencia del sistema en kW, si se sabe' },
      bateria_kwh: { type: 'number', description: 'Capacidad de baterías en kWh, si la piden' },
      horas_respaldo: { type: 'number', description: 'Horas de respaldo, si las piden' },
      marca: { type: 'string', description: 'Marca preferida, si la piden' },
    },
    required: ['tipo'],
  },
  async ejecutar(a) {
    try {
      const g = await calcularGuiada(a);
      return { tarjeta: g.tarjeta, modelo: { ok: true, resumen: g.texto, aviso: 'Explica la propuesta en 1 o 2 frases. No repitas la lista ni inventes precios: la tarjeta ya los muestra.' }, bloques: [] };
    } catch (e) {
      return { modelo: { error: e.message }, bloques: [] };
    }
  },
};

export const HERRAMIENTAS = {
  cotizador: [cotizacion_guiada, buscar_productos, ver_kits, proponer_cotizacion],
  asistente: [resumen_finanzas, movimientos_cuenta, proyectos, gastos_proyecto, cotizaciones, comprobantes, caja_chica, requerimientos, buscar_productos, precios_proveedores, stock_almacen],
  finanzas: [gastos_caja_chica, caja_diaria, saldos_caja, gastos_proyecto_caja],
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
