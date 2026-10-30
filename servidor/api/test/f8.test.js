// ERP · Fase 8: Comparador de proveedores (listas reales de Siblings y del Excel, historial solo-agregar, búsqueda, equivalencias y páginas web simuladas).
// Uso:  DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

const admin = process.env.DATABASE_ADMIN_URL || 'postgres://postgres@localhost:5432/postgres';
const nombreBase = `cotizador_test_${process.pid}`;
process.env.DATABASE_URL = admin.replace(/\/[^/]*$/, `/${nombreBase}`);
process.env.ADMIN_USUARIO = 'admin';
process.env.ADMIN_CLAVE = 'admin-clave-1';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'subidas-'));
process.env.COMPARADOR_PAUSA_MS = '0';
process.env.COMPARADOR_PERMITIR_LOCAL = '1';

const { crearApp } = await import('../src/index.js');
const { prepararBase, pool } = await import('../src/db.js');


let servidor;
let base;

async function llamar(metodo, ruta, { token, edicion, cuerpo, crudo, tipo } = {}) {
  const cabeceras = {};
  if (token) cabeceras.authorization = `Bearer ${token}`;
  if (edicion) cabeceras['x-edicion'] = edicion;
  let body;
  if (crudo) {
    body = crudo;
    cabeceras['content-type'] = tipo ?? 'application/octet-stream';
  } else if (cuerpo !== undefined) {
    body = JSON.stringify(cuerpo);
    cabeceras['content-type'] = 'application/json';
  }
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers: cabeceras, body });
  const texto = await r.text();
  return { estado: r.status, datos: texto ? JSON.parse(texto) : null };
}


const sesiones = {};
async function entrar(usuario, clave) {
  const r = await llamar('POST', '/api/login', { cuerpo: { usuario, clave } });
  assert.equal(r.estado, 200, JSON.stringify(r.datos));
  return r.datos;
}

before(async () => {
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${nombreBase}`);
  await c.query(`CREATE DATABASE ${nombreBase}`);
  await c.end();
  await prepararBase();
  // Las tablas de la caja las crea la API de Finanzas: aquí se aplican sus migraciones tal cual.
  const dir = fileURLToPath(new URL('../../../finanzas/db/migrations/', import.meta.url));
  for (const f of readdirSync(dir).filter((a) => /^\d+_.*\.sql$/.test(a) && !a.endsWith('_down.sql')).sort()) await pool.query(readFileSync(join(dir, f), 'utf8'));
  await new Promise((ok) => {
    servidor = crearApp().listen(0, () => ok());
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
  sesiones.admin = (await entrar('admin', 'admin-clave-1')).token;
  for (const [usuario, rol] of [['vera', 'ventas'], ['fina', 'contabilidad'], ['tito', 'tecnico']]) {
    const r = await llamar('POST', '/api/usuarios', { token: sesiones.admin, cuerpo: { usuario, nombre: usuario.toUpperCase(), clave: 'clave-segura', rol } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    sesiones[usuario] = (await entrar(usuario, 'clave-segura')).token;
  }
});

after(async () => {
  servidor?.close();
  await pool.end();
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${nombreBase} WITH (FORCE)`);
  await c.end();
});

