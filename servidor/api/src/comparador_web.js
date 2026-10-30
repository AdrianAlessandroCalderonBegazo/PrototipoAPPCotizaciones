// Lectura automática de precios desde las páginas de los proveedores (Fase 8), desde el VPS.
// Reconoce las tiendas más comunes sin programar una por una: WooCommerce (API pública de la tienda), Shopify (/products.json)
// y cualquier página con datos de producto estándar (JSON-LD «Product», que usan Google y la mayoría de tiendas).
// Reglas: respeta robots.txt, espera entre pedidos (no satura la tienda), un máximo de páginas por lectura y una lectura a la vez.
import { consulta } from './db.js';
import { guardarLecturaWeb, programarIndiceProveedores, urlPermitida } from './comparador.js';

const UA = 'ICR-Comparador/1.0 (lectura de precios publicos; Inversiones ICR, Arequipa)';
const PAUSA = () => Number(process.env.COMPARADOR_PAUSA_MS ?? 1500);
const MAX_PEDIDOS = 400;
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const limpiarHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Reglas de robots.txt para nuestro agente (o «*»). Devuelve { permite(ruta), pausa }. */
export function leerRobots(texto) {
  const grupos = [];
  let actual = null;
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    const l = linea.replace(/#.*$/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(l);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2].trim()];
    if (k === 'user-agent') {
      if (!actual || actual.reglas.length || actual.pausa !== null) grupos.push((actual = { agentes: [], reglas: [], pausa: null }));
      actual.agentes.push(v.toLowerCase());
    } else if (actual && (k === 'disallow' || k === 'allow')) actual.reglas.push({ permite: k === 'allow', ruta: v });
    else if (actual && k === 'crawl-delay') actual.pausa = Math.min(10, Number(v) || 0);
  }
  const propio = grupos.find((g) => g.agentes.some((a) => a !== '*' && 'icr-comparador'.includes(a))) ?? grupos.find((g) => g.agentes.includes('*'));
  const reglas = (propio?.reglas ?? []).filter((r) => r.ruta !== '');
  return {
    pausa: propio?.pausa ? propio.pausa * 1000 : 0,
    permite(ruta) {
      // La regla más específica (más larga) gana; sin reglas, se permite.
      let mejor = null;
      for (const r of reglas) {
        const patron = new RegExp(`^${r.ruta.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
        if (patron.test(ruta) && (!mejor || r.ruta.length > mejor.ruta.length)) mejor = r;
      }
      return !mejor || mejor.permite;
    },
  };
}

function cliente(origen) {
  let pedidos = 0;
  let robots = null;
  let ultimo = 0;
  return {
    origen,
    get pedidos() {
      return pedidos;
    },
    async pedir(url, { json = false } = {}) {
      const u = new URL(url, origen);
      if (u.origin !== origen) throw new Error(`Fuera de la tienda: ${u.href}`);
      if (!robots) {
        try {
          const r = await fetch(`${origen}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
          robots = leerRobots(r.ok ? await r.text() : '');
        } catch {
          robots = leerRobots('');
        }
      }
      if (!robots.permite(u.pathname + u.search)) throw Object.assign(new Error(`robots.txt no permite leer ${u.pathname}`), { robots: true });
      if (++pedidos > MAX_PEDIDOS) throw new Error(`Se llegó al máximo de ${MAX_PEDIDOS} páginas por lectura.`);
      const falta = Math.max(PAUSA(), robots.pausa) - (Date.now() - ultimo);
      if (ultimo && falta > 0) await espera(falta);
      ultimo = Date.now();
      const r = await fetch(u.href, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html,application/xml' }, signal: AbortSignal.timeout(20_000), redirect: 'follow' })
        .catch((e) => {
          throw new Error(e?.name === 'TimeoutError' ? `${u.host} no respondió a tiempo (20 s).` : `No se pudo conectar con ${u.host}: revisa la dirección o si la tienda está en línea.`);
        });
      if (!r.ok) throw Object.assign(new Error(`${u.pathname} respondió ${r.status}`), { estado: r.status });
      return json ? r.json() : r.text();
    },
  };
}

// ---- WooCommerce: /wp-json/wc/store/v1/products (API pública de la tienda) ----
async function woocommerce(c) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const lista = await c.pedir(`/wp-json/wc/store/v1/products?per_page=100&page=${page}`, { json: true });
    if (!Array.isArray(lista)) throw new Error('No es una tienda WooCommerce.');
    for (const p of lista) {
      const pr = p.prices ?? {};
      const minor = Number(pr.currency_minor_unit ?? 2);
      const precio = pr.price ? (Number(pr.price) / 10 ** minor).toFixed(2) : null;
      out.push({
        codigo: p.sku || null, descripcion: limpiarHtml(p.name), precio, moneda: pr.currency_code === 'USD' ? 'USD' : pr.currency_code === 'PEN' ? 'PEN' : null,
        categoria: p.categories?.map((x) => limpiarHtml(x.name)).join(', ') || null, disponibilidad: p.is_in_stock === false ? 'Agotado' : p.is_in_stock ? 'En stock' : null,
        marca: (p.brands?.[0]?.name ?? p.attributes?.find((a) => /marca|brand/i.test(a.name))?.terms?.[0]?.name) || null, url: p.permalink || null,
      });
    }
    if (lista.length < 100) break;
  }
  return out;
}

