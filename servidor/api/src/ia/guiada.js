// Cotización guiada (sin IA): con el tipo de sistema y el consumo o la potencia, el servidor elige paneles, inversor y baterías
// del catálogo con reglas fijas y arma la propuesta al instante. Reglas (decisión del dueño): 5.5 horas de sol pico en todo el sur,
// sin factor de pérdidas; productos preferidos configurables (hasta 5 de cada uno) en Cotizador IA › Contexto.
// La potencia de cada producto se lee de su nombre («550W», «10KW», «48/5000», «48V 200AH 10.24KWH»); si no se puede leer, no se usa.
import { leerParametros } from '../configuracion.js';
import { falla } from '../errores.js';
import { leerContexto } from './config.js';
import { armarPropuesta } from './herramientas.js';
import { catalogoProductos, normalizar } from './indice.js';

export const HSP = 5.5;
export const TIPOS = { ongrid: 'On-Grid', hibrido: 'Híbrido', aislado: 'Aislado' };
const MARCAS = ['victron', 'huawei', 'goodwe', 'growatt', 'fronius', 'solis', 'gospower', 'must', 'felicity', 'pylontech', 'ritar', 'trina', 'ja solar', 'jinko', 'ae solar',
  'astroenergy', 'tensite', 'inti', 'eco green', 'osda', 'tst', 'deye', 'canadian', 'longi'];
const num = (s) => Number(String(s).replace(',', '.'));
const red2 = (n) => Math.round(n * 100) / 100;
const conMiles = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });

// ---------------------------------------------------------------------------------------------
// Lo que se lee del nombre de cada producto
// ---------------------------------------------------------------------------------------------

/** Potencia del panel en W (50–900) o null. */
export function wattsPanel(p) {
  const m = `${p.nombre} ${p.codigo ?? ''}`.match(/(\d{2,3})\s*W(?:P)?\b/i);
  const w = m ? Number(m[1]) : null;
  return w && w >= 50 && w <= 900 ? w : null;
}

/** Potencia del inversor en kW o null. */
export function kwInversor(p) {
  const t = `${p.nombre} ${p.codigo ?? ''}`.toUpperCase();
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*KW\b/);
  if (m) return num(m[1]);
  m = t.match(/\b(?:12|24|48)\s*[/_]\s*(\d{3,5})\b/); // MultiPlus 48/5000, Quattro 48_10000
  if (m) return Number(m[1]) / 1000;
  m = t.match(/\b(\d{3,6})\s*W\b/);
  if (m) return Number(m[1]) / 1000;
  m = t.match(/\b(\d{3,6})\s*VA\b/);
  if (m) return Number(m[1]) / 1000;
  m = t.match(/\b(\d{1,3}(?:[.,]\d)?)\s*K(?:TL|-|\b)/); // 5K, 15 K, 25K-S5, 6K
  if (m) return num(m[1]);
  return null;
}

/** Capacidad de la batería en kWh o null («10.24KWH», o voltaje × Ah). */
export function kwhBateria(p) {
  const t = `${p.nombre} ${p.codigo ?? ''}`.toUpperCase();
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*KWH/);
  if (m) return num(m[1]);
  m = t.match(/\b(12|24|48|51[.,]2)\s*V?\s*[-/]?\s*(\d{2,3})\s*AH/);
  if (m) return red2((num(m[1]) * Number(m[2])) / 1000);
  return null;
}
const voltajeBateria = (p) => Number((`${p.nombre}`.toUpperCase().match(/\b(12|24|48|51)[.,]?\d?\s*V/) ?? [])[1] ?? 0);
const esLitio = (p) => /liti|lithi|lifepo/.test(normalizar(p.nombre));

/** Para qué sirve un inversor: red (On-Grid), híbrido (red + baterías) o aislado. */
export function usoInversor(p) {
  const c = normalizar(p.categoria);
  const n = normalizar(p.nombre);
  if (/micro/.test(c) || /microinversor/.test(n)) return 'micro';
  if (/hibrid/.test(c) || /hibrid|hybrid/.test(n)) return 'hibrido';
  if (/de red/.test(c) || /\bred\b|grid|tl-x/.test(n)) return 'red';
  if (c === 'inversores') return 'aislado';
  return null;
}
const sirve = (tipo, p) => {
  const u = usoInversor(p);
  return tipo === 'ongrid' ? u === 'red' : tipo === 'hibrido' ? u === 'hibrido' : u === 'hibrido' || u === 'aislado';
};
const esPanel = (p) => /panel/.test(normalizar(p.categoria)) && wattsPanel(p) !== null;
const esInversor = (p) => /inversor/.test(normalizar(p.categoria)) && kwInversor(p) !== null;
const esBateria = (p) => /bateri/.test(normalizar(p.categoria)) && kwhBateria(p) !== null;
const conPrecio = (p) => p.precio !== null && p.precio !== undefined;
const deMarca = (p, marca) => !marca || normalizar(`${p.nombre} ${p.marca ?? ''}`).includes(marca);