import { createServer } from 'node:http';
const { leerPrecio, compararProductos } = await import('../src/comparador.js');
const { leerRobots, productosJsonLd } = await import('../src/comparador_web.js');
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// Filas tal como las lee el navegador de las listas reales que mandó el dueño.
const SIBLINGS = [ // ENERGY_VICTRON_2026.pdf (Electronic Siblings SAC, US$ sin IGV)
  { fila: 31, codigo: 'PMP483021010', descripcion: 'INVERSOR-CARGADOR MULTIPLUS 48/3000/35-50 230V (PMP483021010)', precio: '$892.00', categoria: 'INVERSOR/CARGADORES' },
  { fila: 35, codigo: 'PMP482306000', descripcion: 'INVERSOR-CARGADOR MULTIPLUS-II 48-3000-35-32 GX 230V (PMP482306000)', precio: '$695.00', categoria: 'INVERSOR/CARGADORES' },
  { fila: 37, codigo: 'PMP482305012', descripcion: 'MultiPlus-II 48/3000/35-32 230V (PMP482305012)', precio: '$610.00', categoria: 'INVERSOR/CARGADORES' },
  { fila: 59, codigo: 'SCC020035000', descripcion: 'CONTROLADOR DE CARGA BLUESOLAR MPPT 150/35 (SCC020035000)', precio: '$158.00' },
  { fila: 15, codigo: 'ORI244810110', descripcion: 'CONVERTIDOR Orion-Tr 24/48-2,5A (ORI244810110)', precio: '63.000' },
  { fila: 99, codigo: 'SCC020035000', descripcion: 'CONTROLADOR DE CARGA BLUESOLAR MPPT 150/35 (SCC020035000)', precio: '$160.00' }, // repetido
  { fila: 100, codigo: 'XX1', descripcion: 'Producto sin precio', precio: '' },
];
const EXCEL = [ // LISTA_DE_PRECIOS_-_INVERSIONES_ICR.xlsx (precio con IGV; la moneda se elige al cargar)
  { fila: 5, marca: 'VICTRON ENERGY', descripcion: 'MultiPlus-II 48/3000/35-32 230V', precio: 761.18 },
  { fila: 12, marca: 'VICTRON ENERGY', descripcion: 'BlueSolar MPPT 150/35', precio: 213.76 },
  { fila: 13, marca: 'VICTRON ENERGY', descripcion: 'BlueSolar MPPT 150/45', precio: 173.05 },
  { fila: 29, marca: 'ZYC ENERGY', descripcion: 'Batería LifePO4 SIMPO 5000i 51.2V-100Ah 5.12kWh', precio: 978.22 },
];

describe('lectura de precios y reconocimiento del mismo producto', () => {
  it('precios escritos de muchas formas', () => {
    assert.deepEqual(leerPrecio('$1,616.00'), { valor: '1616.00', moneda: 'USD', aviso: null });
    assert.deepEqual(leerPrecio('S/ 1.234,50'), { valor: '1234.50', moneda: 'PEN', aviso: null });
    assert.equal(leerPrecio('$1,400').valor, '1400.00');
    assert.equal(leerPrecio('63.000').valor, '63.00');
    assert.match(leerPrecio('63.000').aviso, /revisa/);
    assert.equal(leerPrecio(761.18).valor, '761.18');
    assert.equal(leerPrecio('consultar'), null);
  });
  it('mismo producto entre proveedores (y variantes que no lo son)', () => {
    const excel = { marca: 'VICTRON ENERGY', descripcion: 'MultiPlus-II 48/3000/35-32 230V' };
    assert.equal(compararProductos(excel, { codigo: 'PMP482305012', descripcion: 'MultiPlus-II 48/3000/35-32 230V (PMP482305012)' }), 'exacta');
    assert.equal(compararProductos(excel, { codigo: 'PMP482306000', descripcion: 'INVERSOR-CARGADOR MULTIPLUS-II 48-3000-35-32 GX 230V (PMP482306000)' }), 'alternativa');
    assert.equal(compararProductos({ descripcion: 'BlueSolar MPPT 150/35' }, { codigo: 'SCC020035000', descripcion: 'CONTROLADOR DE CARGA BLUESOLAR MPPT 150/35 (SCC020035000)' }), 'exacta');
    assert.equal(compararProductos({ descripcion: 'BlueSolar MPPT 150/45' }, { descripcion: 'SmartSolar MPPT 150/45' }), 'alternativa');
    assert.equal(compararProductos({ marca: 'Huawei', descripcion: 'Inversor 50KTL' }, { marca: 'Victron', descripcion: 'Inversor 50KTL' }), null);
  });
  it('robots.txt y datos de producto JSON-LD', () => {
    const r = leerRobots('User-agent: *\nDisallow: /privado\nAllow: /privado/publico\nCrawl-delay: 2');
    assert.equal(r.permite('/productos/x'), true);
    assert.equal(r.permite('/privado/a'), false);
    assert.equal(r.permite('/privado/publico/a'), true);
    assert.equal(r.pausa, 2000);
    const p = productosJsonLd('<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Panel 550 W","sku":"P550","brand":{"name":"JA"},"offers":{"price":"420.00","priceCurrency":"PEN","availability":"https://schema.org/InStock"}}]}</script>', 'https://x.pe/p/1');
    assert.deepEqual(p[0], { codigo: 'P550', descripcion: 'Panel 550 W', precio: '420.00', moneda: 'PEN', marca: 'JA', categoria: null, disponibilidad: 'En stock', url: 'https://x.pe/p/1' });
  });
});

