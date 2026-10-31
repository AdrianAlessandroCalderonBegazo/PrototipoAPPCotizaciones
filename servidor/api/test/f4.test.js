// ERP · Fase 4: Inicio completo, alertas/notificaciones y búsqueda global, según el rol (PostgreSQL de verdad + tablas de Finanzas).
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



const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const sql = (t, v = []) => pool.query(t, v).then((r) => r.rows);

let p80, p120, cta;
let listo = null;
// Datos de prueba (una sola vez; cada grupo lo espera en su before).
const preparar = () => (listo ??= (async () => {
  p80 = (await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { nombre: 'Lácteos Characato', presupuesto: '1000', cliente: 'Lácteos del Sur' } })).datos;
  p120 = (await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { nombre: 'Hostal Los Tambos', presupuesto: '1000' } })).datos;
  cta = (await llamar('POST', '/api/contabilidad/cuentas', { token: sesiones.fina, cuerpo: { nombre: 'BCP Cta. cte. S/', moneda: 'PEN', principal: true } })).datos;
  for (const [p, m] of [[p80, '850'], [p120, '1200']]) {
    const r = await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'egreso', monto: m, fecha: hoy, concepto: `Equipos ${p.nombre}`, proyecto_id: p.id, documento: 'F001-77' } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
  }
  await sql("INSERT INTO caja_icr_mov (id, fecha, tipo, medio, origen, categoria, descripcion, persona, monto) VALUES (gen_random_uuid(), $1, 'EGRESO', 'EFECTIVO', 'GASTO', 'Movilidad', 'Taxi', 'Luis', 40)", [hoy]);
  await sql("INSERT INTO requerimientos (numero, obra, solicitante, urgente, estado, fecha_creacion) VALUES ('REQ-0001', 'Obra Characato', 'Juan', TRUE, 'pendiente', now())");
  const c = (await llamar('POST', '/api/ventas/cotizaciones', { token: sesiones.vera, cuerpo: { cliente: 'Granja Tiabaya', validez_dias: 15, items: [{ descripcion: 'Panel', cantidad: '2', precio_unitario: '500' }] } })).datos;
  await llamar('POST', `/api/ventas/cotizaciones/${c.id}/estado`, { token: sesiones.vera, cuerpo: { estado: 'enviada' } });
  await sql("UPDATE cotizaciones SET fecha = (now() AT TIME ZONE 'America/Lima') - interval '13 days' WHERE id = $1", [c.id]); // vence en 2 días
})());

describe('Inicio en un solo pedido, según el rol', () => {
  before(preparar);
  it('Contabilidad ve finanzas, proyectos y cotizaciones (lectura); no tiene datos inventados', async () => {
    const r = (await llamar('GET', '/api/inicio', { token: sesiones.fina })).datos;
    assert.equal(r.finanzas.cuenta.id, cta.id);
    assert.equal(r.finanzas.cuenta.saldo, null); // sin saldo inicial = Sin dato
    assert.equal(r.finanzas.kpis.egresos_mes, '2050.00');
    assert.deepEqual(r.finanzas.caja.saldos, { efectivo: '-40.00', digital: '0.00', total: '-40.00' });
    assert.equal(r.proyectos.total_activos, 2);
    assert.equal(r.proyectos.con_alerta, 2);
    assert.deepEqual(r.proyectos.activos.map((p) => p.porcentaje), [120, 85]);
    assert.equal(r.cotizaciones.del_mes >= 1, true);
    assert.equal(r.logistica.urgentes, 1);
  });
  it('Técnico: sin finanzas ni cotizaciones', async () => {
    const r = (await llamar('GET', '/api/inicio', { token: sesiones.tito })).datos;
    assert.equal(r.finanzas, undefined);
    assert.equal(r.cotizaciones, undefined);
    assert.ok(r.proyectos);
    assert.ok(r.logistica);
    assert.ok(!r.alertas.some((a) => a.origen === 'Contabilidad' || a.origen === 'Cotización'));
  });
});

describe('alertas y notificaciones', () => {
  before(preparar);
  it('presupuesto (aviso y límite), Caja ICR en negativo, cuenta sin saldo inicial, cotización por vencer, requerimientos', async () => {
    const a = (await llamar('GET', '/api/inicio', { token: sesiones.admin })).datos.alertas;
    const claves = a.map((x) => x.clave);
    assert.ok(claves.includes(`presupuesto:${p120.id}:limite`));
    assert.ok(claves.includes(`presupuesto:${p80.id}:aviso`));
    assert.ok(claves.some((c) => c.startsWith('caja_negativa:efectivo')));
    assert.ok(claves.some((c) => c.startsWith('sin_foto:')));
    assert.ok(claves.includes(`sin_saldo_inicial:${cta.id}`));
    assert.ok(claves.some((c) => c.startsWith('cot_vence:') && c.endsWith(':pronto')));
    assert.ok(claves.some((c) => c.startsWith('req_urgentes:')));
    assert.ok(claves.some((c) => c.startsWith('tc:sin')));
    assert.equal(a[0].nivel, 'alta'); // lo más grave primero
  });
  it('cada persona marca las suyas como leídas; si la situación cambia, vuelve a aparecer', async () => {
    const n = (await llamar('GET', '/api/notificaciones', { token: sesiones.fina })).datos;
    assert.ok(n.sin_leer > 0);
    await llamar('POST', '/api/notificaciones/leidas', { token: sesiones.fina, cuerpo: {} });
    assert.equal((await llamar('GET', '/api/notificaciones', { token: sesiones.fina })).datos.sin_leer, 0);
    assert.ok((await llamar('GET', '/api/notificaciones', { token: sesiones.admin })).datos.sin_leer > 0); // las de otro no cambian
    // el proyecto al 85 % pasa el 100 %: alerta nueva
    await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'egreso', monto: '200', fecha: hoy, concepto: 'Más equipos', proyecto_id: p80.id } });
    const d = (await llamar('GET', '/api/notificaciones', { token: sesiones.fina })).datos;
    assert.ok(d.notificaciones.some((x) => x.clave === `presupuesto:${p80.id}:limite` && !x.leida));
  });
});

describe('búsqueda global', () => {
  before(preparar);
  it('sin tildes y solo en lo que el rol puede ver', async () => {
    const r = (await llamar('GET', '/api/buscar?q=lacteos', { token: sesiones.fina })).datos;
    const grupos = Object.fromEntries(r.grupos.map((g) => [g.grupo, g.items]));
    assert.equal(grupos.Proyectos[0].ruta, `/proyectos/${p80.id}`);
    assert.ok(grupos['Movimientos de la cuenta']);
    const t = (await llamar('GET', '/api/buscar?q=granja', { token: sesiones.tito })).datos;
    assert.ok(!t.grupos.some((g) => g.grupo === 'Cotizaciones'));
    const v = (await llamar('GET', '/api/buscar?q=granja', { token: sesiones.vera })).datos;
    assert.ok(v.grupos.some((g) => g.grupo === 'Cotizaciones'));
    assert.ok((await llamar('GET', '/api/buscar?q=mppt', { token: sesiones.vera })).datos.grupos.some((g) => g.grupo === 'Productos'));
    assert.deepEqual((await llamar('GET', '/api/buscar?q=a', { token: sesiones.vera })).datos.grupos, []);
    assert.deepEqual((await llamar('GET', '/api/buscar?q=%25%25', { token: sesiones.vera })).datos.grupos, []);
  });
});
