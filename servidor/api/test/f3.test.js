// ERP · Fase 3: catálogo, importar CSV, imágenes, kits y cotizaciones con PDF (contra PostgreSQL de verdad).
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

const { crearApp } = await import('../src/index.js');
const { prepararBase, pool } = await import('../src/db.js');
const { calcular } = await import('../src/cotizar.js');

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



const sql = (t, v = []) => pool.query(t, v).then((r) => r.rows);
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');

describe('cálculo de la cotización (precios con IGV incluido)', () => {
  it('totales exactos con descuentos por ítem y comercial', () => {
    const { lineas, totales } = calcular([
      { descripcion: 'Panel 550 W', cantidad: '36', precio_unitario: '650.00', descuento_pct: '5' },
      { descripcion: 'Inversor 5 kVA', cantidad: '1', precio_unitario: '14999.90' },
    ], '500');
    assert.equal(lineas[0].importe, '22230.00');
    assert.deepEqual(totales, { subtotal: '38399.90', descuento_lineas: '1170.00', descuento: '500.00', total: '36729.90', valor_venta: '31127.03', igv: '5602.87' });
    // valor de venta + IGV = total, siempre
    const t2 = calcular([{ descripcion: 'x', cantidad: '3', precio_unitario: '0.10' }]).totales;
    assert.deepEqual([t2.total, t2.valor_venta, t2.igv], ['0.30', '0.25', '0.05']);
    assert.equal(calcular([{ descripcion: 'cable', cantidad: '12.5', precio_unitario: '3.99' }]).totales.total, '49.88');
  });
  it('rechaza lo que no cuadra', () => {
    assert.throws(() => calcular([]), /al menos un ítem/);
    assert.throws(() => calcular([{ descripcion: '', cantidad: 1, precio_unitario: 1 }]), /descripción/);
    assert.throws(() => calcular([{ descripcion: 'x', cantidad: 0, precio_unitario: 1 }]), /cantidad/);
    assert.throws(() => calcular([{ descripcion: 'x', cantidad: 1, precio_unitario: '1.234' }]), /precio/);
    assert.throws(() => calcular([{ descripcion: 'x', cantidad: 1, precio_unitario: 10, descuento_pct: '101' }]), /descuento/);
    assert.throws(() => calcular([{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }], '10.01'), /mayor que el total/);
  });
});

describe('migración', () => {
  it('el código se toma de la referencia interna solo si no se repite; la empresa queda precargada', async () => {
    const [p] = await sql("SELECT codigo_erp FROM productos WHERE referencia_interna = 'MPPT 100/20'");
    assert.equal(p.codigo_erp, 'MPPT 100/20');
    const repetidos = await sql('SELECT referencia_interna, count(*)::int AS n, count(codigo_erp)::int AS con FROM productos WHERE referencia_interna IS NOT NULL GROUP BY 1 HAVING count(*) > 1');
    assert.ok(repetidos.length > 0);
    assert.ok(repetidos.every((r) => r.con === 0));
    const e = (await llamar('GET', '/api/empresa', { token: sesiones.vera })).datos;
    assert.equal(e.razon_social, 'INVERSIONES ICR S.R.L.');
    assert.equal(e.ruc, '20605309489');
    assert.equal(e.telefono, null);
  });
});