describe('proveedores y listas', () => {
  let siblings;
  let dartel;
  it('permisos: técnico no ve; contabilidad solo consulta; ventas gestiona', async () => {
    assert.equal((await llamar('GET', '/api/comparador/proveedores', { token: sesiones.tito })).estado, 403);
    assert.equal((await llamar('GET', '/api/comparador/proveedores', { token: sesiones.fina })).estado, 200);
    assert.equal((await llamar('POST', '/api/comparador/proveedores', { token: sesiones.fina, cuerpo: { nombre: 'X' } })).estado, 403);
    assert.equal((await llamar('POST', '/api/comparador/proveedores', { token: sesiones.vera, cuerpo: { nombre: 'X', ruc: '20605309488' } })).estado, 400);
    siblings = (await llamar('POST', '/api/comparador/proveedores', { token: sesiones.vera, cuerpo: { nombre: 'Electronic Siblings SAC', moneda: 'USD' } })).datos;
    dartel = (await llamar('POST', '/api/comparador/proveedores', { token: sesiones.vera, cuerpo: { nombre: 'Dartel', costo_envio: '35' } })).datos;
    assert.equal(siblings.costo_envio, null); // Sin dato
    assert.equal(dartel.costo_envio, '35.00');
  });
  it('vista previa: nuevos, repetidos, sin precio y avisos; no guarda nada', async () => {
    const r = await llamar('POST', '/api/comparador/importar', { token: sesiones.vera, cuerpo: { proveedor_id: siblings.id, fecha_lista: '2026-10-20', moneda: 'USD', incluye_igv: false, archivo: 'ENERGY_VICTRON_2026.pdf', filas: SIBLINGS } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.deepEqual(r.datos.resumen, { filas: 7, nuevos: 5, cambiaron: 0, sin_cambios: 0, errores: 1, duplicados: 1, sin_dato: { codigo: 0, marca: 6, modelo: 6, unidad: 6, disponibilidad: 6 } });
    assert.match(r.datos.filas.find((f) => f.fila === 15).aviso, /revisa/);
    assert.equal(r.datos.filas.find((f) => f.fila === 59).estado, 'duplicado'); // se usa la última (fila 99)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM proveedor_productos')).rows[0].n, 0);
  });
  it('confirmar guarda productos y precios; recordar cómo se leyó; volver a cargar no duplica', async () => {
    const c = await llamar('POST', '/api/comparador/importar', { token: sesiones.vera, cuerpo: { proveedor_id: siblings.id, fecha_lista: '2026-10-20', moneda: 'USD', incluye_igv: false, archivo: 'ENERGY_VICTRON_2026.pdf', filas: SIBLINGS, mapeo: { codigo: 1, descripcion: 2, precio: 3 }, confirmar: true } });
    assert.equal(c.datos.confirmado, true);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM proveedor_productos WHERE proveedor_id = $1', [siblings.id])).rows[0].n, 5);
    assert.equal((await pool.query("SELECT precio::text FROM proveedor_precios h JOIN proveedor_productos p ON p.id = h.producto_id WHERE p.codigo = 'SCC020035000'")).rows[0].precio, '160.00');
    assert.deepEqual((await llamar('GET', `/api/comparador/proveedores/${siblings.id}/mapeo`, { token: sesiones.vera })).datos.mapeo, { codigo: 1, descripcion: 2, precio: 3 });
    const otra = SIBLINGS.slice(0, 3).map((f) => (f.codigo === 'PMP483021010' ? { ...f, precio: '$905.00' } : f));
    const r2 = await llamar('POST', '/api/comparador/importar', { token: sesiones.vera, cuerpo: { proveedor_id: siblings.id, fecha_lista: hoy(), moneda: 'USD', incluye_igv: false, archivo: 'nov.pdf', filas: otra, confirmar: true } });
    assert.equal(r2.datos.resumen.cambiaron, 1);
    assert.equal(r2.datos.resumen.sin_cambios, 2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM proveedor_productos WHERE proveedor_id = $1', [siblings.id])).rows[0].n, 5);
  });
  it('el historial de precios no se modifica ni se borra', async () => {
    await assert.rejects(pool.query('UPDATE proveedor_precios SET precio = 1'), /no se modifica ni se borra/);
    await assert.rejects(pool.query('DELETE FROM proveedor_precios'), /no se modifica ni se borra/);
  });
  it('la lista en Excel (con IGV) a otro proveedor', async () => {
    const r = await llamar('POST', '/api/comparador/importar', { token: sesiones.vera, cuerpo: { proveedor_id: dartel.id, fecha_lista: hoy(), moneda: 'USD', incluye_igv: true, archivo: 'LISTA_DE_PRECIOS.xlsx', filas: EXCEL, confirmar: true } });
    assert.equal(r.datos.resumen.nuevos, 4);
    assert.equal((await llamar('POST', '/api/comparador/importar', { token: sesiones.vera, cuerpo: { proveedor_id: dartel.id, fecha_lista: hoy(), filas: EXCEL } })).estado, 400); // falta decir si incluye IGV
  });
});

describe('búsqueda y comparación', () => {
  before(async () => {
    const p = (await llamar('GET', '/api/parametros', { token: sesiones.admin })).datos;
    await llamar('PUT', '/api/parametros', { token: sesiones.admin, cuerpo: { ...p, tipo_cambio: { valor: '3.75', fecha: hoy(), fuente: 'SBS' } } });
  });
  let res;
  it('el mismo producto en ambos proveedores, en soles con IGV y costos conocidos; la mejor opción', async () => {
    res = (await llamar('GET', '/api/comparador/buscar?q=MultiPlus-II 48/3000/35-32', { token: sesiones.fina })).datos;
    const ex = res.resultados.filter((r) => r.coincidencia === 'exacta');
    assert.deepEqual(ex.map((r) => r.proveedor).sort(), ['Dartel', 'Electronic Siblings SAC']);
    const d = ex.find((r) => r.proveedor === 'Dartel');
    assert.equal(d.soles, '2854.43'); // 761.18 × 3.75
    assert.equal(d.total, '2889.43'); // + S/ 35 de envío
    const s = ex.find((r) => r.proveedor === 'Electronic Siblings SAC');
    assert.equal(s.con_igv, '719.80'); // 610 + IGV
    assert.equal(s.soles, '2699.25');
    assert.equal(s.extra_conocido, false); // su envío es «Sin dato»
    assert.equal(res.mejor.id, s.id);
    assert.equal(res.mejor.ahorro, '190.18');
    const gx = res.resultados.find((r) => r.codigo === 'PMP482306000');
    assert.equal(gx.coincidencia, 'alternativa');
  });
  it('las decisiones de las personas se respetan', async () => {
    const ref = res.referencia.id;
    const gx = res.resultados.find((r) => r.codigo === 'PMP482306000').id;
    assert.equal((await llamar('POST', '/api/comparador/equivalencias', { token: sesiones.fina, cuerpo: { a_id: ref, b_id: gx, estado: 'rechazada' } })).estado, 403);
    await llamar('POST', '/api/comparador/equivalencias', { token: sesiones.vera, cuerpo: { a_id: ref, b_id: gx, estado: 'rechazada' } });
    let r = (await llamar('GET', '/api/comparador/buscar?q=MultiPlus-II 48/3000/35-32', { token: sesiones.vera })).datos;
    assert.equal(r.resultados.some((x) => x.id === gx), false);
    r = (await llamar('GET', '/api/comparador/buscar?q=MultiPlus-II 48/3000/35-32&distintas=1', { token: sesiones.vera })).datos;
    assert.equal(r.resultados.find((x) => x.id === gx).coincidencia, 'distinta');
  });
  it('detalle: historial de precios y serie mensual en soles', async () => {
    const id = (await pool.query("SELECT id FROM proveedor_productos WHERE codigo = 'PMP483021010'")).rows[0].id;
    const d = (await llamar('GET', `/api/comparador/productos/${id}`, { token: sesiones.fina })).datos;
    assert.deepEqual(d.historial.map((h) => h.precio), ['892.00', '905.00']);
    assert.equal(d.historial[0].origen_detalle, 'ENERGY_VICTRON_2026.pdf · fila 31');
  });
});

describe('páginas web de proveedores (tiendas simuladas)', () => {
  let srv;
  let url;
  const visitas = [];
  before(async () => {
    srv = createServer((req, res) => {
      visitas.push(req.url);
      const json = (o) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o));
      if (req.url === '/robots.txt') return res.end('User-agent: *\nDisallow: /privado\n');
      if (req.url.startsWith('/wp-json/wc/store/v1/products')) {
        return json(new URL(req.url, 'http://x').searchParams.get('page') === '1' ? [
          { id: 1, name: 'Panel Solar 550W Mono &amp; Bifacial', sku: 'TS-550', permalink: 'https://tienda/p/550', prices: { price: '42000', currency_code: 'PEN', currency_minor_unit: 2 }, is_in_stock: true, categories: [{ name: 'Paneles' }] },
          { id: 2, name: 'MultiPlus-II 48/3000/35-32 230V', sku: 'TS-MP3000', permalink: 'https://tienda/p/mp', prices: { price: '310000', currency_code: 'PEN', currency_minor_unit: 2 }, is_in_stock: false },
        ] : []);
      }
      res.writeHead(404).end('no');
    });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${srv.address().port}`;
  });
  after(() => srv?.close());
  it('Tienda Solar (WooCommerce): se detecta sola, guarda precios y deja registro', async () => {
    const ts = (await llamar('POST', '/api/comparador/proveedores', { token: sesiones.vera, cuerpo: { nombre: 'Tienda Solar' } })).datos;
    assert.equal((await llamar('POST', `/api/comparador/proveedores/${ts.id}/fuentes`, { token: sesiones.vera, cuerpo: { url: 'http://localhost:5432/' } })).estado, 400);
    const f = (await llamar('POST', `/api/comparador/proveedores/${ts.id}/fuentes`, { token: sesiones.vera, cuerpo: { url, frecuencia_dias: 7, moneda: 'PEN', incluye_igv: true } })).datos;
    const r = (await llamar('POST', `/api/comparador/fuentes/${f.id}/leer`, { token: sesiones.vera })).datos;
    assert.equal(r.estado, 'ok', JSON.stringify(r));
    assert.equal(r.adaptador, 'woocommerce');
    assert.equal(r.leidos, 2);
    assert.ok(visitas[0] === '/robots.txt');
    const p = (await pool.query("SELECT p.descripcion, p.disponibilidad, h.precio::text, h.origen FROM proveedor_productos p JOIN proveedor_precios h ON h.producto_id = p.id WHERE p.codigo = 'TS-550'")).rows[0];
    assert.deepEqual(p, { descripcion: 'Panel Solar 550W Mono & Bifacial', disponibilidad: 'En stock', precio: '420.00', origen: 'web' });
    const ej = (await llamar('GET', `/api/comparador/fuentes/${f.id}/ejecuciones`, { token: sesiones.fina })).datos;
    assert.equal(ej[0].estado, 'ok');
    const b = (await llamar('GET', '/api/comparador/buscar?q=MultiPlus-II 48/3000/35-32', { token: sesiones.fina })).datos;
    assert.ok(b.resultados.some((x) => x.proveedor === 'Tienda Solar' && x.coincidencia === 'exacta'));
  });
  it('si la página falla, queda el error registrado y no se rompe nada', async () => {
    const dt = (await llamar('GET', '/api/comparador/proveedores', { token: sesiones.vera })).datos.proveedores.find((p) => p.nombre === 'Dartel');
    const f = (await llamar('POST', `/api/comparador/proveedores/${dt.id}/fuentes`, { token: sesiones.vera, cuerpo: { url: `${url}/privado/catalogo`, adaptador: 'jsonld' } })).datos;
    const r = (await llamar('POST', `/api/comparador/fuentes/${f.id}/leer`, { token: sesiones.vera })).datos;
    assert.equal(r.estado, 'error');
    assert.match(r.mensaje, /robots\.txt no permite/);
    const lista = (await llamar('GET', '/api/comparador/proveedores', { token: sesiones.vera })).datos.proveedores.find((p) => p.nombre === 'Dartel');
    assert.equal(lista.fuentes.find((x) => x.tipo === 'web').ultimo_estado, 'error');
  });
});