// ---------------------------------------------------------------------------------------------
// Pedido escrito → datos (para responder sin IA cuando el texto es claro)
// ---------------------------------------------------------------------------------------------

/** «Híbrido de 10 kW con baterías para 900 kWh/mes» → { tipo, potencia_kw, consumo_kwh_mes, … } o null si no hay potencia ni consumo. */
export function parsearPedido(texto) {
  const t = normalizar(texto).replace(/(\d)\s*,\s*(\d{3})\b/g, '$1$2');
  const potencia = t.match(/(\d+(?:[.,]\d+)?)\s*kw(?:p)?\b/);
  const consumo = t.match(/(\d+(?:[.,]\d+)?)\s*kwh\s*(?:\/|al|por|x|cada|mensual|mes)\s*(?:mes)?/) ?? t.match(/consumo\D{0,15}(\d+(?:[.,]\d+)?)\s*kwh/);
  if (!potencia && !consumo) return null;
  const bat = t.match(/bater\w*[^.]{0,25}?(\d+(?:[.,]\d+)?)\s*kwh(?!\s*(?:\/|al|por)\s*mes)/) ?? t.match(/(\d+(?:[.,]\d+)?)\s*kwh\s*(?:de\s*)?(?:bater|almacen)/);
  const horas = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|horas)\s*(?:de\s*)?(?:respaldo|autonomia)/) ?? t.match(/(?:respaldo|autonomia)\D{0,10}(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|horas)\b/);
  const tipo = /aislad|off.?grid|sin red|sin conexion a (la )?red/.test(t) ? 'aislado'
    : /hibrid|bateri|respaldo|autonomia/.test(t) ? 'hibrido' : 'ongrid';
  const marca = MARCAS.find((m) => new RegExp(`\\b${m}\\b`).test(t)) ?? null;
  return {
    tipo, potencia_kw: potencia ? num(potencia[1]) : null, consumo_kwh_mes: consumo ? num(consumo[1]) : null,
    bateria_kwh: bat ? num(bat[1]) : null, horas_respaldo: horas ? num(horas[1]) : null, marca,
  };
}

// ---------------------------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------------------------

function validar(b) {
  const tipo = TIPOS[b?.tipo] ? b.tipo : null;
  if (!tipo) throw falla(400, 'Elige el tipo de sistema: On-Grid, híbrido o aislado.');
  const n = (v, nombre, max) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const x = num(v);
    if (!(x > 0) || x > max) throw falla(400, `${nombre} no es válido.`);
    return x;
  };
  const d = {
    tipo, potencia_kw: n(b.potencia_kw, 'La potencia', 5000), consumo_kwh_mes: n(b.consumo_kwh_mes, 'El consumo', 1_000_000),
    bateria_kwh: n(b.bateria_kwh, 'La capacidad de baterías', 10_000), horas_respaldo: n(b.horas_respaldo, 'Las horas de respaldo', 240),
    marca: b.marca ? normalizar(String(b.marca)).slice(0, 40) : null,
    panel_id: Number(b.panel_id) || null, inversor_id: Number(b.inversor_id) || null, bateria_id: Number(b.bateria_id) || null,
  };
  if (!d.potencia_kw && !d.consumo_kwh_mes) throw falla(400, 'Escribe el consumo (kWh al mes) o la potencia del sistema (kW).');
  return d;
}

/** Elige del catálogo: el elegido a mano, si no el preferido, si no la marca pedida, si no el más conveniente. */
function elegir(lista, { id, preferidos, marca, mejor }) {
  if (id) {
    const p = lista.find((x) => x.id === id);
    if (!p) throw falla(400, 'El producto elegido no sirve para este sistema (o no tiene precio o potencia legible).');
    return p;
  }
  const pref = preferidos.map((pid) => lista.find((x) => x.id === pid)).filter(Boolean);
  if (pref.length) return mejor(pref, true);
  const marcados = lista.filter((x) => deMarca(x, marca));
  return mejor(marcados.length ? marcados : lista, false);
}

