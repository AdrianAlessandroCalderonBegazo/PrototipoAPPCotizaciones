// Respuestas directas (sin IA): las preguntas frecuentes, o escritas parecido, se responden con una consulta fija
// en menos de un segundo. Se usan las mismas herramientas de solo lectura (con los permisos de quien pregunta) y la
// frase se arma aquí con los totales que da el servidor. Si la pregunta trae algo que no se reconoce, se deja a la IA.
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const mesAnterior = () => {
  const [a, m] = hoyLima().slice(0, 7).split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesTexto = (aaaamm) => (aaaamm ? `${NOMBRE_MES[Number(aaaamm.slice(5, 7)) - 1]} de ${aaaamm.slice(0, 4)}` : 'este mes');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Palabras que no cambian la consulta (se ignoran al decidir si se entendió todo).
const VACIAS = new Set(`a al algo alguno alguna algun ahora actual actuales aun ano anos cada como comparado con cual cuales cuando cuanto cuanta cuantos cuantas
  de del dame decir dime donde el ella en entre es esta estan este esto estos estas favor hay han ha hasta informe la las le les lista listado lo los me mi mis
  muestra mostrar mostrame nos nuestra nuestro nuestras nuestros o para pero por porfa porfavor puedes que quiero resumen reporte saber se segun si sin solo son
  su sus tal tenemos tengo tiene tienen todo todos todas total totales un una uno unos unas va van vamos ver y ya hola gracias cerca`.split(/\s+/).filter(Boolean));

const PERIODOS = [
  [/\b(semana (pasada|anterior))\b/, 'semana_anterior'], [/\b(mes (pasado|anterior))\b/, 'mes_anterior'],
  [/\bayer\b/, 'ayer'], [/\bhoy\b/, 'hoy'], [/\bsemana\b/, 'semana'], [/\bmes\b/, 'mes'],
];
const PALABRAS_PERIODO = ['semana', 'pasada', 'pasado', 'anterior', 'ayer', 'hoy', 'mes', 'esta', 'este'];
const CIUDADES = [[/\b(arequipa|aqp)\b/, 'AQP'], [/\b(moquegua|moq)\b/, 'MOQ']];
const PALABRAS_CIUDAD = ['arequipa', 'aqp', 'moquegua', 'moq', 'ciudad', 'ciudades', 'ambas'];
// Categorías de caja chica (las de la app de Finanzas) y cómo se escriben.
const CATEGORIAS = [['movilidad', 'movilidad'], ['material', 'material'], ['materiales', 'material'], ['oficina', 'oficina'], ['fletes', 'fletes'], ['flete', 'fletes'],
  ['viaticos', 'viaticos'], ['viatico', 'viaticos'], ['proveedores', 'proveedores'], ['equipos', 'equipos'], ['combustible', 'movilidad']];

const tokens = (t) => sinTildes(t).replace(/[^a-z0-9ñ\s/.-]/g, ' ').split(/\s+/).filter(Boolean);
const periodoDe = (n) => PERIODOS.find(([re]) => re.test(n))?.[1] ?? null;
const ciudadDe = (n) => CIUDADES.find(([re]) => re.test(n))?.[1];
/** Palabras que sobran después de quitar las vacías y las conocidas para esta consulta. */
const sobrantes = (n, conocidas) => tokens(n).filter((w) => !VACIAS.has(w) && !conocidas.some((c) => (c instanceof RegExp ? c.test(w) : c === w)));

// ---------------------------------------------------------------------------------------------
// Reconocedores: devuelven { herramienta, args } o null
// ---------------------------------------------------------------------------------------------

function finanzas(n) {
  const base = [...PALABRAS_PERIODO, ...PALABRAS_CIUDAD, /^caj(a|as)$/, 'chica', 'diaria'];
  const periodo = periodoDe(n) ?? 'mes';
  const ciudad = ciudadDe(n);
  const proy = n.match(/\bproyecto\s+(.+)$/);
  if (proy) {
    const nombre = proy[1].replace(/\b(desde|las|cajas?|chica|diaria)\b/g, ' ').trim();
    return nombre ? { herramienta: 'gastos_proyecto_caja', args: { proyecto: nombre } } : null;
  }
  if (/\bsaldos?\b/.test(n)) return sobrantes(n, [...base, /^saldos?$/, 'yape', 'efectivo', 'queda', 'quedan', 'hay']).length ? null : { herramienta: 'saldos_caja', args: {} };
  if (/\b(caja diaria|yape|efectivo|ingresos?|entro|entraron)\b/.test(n)) {
    return sobrantes(n, [...base, 'yape', 'efectivo', /^ingresos?$/, 'entro', 'entraron', /^salidas?$/, 'salio', 'movimientos', 'cta', 'cte', 'corriente', 'cuenta'])
      .length ? null : { herramienta: 'caja_diaria', args: { periodo, ...(ciudad ? { ciudad } : {}) } };
  }
  if (/\b(gast|egres|recibo|comprobante|caja chica)/.test(n)) {
    const cat = CATEGORIAS.find(([w]) => new RegExp(`\\b${w}\\b`).test(n))?.[1];
    const sinRecibo = /\b(recibos?|comprobantes?|fotos?)\b/.test(n) && /\b(no|sin|falta|faltan)\b/.test(n);
    const sobra = sobrantes(n, [...base, /^gast/, /^egresos?$/, /^recibos?$/, /^comprobantes?$/, /^fotos?$/, 'no', 'falta', 'faltan', 'categoria', 'categorias',
      ...CATEGORIAS.map(([w]) => w)]);
    return sobra.length ? null : { herramienta: 'gastos_caja_chica', args: { periodo, ...(ciudad ? { ciudad } : {}), ...(cat ? { categoria: cat } : {}), ...(sinRecibo ? { sin_recibo: true } : {}) } };
  }
  return null;
}

function asistente(n) {
  const mes = /\bmes (pasado|anterior)\b/.test(n) ? mesAnterior() : undefined;
  const per = ['mes', 'este', 'esta', 'pasado', 'anterior', 'hoy'];
  const precio = n.match(/\b(?:precio|precios|cuanto cuesta|cuesta|costo)\b(?:\s+(?:de|del|el|la|los|las|un|una))*\s+(.+?)(?:\s+(?:en|con|de)\s+(?:los\s+)?proveedor(?:es)?)?$/);
  if (precio && /\b(precio|cuesta|costo|proveedor)/.test(n)) return { herramienta: 'precios_proveedores', args: { producto: precio[1].trim() } };
  if (/\b(stock|almacen|inventario)\b/.test(n)) {
    const bajo = /\b(bajo|bajos|minimo|falta|faltan|poco|reponer|agotado|agotados)\b/.test(n);
    const resto = sobrantes(n, ['stock', 'almacen', 'inventario', 'bajo', 'bajos', 'minimo', 'falta', 'faltan', 'poco', 'reponer', 'agotado', 'agotados', 'articulos', 'articulo', 'queda', 'quedan', 'productos']);
    if (bajo && !resto.length) return { herramienta: 'stock_almacen', args: {} };
    return resto.length ? { herramienta: 'stock_almacen', args: { articulo: resto.join(' ') } } : { herramienta: 'stock_almacen', args: {} };
  }
  if (/\bcaja chica\b/.test(n)) {
    return sobrantes(n, [...per, 'caja', 'chica', /^gast/, /^comprobantes?$/, /^recibos?$/, 'no', 'saldo', /^egresos?$/]).length ? null : { herramienta: 'caja_chica', args: mes ? { mes } : {} };
  }
  if (/\b(factur|boleta|comprobante|vendi|ventas?)/.test(n)) {
    return sobrantes(n, [...per, /^factur/, /^boletas?$/, /^comprobantes?$/, /^emitid/, /^ventas?$/, 'vendimos', 'vendio', /^clientes?$/, 'sunat'])
      .length ? null : { herramienta: 'comprobantes', args: mes ? { mes } : {} };
  }
  if (/\bcotizacion/.test(n)) {
    const estado = /\benviad/.test(n) ? 'enviada' : /\bacept/.test(n) ? 'aceptada' : /\brechaz/.test(n) ? 'rechazada' : /\bborrador/.test(n) ? 'borrador' : undefined;
    return sobrantes(n, [...per, /^cotizacion/, /^enviad/, /^acept/, /^rechaz/, /^borrador/, 'respuesta', 'responder', 'pendientes', 'pendiente', 'estan', 'hicimos'])
      .length ? null : { herramienta: 'cotizaciones', args: estado ? { estado } : {} };
  }
  if (/\brequerimiento/.test(n)) {
    const estado = /\b(pendiente|por aprobar)/.test(n) ? 'pendiente' : /\baprobad/.test(n) ? 'aprobado' : /\blisto/.test(n) ? 'listo' : /\bentregad/.test(n) ? 'entregado' : undefined;
    return sobrantes(n, [/^requerimiento/, /^pendiente/, 'por', 'aprobar', /^aprobad/, /^listos?$/, /^entregad/, 'urgentes', 'urgente', 'materiales'])
      .length ? null : { herramienta: 'requerimientos', args: estado ? { estado } : {} };
  }
  if (/\bproyectos\b/.test(n)) {
    const estado = /\bactivos?\b/.test(n) ? 'activo' : /\bpausad/.test(n) ? 'pausado' : /\bfinalizad|terminad/.test(n) ? 'finalizado' : undefined;
    return sobrantes(n, ['proyectos', /^activos?$/, /^pausad/, /^finalizad/, /^terminad/, 'presupuesto', 'presupuestos', 'avance', 'estado', 'alguno', 'alguna', 'limite', 'pasado', 'pasados'])
      .length ? null : { herramienta: 'proyectos', args: estado ? { estado } : {} };
  }
  if (/\b(finanzas|ingresos?|egresos?|flujo|cuenta principal)\b/.test(n)) {
    return sobrantes(n, [...per, 'finanzas', /^ingresos?$/, /^egresos?$/, 'flujo', 'cuenta', 'principal', 'neto', 'caja', 'banco', 'entro', 'salio'])
      .length ? null : { herramienta: 'resumen_finanzas', args: mes ? { mes } : {} };
  }
  return null;
}

/** ¿Se puede responder esta pregunta sin IA? → { herramienta, args } o null. */
export function reconocer(modulo, texto) {
  const n = sinTildes(texto).replace(/[¿?¡!.,;:()"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 200) return null;
  if (modulo === 'finanzas') return finanzas(n);
  if (modulo === 'asistente') return asistente(n);
  return null;
}

// ---------------------------------------------------------------------------------------------
// La frase de respuesta (con los totales tal como los da la herramienta)
// ---------------------------------------------------------------------------------------------

export function resumir(herramienta, m) {
  if (!m) return 'Sin dato.';
  if (m.error) return m.error;
  switch (herramienta) {
    case 'gastos_caja_chica':
      return m.cantidad
        ? `${cap(m.periodo)} se gastó **${m.total_gastado}** de caja chica en ${m.cantidad} gasto${m.cantidad === 1 ? '' : 's'} (${m.ciudad}).${m.sin_recibo ? ` ${m.sin_recibo} no tiene${m.sin_recibo === 1 ? '' : 'n'} foto del recibo (${m.total_sin_recibo}).` : ' Todos tienen foto del recibo.'}`
        : `No hay gastos de caja chica ${m.periodo} (${m.ciudad}) con esos datos.`;
    case 'caja_diaria':
      return `Caja diaria ${m.periodo} (${m.ciudad}): entraron **${m.ingresos_efectivo}** en efectivo y ${m.ingresos_transferencia} por transferencia; salieron ${m.salidas_efectivo} en efectivo. Yape: entró ${m.yape_ingresos} y salió ${m.yape_salidas}.${m.salidas_sin_comprobante ? ` ${m.salidas_sin_comprobante} salida${m.salidas_sin_comprobante === 1 ? '' : 's'} sin comprobante.` : ''}`;
    case 'saldos_caja':
      return `Saldos: ${m.saldos.map((s) => `**${s.ciudad}** — caja chica ${s.caja_chica}, efectivo ${s.caja_diaria_efectivo}, Yape ${s.yape}`).join('; ')}.`;
    case 'gastos_proyecto_caja':
      return `En **${m.proyecto}** se gastó ${m.gastado_desde_cajas ?? 'Sin dato'} desde las cajas.`;
    case 'resumen_finanzas':
      return `En **${mesTexto(m.mes)}** entraron ${m.ingresos} y salieron ${m.egresos}: flujo neto **${m.flujo_neto}**${m.variacion_egresos !== null && m.variacion_egresos !== undefined ? ` (egresos ${m.variacion_egresos} vs. el mes anterior)` : ''}.${m.saldo_actual && m.saldo_actual !== 'Sin dato' ? ` Saldo actual de ${m.cuenta ?? 'la cuenta principal'}: ${m.saldo_actual}.` : ''}`;
    case 'proyectos': {
      const c = m.conteo_por_estado ?? {};
      const alerta = (m.proyectos ?? []).filter((p) => p.estado === 'activo' && p.porcentaje !== null && p.porcentaje >= 80).sort((a, b) => b.porcentaje - a.porcentaje);
      return `Hay **${c.activo ?? 0}** proyecto${c.activo === 1 ? '' : 's'} activo${c.activo === 1 ? '' : 's'}, ${c.pausado ?? 0} pausado${c.pausado === 1 ? '' : 's'} y ${c.finalizado ?? 0} finalizado${c.finalizado === 1 ? '' : 's'}.${alerta.length ? ` Cerca o pasado de su presupuesto: ${alerta.slice(0, 3).map((p) => `${p.nombre} (${p.porcentaje} %)`).join(', ')}.` : ' Ninguno activo llega al 80 % de su presupuesto.'}`;
    }
    case 'comprobantes':
      return m.comprobantes ? `En **${mesTexto(m.mes)}** se emitieron ${m.emitidos} comprobante${m.emitidos === 1 ? '' : 's'} por **${m.total_emitido}**.` : `No hay comprobantes en ${mesTexto(m.mes)}.`;
    case 'caja_chica':
      return `Caja chica en **${mesTexto(m.mes)}**: salieron ${m.egresos_mes} en ${m.gastos_mes ?? 0} gasto${m.gastos_mes === 1 ? '' : 's'}${m.sin_comprobante ? `, ${m.sin_comprobante} sin comprobante` : ''}. Saldo actual: **${m.saldo_total}**.`;
    case 'cotizaciones': {
      const e = m.por_estado ?? {};
      return m.cantidad ? `Hay **${m.cantidad}** cotizaci${m.cantidad === 1 ? 'ón' : 'ones'} por ${m.monto_total}: ${e.enviada ?? 0} enviadas, ${e.aceptada ?? 0} aceptadas, ${e.rechazada ?? 0} rechazadas y ${e.borrador ?? 0} en borrador.` : 'No hay cotizaciones con ese filtro.';
    }
    case 'requerimientos':
      return m.cantidad ? `Hay **${m.cantidad}** requerimiento${m.cantidad === 1 ? '' : 's'}${m.urgentes ? `, ${m.urgentes} urgente${m.urgentes === 1 ? '' : 's'} sin entregar` : ''}.` : 'No hay requerimientos con ese filtro.';
    case 'stock_almacen':
      if (!m.articulos?.length) return m.consulta === 'bajo el mínimo' ? 'Ningún artículo está bajo su stock mínimo.' : `No encontré «${m.consulta}» en el almacén.`;
      return m.consulta === 'bajo el mínimo'
        ? `**${m.total}** artículo${m.total === 1 ? '' : 's'} en o bajo su mínimo: ${m.articulos.slice(0, 5).map((a) => `${a.nombre} (${a.stock})`).join(', ')}.`
        : `${m.articulos.slice(0, 3).map((a) => `**${a.nombre}**: ${a.stock}${a.bajo_minimo ? ' (bajo el mínimo)' : ''}`).join('; ')}.`;
    case 'precios_proveedores':
      if (!m.resultados?.length) return 'No encontré ese producto en las listas de proveedores.';
      return m.mejor_opcion
        ? `La mejor opción es **${m.mejor_opcion.proveedor}**: ${m.mejor_opcion.costo_total} (precio del ${String(m.mejor_opcion.fecha_precio).split('-').reverse().join('/')}).${m.ahorro_vs_siguiente ? ` Ahorras ${m.ahorro_vs_siguiente} frente a la siguiente.` : ''}`
        : `Encontré ${m.resultados.length} precio${m.resultados.length === 1 ? '' : 's'}, pero ninguno es el mismo producto con precio vigente: revisa la tabla.`;
    default:
      return 'Aquí tienes los datos.';
  }
}

/** Preguntas de un toque que se muestran en cada pantalla (todas se responden sin IA). */
export const FRECUENTES = {
  asistente: [
    ['account_balance', 'Resumen de finanzas del mes', 'Resumen de ingresos y egresos de este mes', 'resumen_finanzas'],
    ['solar_power', 'Cómo van los proyectos activos', '¿Cómo van los proyectos activos y su presupuesto?', 'proyectos'],
    ['verified', 'Ventas facturadas del mes', 'Facturas y boletas emitidas este mes', 'comprobantes'],
    ['savings', 'Caja chica este mes', '¿Cuánto se gastó de caja chica este mes?', 'caja_chica'],
    ['request_quote', 'Cotizaciones enviadas', '¿Qué cotizaciones están enviadas y sin respuesta?', 'cotizaciones'],
    ['inventory', 'Stock bajo en almacén', '¿Qué artículos del almacén están con stock bajo?', 'stock_almacen'],
  ],
  finanzas: [
    ['¿Cuánto se gastó esta semana?', 'gastos_caja_chica'],
    ['¿Qué gastos de caja chica no tienen recibo este mes?', 'gastos_caja_chica'],
    ['¿Cuál es el saldo de las cajas?', 'saldos_caja'],
    ['¿Cuánto se gastó en movilidad este mes en Moquegua?', 'gastos_caja_chica'],
    ['¿Cómo va la caja diaria y el Yape este mes?', 'caja_diaria'],
  ],
};