// ---- Shopify: /products.json ----
async function shopify(c) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const j = await c.pedir(`/products.json?limit=250&page=${page}`, { json: true });
    if (!Array.isArray(j?.products)) throw new Error('No es una tienda Shopify.');
    for (const p of j.products) {
      for (const v of p.variants ?? []) {
        const variante = v.title && v.title !== 'Default Title' ? ` – ${v.title}` : '';
        out.push({ codigo: v.sku || null, descripcion: `${limpiarHtml(p.title)}${variante}`, precio: v.price ?? null, moneda: null, marca: p.vendor || null, categoria: p.product_type || null, disponibilidad: v.available === false ? 'Agotado' : v.available ? 'En stock' : null, url: `${c.origen}/products/${p.handle}` });
      }
    }
    if (j.products.length < 250) break;
  }
  return out;
}

// ---- JSON-LD «Product» en las páginas de producto (sitemap o enlaces de la página indicada) ----
export function productosJsonLd(html, url) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j;
    try {
      j = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodos = [j].flat().flatMap((x) => (x?.['@graph'] ? x['@graph'] : [x]));
    for (const n of nodos) {
      const tipos = [n?.['@type']].flat();
      if (!tipos.includes('Product')) continue;
      const ofertas = [n.offers].flat().filter(Boolean).flatMap((o) => (o['@type'] === 'AggregateOffer' ? [{ ...o, price: o.lowPrice ?? o.price }] : [o]));
      const o = ofertas.find((x) => x.price !== undefined && x.price !== null) ?? null;
      out.push({
        codigo: n.sku || n.mpn || null, descripcion: limpiarHtml(n.name), precio: o ? String(o.price) : null, moneda: o?.priceCurrency === 'USD' ? 'USD' : o?.priceCurrency === 'PEN' ? 'PEN' : null,
        marca: (typeof n.brand === 'string' ? n.brand : n.brand?.name) || null, categoria: typeof n.category === 'string' ? n.category : null,
        disponibilidad: o?.availability ? (/InStock/i.test(o.availability) ? 'En stock' : /OutOfStock/i.test(o.availability) ? 'Agotado' : /PreOrder|BackOrder/i.test(o.availability) ? 'A pedido' : null) : null,
        url: n.url || o?.url || url,
      });
    }
  }
  return out;
}
const PAGINA_PRODUCTO = /\/(producto|productos|product|products|p|tienda\/[^/]+)\/[^/?#]+\/?$/i;
async function jsonld(c, inicio) {
  let urls = [];
  try {
    const sm = await c.pedir('/sitemap.xml');
    let locs = [...sm.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    const hijos = locs.filter((l) => /sitemap.*\.xml/i.test(l) && /product/i.test(l)).slice(0, 5);
    for (const h of hijos) locs = locs.concat([...(await c.pedir(h)).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]));
    urls = locs.filter((l) => !/\.xml$/i.test(l) && PAGINA_PRODUCTO.test(new URL(l).pathname));
  } catch (e) {
    if (e.robots) throw e;
  }
  if (!urls.length) {
    const html = await c.pedir(inicio);
    const propios = productosJsonLd(html, inicio);
    if (propios.length > 1) return propios; // la página ya lista los productos
    urls = [...new Set([...html.matchAll(/href=["']([^"'#]+)["']/g)].map((m) => { try { return new URL(m[1], inicio).href; } catch { return null; } }).filter((h) => h && h.startsWith(c.origen) && PAGINA_PRODUCTO.test(new URL(h).pathname)))];
  }
  const out = [];
  let fallas = 0;
  for (const u of [...new Set(urls)].slice(0, 300)) {
    try {
      out.push(...productosJsonLd(await c.pedir(u), u));
    } catch (e) {
      if (e.robots || /máximo/.test(e.message)) break;
      fallas++;
    }
  }
  return Object.assign(out, { fallas });
}

/** Lee la tienda con el adaptador indicado (o prueba en orden). Devuelve { productos, adaptador, pedidos, fallas }. */
export async function leerTienda(url, adaptador = 'auto') {
  if (!urlPermitida(url)) throw new Error('Esa dirección no es una página pública.');
  const inicio = new URL(url);
  const origen = inicio.origin;
  const c = cliente(origen);
  const intentos = adaptador === 'auto' ? ['woocommerce', 'shopify', 'jsonld'] : [adaptador];
  let ultimoError = null;
  for (const a of intentos) {
    try {
      const productos = a === 'woocommerce' ? await woocommerce(c) : a === 'shopify' ? await shopify(c) : await jsonld(c, inicio.href);
      if (productos.length || adaptador !== 'auto') return { productos, adaptador: a, pedidos: c.pedidos, fallas: productos.fallas ?? 0 };
    } catch (e) {
      ultimoError = e;
      if (e.robots && adaptador !== 'auto') throw e;
    }
  }
  throw ultimoError ?? new Error('No se encontraron productos con precio en esa página.');
}

let corriendo = false;
/** Lee una fuente web ahora y deja el registro (proveedor_ejecuciones) con el resultado o el error. */
export async function ejecutarFuente(fuenteId, u = null) {
  if (corriendo) return { estado: 'ocupado', mensaje: 'Ya hay una lectura en curso; se intenta después.' };
  corriendo = true;
  const { rows } = await consulta("SELECT f.*, p.activo AS proveedor_activo FROM proveedor_fuentes f JOIN proveedores p ON p.id = f.proveedor_id WHERE f.id = $1 AND f.tipo = 'web'", [fuenteId]);
  const f = rows[0];
  if (!f) {
    corriendo = false;
    return { estado: 'error', mensaje: 'No existe esa fuente web.' };
  }
  const { rows: ej } = await consulta('INSERT INTO proveedor_ejecuciones (fuente_id) VALUES ($1) RETURNING id', [fuenteId]);
  let res;
  try {
    const r = await leerTienda(f.url, f.adaptador);
    const con = r.productos.filter((p) => p.descripcion && p.precio);
    const g = con.length ? await guardarLecturaWeb(f, con, { url: f.url, u }) : { leidos: 0, nuevos: 0, cambiaron: 0 };
    const estado = !con.length ? 'error' : r.fallas ? 'parcial' : 'ok';
    const mensaje = !con.length ? 'La página no mostró productos con precio.' : `${con.length} productos (${g.nuevos} nuevos, ${g.cambiaron} cambiaron de precio) · ${r.adaptador} · ${r.pedidos} páginas leídas${r.fallas ? ` · ${r.fallas} fallaron` : ''}`;
    res = { estado, mensaje, leidos: con.length, errores: r.fallas, adaptador: r.adaptador };
    if (con.length) programarIndiceProveedores();
  } catch (e) {
    res = { estado: 'error', mensaje: String(e?.message ?? e).slice(0, 500), leidos: 0, errores: 1 };
  } finally {
    corriendo = false;
  }
  await consulta("UPDATE proveedor_ejecuciones SET fin = now() AT TIME ZONE 'America/Lima', estado = $2, leidos = $3, errores = $4, mensaje = $5 WHERE id = $1", [ej[0].id, res.estado, res.leidos, res.errores, res.mensaje]);
  await consulta("UPDATE proveedor_fuentes SET ultima_ejecucion = now() AT TIME ZONE 'America/Lima', ultimo_estado = $2, ultimo_mensaje = $3, ultimos_leidos = $4 WHERE id = $1", [fuenteId, res.estado, res.mensaje, res.leidos]);
  return res;
}

export async function ejecucionesDe(fuenteId) {
  const { rows } = await consulta('SELECT id, inicio::text AS inicio, fin::text AS fin, estado, leidos, errores, mensaje FROM proveedor_ejecuciones WHERE fuente_id = $1 ORDER BY id DESC LIMIT 30', [fuenteId]);
  return rows;
}

/** Cada 30 minutos revisa qué páginas toca leer (según su frecuencia) y las lee una por una. */
export function iniciarProgramador() {
  const revisar = async () => {
    const { rows } = await consulta(
      `SELECT f.id FROM proveedor_fuentes f JOIN proveedores p ON p.id = f.proveedor_id
        WHERE f.tipo = 'web' AND f.activa AND p.activo AND (f.ultima_ejecucion IS NULL OR f.ultima_ejecucion < (now() AT TIME ZONE 'America/Lima') - make_interval(days => f.frecuencia_dias))
        ORDER BY f.ultima_ejecucion NULLS FIRST LIMIT 5`,
    ).catch(() => ({ rows: [] }));
    for (const f of rows) await ejecutarFuente(f.id).catch(() => null);
  };
  const t = setInterval(() => void revisar(), 30 * 60_000);
  t.unref?.();
  setTimeout(() => void revisar(), 60_000).unref?.();
}