export async function calcularGuiada(b) {
  const d = validar(b);
  const [cat, ctx, par] = await Promise.all([catalogoProductos(), leerContexto(), leerParametros()]);
  const tc = par.tipo_cambio?.valor ?? null;
  const pref = ctx.guiada ?? {};
  const soles = (p) => (p.moneda === 'USD' ? (tc ? num(p.precio) * num(tc) : null) : num(p.precio));
  const notas = [];

  // Paneles: por consumo (kWh/mes ÷ 30 ÷ 5.5 h) o, si no hay consumo, la potencia pedida.
  const kwpObjetivo = d.consumo_kwh_mes ? d.consumo_kwh_mes / 30 / HSP : d.potencia_kw;
  const paneles = cat.filter((p) => esPanel(p) && conPrecio(p) && soles(p) !== null);
  if (!paneles.length) throw falla(409, 'No hay paneles con potencia (W) y precio en el catálogo.');
  const panel = elegir(paneles, {
    id: d.panel_id, preferidos: pref.paneles ?? [], marca: d.marca,
    // preferidos: el primero de la lista (orden de preferencia); si no, el de menor precio por W entre los de 400 W o más
    mejor: (l, esPref) => (esPref ? l[0] : [...(l.some((x) => wattsPanel(x) >= 400) ? l.filter((x) => wattsPanel(x) >= 400) : l)].sort((a, b2) => soles(a) / wattsPanel(a) - soles(b2) / wattsPanel(b2))[0]),
  });
  const w = wattsPanel(panel);
  const nPaneles = Math.max(1, Math.ceil((kwpObjetivo * 1000) / w));
  const kwp = red2((nPaneles * w) / 1000);
  const produccionMes = Math.round(kwp * HSP * 30);

  // Inversor: el más chico que alcance la potencia pedida (o la de los paneles); si ninguno alcanza, varios del más grande.
  const kwNecesario = d.potencia_kw ?? kwp;
  const inversores = cat.filter((p) => esInversor(p) && conPrecio(p) && soles(p) !== null && sirve(d.tipo, p));
  if (!inversores.length) throw falla(409, `No hay inversores ${d.tipo === 'ongrid' ? 'de red' : 'híbridos'} con potencia legible y precio en el catálogo.`);
  const inversor = elegir(inversores, {
    id: d.inversor_id, preferidos: pref.inversores ?? [], marca: d.marca,
    mejor: (l) => {
      const alcanzan = l.filter((x) => kwInversor(x) >= kwNecesario * 0.95);
      if (alcanzan.length) return alcanzan.sort((a, b2) => kwInversor(a) - kwInversor(b2) || soles(a) - soles(b2))[0];
      return [...l].sort((a, b2) => kwInversor(b2) - kwInversor(a) || soles(a) - soles(b2))[0];
    },
  });
  const kwInv = kwInversor(inversor);
  const nInversores = Math.max(1, Math.ceil((kwNecesario * 0.95) / kwInv));

  // Baterías (híbrido y aislado): la capacidad pedida; o las horas de respaldo; o 1 día de consumo (aislado) / medio día (híbrido).
  let bateria = null;
  let nBaterias = 0;
  let kwhObjetivo = null;
  if (d.tipo !== 'ongrid') {
    const consumoDia = d.consumo_kwh_mes ? d.consumo_kwh_mes / 30 : kwp * HSP;
    kwhObjetivo = d.bateria_kwh ?? (d.horas_respaldo ? (consumoDia / 24) * d.horas_respaldo : d.tipo === 'aislado' ? consumoDia : consumoDia / 2);
    if (!d.bateria_kwh) notas.push(d.horas_respaldo ? `Baterías para ${conMiles(d.horas_respaldo, 1)} h de respaldo con el consumo promedio.` : `Sin capacidad indicada: baterías para ${d.tipo === 'aislado' ? 'un día' : 'medio día'} de consumo (${conMiles(red2(kwhObjetivo), 1)} kWh).`);
    const baterias = cat.filter((p) => esBateria(p) && conPrecio(p) && soles(p) !== null);
    if (!baterias.length) throw falla(409, 'No hay baterías con capacidad legible y precio en el catálogo.');
    bateria = elegir(baterias, {
      id: d.bateria_id, preferidos: pref.baterias ?? [], marca: d.marca,
      mejor: (l, esPref) => {
        if (esPref) return l[0];
        // la combinación de menor costo total para llegar a la capacidad (litio de 48 V si hay)
        const litio48 = l.filter((x) => esLitio(x) && voltajeBateria(x) >= 48);
        const costo = (x) => Math.ceil(kwhObjetivo / kwhBateria(x)) * soles(x);
        return [...(litio48.length ? litio48 : l)].sort((a, b2) => costo(a) - costo(b2) || Math.ceil(kwhObjetivo / kwhBateria(a)) - Math.ceil(kwhObjetivo / kwhBateria(b2)))[0];
      },
    });
    nBaterias = Math.max(1, Math.ceil(kwhObjetivo / kwhBateria(bateria)));
  }

  const items = [
    { producto_id: panel.id, descripcion: panel.nombre, cantidad: nPaneles },
    { producto_id: inversor.id, descripcion: inversor.nombre, cantidad: nInversores },
    ...(bateria ? [{ producto_id: bateria.id, descripcion: bateria.nombre, cantidad: nBaterias }] : []),
    { descripcion: `Estructura de montaje para ${nPaneles} paneles`, cantidad: 1 },
    { descripcion: 'Cableado solar, conectores MC4 y protecciones DC/AC', cantidad: 1 },
    { descripcion: 'Instalación y puesta en marcha', cantidad: 1 },
  ];
  const titulo = `${TIPOS[d.tipo]} ${conMiles(d.potencia_kw ?? kwp, 2)} kW${d.consumo_kwh_mes ? ` · ${conMiles(d.consumo_kwh_mes)} kWh/mes` : ''}`;
  const r = await armarPropuesta(titulo, items, tc);
  r.tarjeta.notas = [...(r.tarjeta.notas ?? []), `Cálculo: ${HSP} h de sol pico; ${nPaneles} × ${w} W = ${conMiles(kwp, 2)} kWp (~${conMiles(produccionMes)} kWh/mes).`, ...notas];

  const partes = [`**${TIPOS[d.tipo]}**: ${nPaneles} paneles de ${w} W (${conMiles(kwp, 2)} kWp, unos ${conMiles(produccionMes)} kWh al mes con ${HSP} h de sol)`];
  partes.push(`${nInversores > 1 ? `${nInversores} inversores` : '1 inversor'} de ${conMiles(kwInv, 2)} kW`);
  if (bateria) partes.push(`${nBaterias} batería${nBaterias === 1 ? '' : 's'} de ${conMiles(kwhBateria(bateria), 2)} kWh (${conMiles(red2(nBaterias * kwhBateria(bateria)), 2)} kWh en total)`);
  const texto = `${partes.join(', ')}.${notas.length ? ` ${notas.join(' ')}` : ''} Estructura, cableado e instalación quedan «Sin dato» para que pongas su precio.`;
  return {
    tarjeta: r.tarjeta, texto,
    calculo: { ...d, kwp, paneles: nPaneles, watts_panel: w, produccion_kwh_mes: produccionMes, inversores: nInversores, kw_inversor: kwInv, baterias: nBaterias, kwh_bateria: bateria ? kwhBateria(bateria) : null, kwh_objetivo: kwhObjetivo ? red2(kwhObjetivo) : null },
  };
}

/** Para elegir preferidos y productos en el formulario: los paneles, inversores y baterías que la guiada puede usar. */
export async function opcionesGuiada() {
  const [cat, ctx] = await Promise.all([catalogoProductos(), leerContexto()]);
  const ficha = (p, valor, unidad, uso) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio, moneda: p.moneda, valor, unidad, uso });
  return {
    hsp: HSP,
    preferidos: { paneles: ctx.guiada?.paneles ?? [], inversores: ctx.guiada?.inversores ?? [], baterias: ctx.guiada?.baterias ?? [] },
    paneles: cat.filter((p) => esPanel(p) && conPrecio(p)).map((p) => ficha(p, wattsPanel(p), 'W')).sort((a, b) => a.valor - b.valor),
    inversores: cat.filter((p) => esInversor(p) && conPrecio(p) && usoInversor(p) && usoInversor(p) !== 'micro').map((p) => ficha(p, kwInversor(p), 'kW', usoInversor(p))).sort((a, b) => a.valor - b.valor),
    baterias: cat.filter((p) => esBateria(p) && conPrecio(p)).map((p) => ficha(p, kwhBateria(p), 'kWh')).sort((a, b) => a.valor - b.valor),
  };
}