let prodA;
describe('catálogo', () => {
  it('permisos: técnico no ve; contabilidad solo lee (sin costo); ventas edita', async () => {
    assert.equal((await llamar('GET', '/api/catalogo', { token: sesiones.tito })).estado, 403);
    const lect = await llamar('GET', '/api/catalogo', { token: sesiones.fina });
    assert.equal(lect.estado, 200);
    assert.ok(lect.datos.productos.length >= 799);
    assert.equal(lect.datos.productos[0].costo, undefined);
    assert.equal((await llamar('POST', '/api/catalogo', { token: sesiones.fina, cuerpo: { nombre: 'x' } })).estado, 403);
    const comp = (await llamar('GET', '/api/catalogo', { token: sesiones.vera })).datos.productos;
    const mppt = comp.find((x) => x.codigo === 'MPPT 100/20');
    assert.equal(mppt.precio, '390.00');
    assert.equal(mppt.costo, '233.00');
    assert.equal(mppt.imagen, '/productos/MPPT_100_20.jpg');
  });
  it('crear y editar; el código no se repite; cambiar el precio deja la fecha', async () => {
    const r = await llamar('POST', '/api/catalogo', { token: sesiones.vera, cuerpo: { codigo: 'HW-50KTL', nombre: 'Inversor Huawei SUN2000-50KTL-M3', marca: 'Huawei', categoria: 'inversores de red', precio: '28,500.00', moneda: 'PEN' } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    prodA = r.datos;
    assert.equal(prodA.categoria, 'INVERSORES DE RED');
    assert.equal(prodA.precio, '28500.00');
    assert.ok(prodA.precio_actualizado_en);
    assert.equal((await llamar('POST', '/api/catalogo', { token: sesiones.vera, cuerpo: { codigo: 'hw-50ktl', nombre: 'Otro' } })).estado, 409);
    const e = await llamar('PUT', `/api/catalogo/${prodA.id}`, { token: sesiones.vera, cuerpo: { precio: '29000', caracteristicas: 'Potencia: 50 kW' } });
    assert.equal(e.datos.precio, '29000.00');
    assert.equal(e.datos.caracteristicas, 'Potencia: 50 kW');
    assert.equal((await sql("SELECT count(*)::int AS n FROM audit_log WHERE entidad = 'producto'"))[0].n, 2);
  });
});

describe('importar CSV', () => {
  const filas = [
    { codigo: 'HW-50KTL', precio: '29,580.00' },
    { codigo: 'MPPT 100/20', nombre: '100/20 MPPT BLUESOLAR', precio: '390' },
    { codigo: 'NUEVO-1', nombre: 'Batería litio 5 kWh', marca: 'Felicity', precio: 'S/ 6,200.50', moneda: 'soles', categoria: 'Baterias' },
    { codigo: '', nombre: 'sin código' },
    { codigo: 'NUEVO-1', nombre: 'repetido' },
    { codigo: 'NUEVO-2', precio: 'abc' },
    { codigo: 'NUEVO-3', precio: '10' },
  ];
  it('vista previa: nuevos, actualizados, sin cambios y errores; no cambia nada', async () => {
    const r = await llamar('POST', '/api/catalogo/importar', { token: sesiones.vera, cuerpo: { filas } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.deepEqual(r.datos.resumen, { nuevos: 1, actualizados: 1, sin_cambios: 1, errores: 4, variacion_promedio_pct: 2, kits_afectados: 0, kits_total: 0 });
    assert.deepEqual(r.datos.filas.map((f) => f.estado), ['actualizado', 'sin_cambios', 'nuevo', 'error', 'error', 'error', 'error']);
    assert.equal(r.datos.filas[0].precio_anterior, '29000.00');
    assert.match(r.datos.filas[3].error, /código/);
    assert.match(r.datos.filas[4].error, /repetido/);
    assert.match(r.datos.filas[6].error, /sin nombre/);
    assert.equal((await sql("SELECT count(*)::int AS n FROM productos WHERE codigo_erp = 'NUEVO-1'"))[0].n, 0);
  });
  it('confirmar aplica todo en una transacción y queda en la auditoría', async () => {
    const r = await llamar('POST', '/api/catalogo/importar', { token: sesiones.vera, cuerpo: { filas, confirmar: true, archivo: 'lista_oct.csv' } });
    assert.equal(r.datos.confirmado, true);
    const [n] = await sql("SELECT precio_venta::text AS p, marca, moneda, categoria_producto AS c, source FROM productos WHERE codigo_erp = 'NUEVO-1'");
    assert.deepEqual(n, { p: '6200.50', marca: 'Felicity', moneda: 'PEN', c: 'BATERIAS', source: 'csv' });
    assert.equal((await sql("SELECT precio_venta::text AS p FROM productos WHERE codigo_erp = 'HW-50KTL'"))[0].p, '29580.00');
    const [a] = await sql("SELECT detalle FROM audit_log WHERE entidad = 'catalogo' AND accion = 'importar'");
    assert.equal(a.detalle, 'lista_oct.csv');
    assert.equal((await llamar('POST', '/api/catalogo/importar', { token: sesiones.fina, cuerpo: { filas } })).estado, 403);
  });
});

describe('imágenes por código', () => {
  it('el nombre del archivo es el código', async () => {
    const v = (await llamar('POST', '/api/catalogo/imagenes/verificar', { token: sesiones.vera, cuerpo: { nombres: ['HW-50KTL.jpg', 'no-existe.png'] } })).datos;
    assert.equal(v[0].producto_id, prodA.id);
    assert.equal(v[1].producto_id, null);
    const ruta = (await llamar('POST', '/api/subidas?ext=png', { token: sesiones.vera, crudo: png })).datos.ruta;
    assert.equal((await llamar('POST', '/api/catalogo/imagenes', { token: sesiones.vera, cuerpo: { asignaciones: [{ producto_id: prodA.id, ruta }] } })).datos.asignadas, 1);
    assert.equal((await llamar('GET', `/api/catalogo/${prodA.id}`, { token: sesiones.vera })).datos.imagen, ruta);
    assert.equal((await llamar('POST', '/api/catalogo/imagenes', { token: sesiones.vera, cuerpo: { asignaciones: [{ producto_id: prodA.id, ruta: '/etc/passwd' }] } })).estado, 400);
  });
});

let kit;
describe('kits', () => {
  it('crear: un producto del catálogo usa su precio de hoy; un ítem libre lleva su precio', async () => {
    assert.equal((await llamar('POST', '/api/kits', { token: sesiones.vera, cuerpo: { nombre: 'X', items: [{ descripcion: 'Instalación', cantidad: 1 }] } })).estado, 400);
    const r = await llamar('POST', '/api/kits', { token: sesiones.vera, cuerpo: { nombre: 'On-Grid 50 kW Huawei', descripcion: 'Inversor + instalación', items: [
      { producto_id: prodA.id, cantidad: 1 },
      { descripcion: 'Instalación y puesta en marcha', cantidad: 1, precio_unitario: '4500', descuento_pct: '10' },
    ] } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    kit = r.datos;
    assert.equal(kit.items[0].descripcion, 'Inversor Huawei SUN2000-50KTL-M3');
    assert.equal(kit.items[0].precio_unitario, null);
    assert.equal(kit.items[0].precio_efectivo, '29580.00');
    assert.equal(kit.totales.total, '33630.00');
  });
  it('si cambia el precio del catálogo, el kit lo refleja y la importación lo avisa', async () => {
    const r = await llamar('POST', '/api/catalogo/importar', { token: sesiones.vera, cuerpo: { filas: [{ codigo: 'HW-50KTL', precio: '30000' }] } });
    assert.equal(r.datos.resumen.kits_afectados, 1);
    await llamar('PUT', `/api/catalogo/${prodA.id}`, { token: sesiones.vera, cuerpo: { precio: '30000' } });
    assert.equal((await llamar('GET', `/api/kits/${kit.id}`, { token: sesiones.fina })).datos.totales.total, '34050.00');
  });
  it('editar con versión, variante y eliminar', async () => {
    const e = await llamar('PUT', `/api/kits/${kit.id}`, { token: sesiones.vera, cuerpo: { version: kit.version, items: [{ producto_id: prodA.id, cantidad: 2, precio_unitario: '29000' }] } });
    assert.equal(e.estado, 200, JSON.stringify(e.datos));
    assert.equal(e.datos.totales.total, '58000.00');
    assert.equal((await llamar('PUT', `/api/kits/${kit.id}`, { token: sesiones.vera, cuerpo: { version: kit.version, nombre: 'Z' } })).estado, 409);
    const v = await llamar('POST', `/api/kits/${kit.id}/variante`, { token: sesiones.vera, cuerpo: { nombre: 'On-Grid 50 kW (sin instalación)' } });
    assert.equal(v.datos.variante_de, kit.id);
    assert.equal(v.datos.items.length, 1);
    assert.equal((await llamar('DELETE', `/api/kits/${v.datos.id}`, { token: sesiones.vera })).estado, 200);
    assert.equal((await llamar('GET', '/api/kits', { token: sesiones.vera })).datos.length, 1);
  });
});

let cot;
describe('cotizaciones del ERP', () => {
  const cuerpo = () => ({
    cliente: 'Granja Avícola Tiabaya S.A.C.', ruc_dni: '20605309489', telefono: '959214377', atencion: 'Marco Zegarra', sistema: 'Sistema On-Grid 50 kW', validez_dias: 15,
    condiciones: 'Forma de pago: 50% de adelanto.', banco: 'BCP', moneda: 'Soles', nro_cuenta: '215-0000000-0-00', kit_id: kit.id, descuento: '1000',
    items: [
      { producto_id: prodA.id, codigo: 'HW-50KTL', descripcion: 'Inversor Huawei SUN2000-50KTL-M3', cantidad: '1', precio_unitario: '30000.00', unidad: 'Unidades' },
      { descripcion: 'Instalación y puesta en marcha', cantidad: '1', precio_unitario: '4500.00', descuento_pct: '10' },
    ],
  });
  it('crear: número correlativo con la numeración de Configuración, borrador y totales del servidor', async () => {
    assert.equal((await llamar('POST', '/api/ventas/cotizaciones', { token: sesiones.fina, cuerpo: cuerpo() })).estado, 403);
    assert.equal((await llamar('POST', '/api/ventas/cotizaciones', { token: sesiones.vera, cuerpo: { ...cuerpo(), ruc_dni: '20605309488' } })).estado, 400);
    const antes = (await sql("SELECT valor FROM correlativos WHERE clave = 'cotizacion'"))[0]?.valor ?? 0;
    const r = await llamar('POST', '/api/ventas/cotizaciones', { token: sesiones.vera, cuerpo: cuerpo() });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    cot = r.datos;
    assert.equal(cot.numero, `S${String(antes + 1).padStart(5, '0')}`);
    assert.equal(cot.estado, 'borrador');
    assert.equal(cot.origen, 'erp');
    assert.deepEqual(cot.totales, { subtotal: '34500.00', descuento_lineas: '450.00', descuento: '1000.00', total: '33050.00', valor_venta: '28008.47', igv: '5041.53' });
    assert.equal(cot.valida_hasta.length, 10);
    assert.equal(cot.vendedor, 'VERA');
    // la plantilla del kit no cambió
    assert.equal((await llamar('GET', `/api/kits/${kit.id}`, { token: sesiones.vera })).datos.items.length, 1);
  });
  it('estados: borrador → enviada → aceptada; una aceptada no se edita (se puede reabrir)', async () => {
    assert.equal((await llamar('POST', `/api/ventas/cotizaciones/${cot.id}/estado`, { token: sesiones.vera, cuerpo: { estado: 'aceptada' } })).estado, 409);
    const e = await llamar('PUT', `/api/ventas/cotizaciones/${cot.id}`, { token: sesiones.vera, cuerpo: { ...cuerpo(), version: cot.version, descuento: '0' } });
    assert.equal(e.datos.totales.total, '34050.00');
    assert.equal((await llamar('PUT', `/api/ventas/cotizaciones/${cot.id}`, { token: sesiones.vera, cuerpo: { ...cuerpo(), version: cot.version } })).estado, 409);
    assert.equal((await llamar('POST', `/api/ventas/cotizaciones/${cot.id}/estado`, { token: sesiones.vera, cuerpo: { estado: 'enviada' } })).datos.estado, 'enviada');
    const ac = await llamar('POST', `/api/ventas/cotizaciones/${cot.id}/estado`, { token: sesiones.vera, cuerpo: { estado: 'aceptada' } });
    assert.ok(ac.datos.respondida_en);
    assert.equal((await llamar('PUT', `/api/ventas/cotizaciones/${cot.id}`, { token: sesiones.vera, cuerpo: { ...cuerpo(), version: ac.datos.version } })).estado, 409);
    assert.equal((await llamar('POST', `/api/ventas/cotizaciones/${cot.id}/estado`, { token: sesiones.vera, cuerpo: { estado: 'enviada' } })).estado, 200);
    const aud = await sql("SELECT detalle FROM audit_log WHERE entidad = 'cotizacion' AND accion = 'cambiar_estado' ORDER BY id");
    assert.deepEqual(aud.map((a) => a.detalle), ['borrador → enviada', 'enviada → aceptada', 'aceptada → enviada']);
  });
  it('PDF generado en el servidor', async () => {
    const r = await fetch(`${base}/api/ventas/cotizaciones/${cot.id}/pdf`, { headers: { authorization: `Bearer ${sesiones.fina}` } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    const b = Buffer.from(await r.arrayBuffer());
    assert.equal(b.subarray(0, 5).toString(), '%PDF-');
    assert.ok(b.length > 5000);
    assert.equal((await fetch(`${base}/api/ventas/cotizaciones/${cot.id}/pdf`, { headers: { authorization: `Bearer ${sesiones.tito}` } })).status, 403);
  });
  it('las de Logística se ven en el ERP con sus totales y sin estado', async () => {
    const r = await llamar('POST', '/api/cotizaciones', { token: sesiones.vera, cuerpo: { numero: 'S09999', cliente: 'Cliente Logística', fecha: '2026-10-01T10:00:00', total: 780, items_json: JSON.stringify([{ nombre: '100/20 MPPT BLUESOLAR', cantidad: 2, precio_unitario: 390, unidad_medida: 'Unidades' }]) } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    const lista = (await llamar('GET', '/api/ventas/cotizaciones', { token: sesiones.fina })).datos.cotizaciones;
    const l = lista.find((c) => c.numero === 'S09999');
    assert.equal(l.origen, 'logistica');
    assert.equal(l.estado, null);
    const d = (await llamar('GET', `/api/ventas/cotizaciones/${l.id}`, { token: sesiones.fina })).datos;
    assert.equal(d.items[0].descripcion, '100/20 MPPT BLUESOLAR');
    assert.deepEqual([d.totales.total, d.totales.valor_venta, d.totales.igv], ['780.00', '661.02', '118.98']);
    const pdf = await fetch(`${base}/api/ventas/cotizaciones/${l.id}/pdf`, { headers: { authorization: `Bearer ${sesiones.vera}` } });
    assert.equal(pdf.status, 200);
  });
});
