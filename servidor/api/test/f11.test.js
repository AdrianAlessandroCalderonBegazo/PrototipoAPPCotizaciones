// Fase 11 · Caja ICR: una sola caja con dos saldos (efectivo y digital), gastos físicos, capturas, ventas, depósitos a la cuenta principal.
// Uso:  DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

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
const nuevoId = () => randomUUID();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const saldos = async (token = sesiones.fina) => (await llamar('GET', '/api/caja-icr/resumen', { token })).datos.saldos;
const registrar = (cuerpo, token = sesiones.fina) => llamar('POST', '/api/caja-icr/movimientos', { token, cuerpo: { id: nuevoId(), ...cuerpo } });

let cta;
let pry;
describe('Caja ICR', () => {
  before(async () => {
    cta = (await llamar('POST', '/api/contabilidad/cuentas', { token: sesiones.fina, cuerpo: { nombre: 'BCP Cta. cte. S/', moneda: 'PEN', principal: true, saldo_inicial: '1000', saldo_inicial_fecha: hoy } })).datos;
    pry = (await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { nombre: 'Planta Majes', presupuesto: '5000' } })).datos.proyecto
      ?? (await sql('SELECT id FROM proyectos ORDER BY id DESC LIMIT 1'))[0];
  });

  it('empieza en cero, con las categorías (incluida la del depósito) y sin ciudades', async () => {
    const r = (await llamar('GET', '/api/caja-icr/resumen', { token: sesiones.fina })).datos;
    assert.deepEqual(r.saldos, { efectivo: '0.00', digital: '0.00', total: '0.00' });
    assert.ok(r.categorias.EGRESO.includes('Depósito a cuenta principal'));
    assert.ok(r.categorias.INGRESO.includes('Venta'));
    assert.equal(JSON.stringify(r).includes('ciudad'), false);
  });

  it('una venta suma al saldo elegido; un gasto físico resta del efectivo', async () => {
    const v = await registrar({ origen: 'VENTA', medio: 'EFECTIVO', categoria: 'Venta', descripcion: 'Venta de 2 paneles', monto: '800' });
    assert.equal(v.estado, 201, JSON.stringify(v.datos));
    assert.equal(v.datos.mov.tipo, 'INGRESO');
    assert.equal((await registrar({ origen: 'VENTA', medio: 'DIGITAL', categoria: 'Venta', descripcion: 'Venta por Yape', monto: '150.50' })).estado, 201);
    const g = await registrar({ origen: 'GASTO', categoria: 'Movilidad', descripcion: 'Taxi a obra', persona: 'Luis', monto: '25.30', comprobante: 'NINGUNO', proyecto_id: pry.id });
    assert.equal(g.estado, 201, JSON.stringify(g.datos));
    assert.equal(g.datos.mov.medio, 'EFECTIVO');
    assert.deepEqual(await saldos(), { efectivo: '774.70', digital: '150.50', total: '925.20' });
    // el gasto con proyecto llega al proyecto
    const d = (await llamar('GET', `/api/proyectos/${pry.id}`, { token: sesiones.fina })).datos;
    assert.ok(d.gastos.some((x) => x.origen === 'caja_icr' && x.monto === '25.30'));
  });

  it('validaciones: categoría de la lista, descripción, fecha no futura, sin id no se registra', async () => {
    assert.equal((await registrar({ origen: 'GASTO', categoria: 'Inventada', descripcion: 'x', monto: 1 })).estado, 400);
    assert.equal((await registrar({ origen: 'GASTO', categoria: 'Movilidad', descripcion: '', monto: 1 })).estado, 400);
    assert.equal((await registrar({ origen: 'GASTO', categoria: 'Movilidad', descripcion: 'x', monto: 1, fecha: '2999-01-01' })).estado, 400);
    assert.equal((await registrar({ origen: 'GASTO', categoria: 'Venta', descripcion: 'x', monto: 1 })).estado, 400);
    assert.equal((await llamar('POST', '/api/caja-icr/movimientos', { token: sesiones.fina, cuerpo: { origen: 'GASTO', categoria: 'Movilidad', descripcion: 'x', monto: 1 } })).estado, 400);
    assert.equal((await registrar({ origen: 'GASTO', categoria: 'Gastos fijos', subcategoria: 'Taxi', descripcion: 'x', monto: 1 })).estado, 400);
    assert.equal((await registrar({ origen: 'AJUSTE', tipo: 'INGRESO', descripcion: 'x', monto: 1 })).estado, 403);
  });

  it('un reintento con el mismo id no duplica; una captura repetida (mismo n.º de operación) se avisa', async () => {
    const id = nuevoId();
    const cuerpo = { id, origen: 'CAPTURA', categoria: 'Proveedores', descripcion: 'Yape a Ferretería Sur', destinatario: 'Ferretería Sur', operacion: '12345678', monto: '50' };
    const a = await llamar('POST', '/api/caja-icr/movimientos', { token: sesiones.fina, cuerpo });
    assert.equal(a.estado, 201, JSON.stringify(a.datos));
    assert.equal(a.datos.mov.medio, 'DIGITAL');
    const b = await llamar('POST', '/api/caja-icr/movimientos', { token: sesiones.fina, cuerpo });
    assert.equal(b.estado, 200);
    assert.equal(b.datos.repetido, true);
    const c = await llamar('POST', '/api/caja-icr/movimientos', { token: sesiones.fina, cuerpo: { ...cuerpo, id: nuevoId() } });
    assert.equal(c.estado, 409);
    assert.equal(c.datos.duplicado, true);
    assert.equal(c.datos.existente.id, id);
    assert.equal((await sql("SELECT count(*)::int AS n FROM caja_icr_mov WHERE operacion = '12345678'"))[0].n, 1);
    assert.equal((await saldos()).digital, '100.50');
  });

  it('el saldo puede quedar en negativo, pero se avisa', async () => {
    const r = await registrar({ origen: 'CAPTURA', categoria: 'Otros egresos', descripcion: 'Pago grande', monto: '200' });
    assert.equal(r.estado, 201);
    assert.match(r.datos.aviso, /negativo/);
    const a = await llamar('POST', `/api/caja-icr/movimientos/${r.datos.mov.id}/anular`, { token: sesiones.fina, cuerpo: { motivo: 'Prueba' } });
    assert.equal(a.estado, 200);
    assert.equal((await saldos()).digital, '100.50');
  });

  it('«Depósito a cuenta principal»: sale de la caja y entra a la cuenta principal; se anulan juntos', async () => {
    const r = await registrar({ origen: 'GASTO', categoria: 'Depósito a cuenta principal', descripcion: 'Depósito en BCP agencia Mercaderes', monto: '500', proyecto_id: pry.id });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.mov.origen, 'DEPOSITO');
    assert.equal(r.datos.mov.proyecto_id, null);
    assert.equal((await saldos()).efectivo, '274.70');
    const [m] = await sql('SELECT tipo, monto::text AS monto, categoria, source, anulado FROM cuenta_movimientos WHERE id = $1', [r.datos.mov.cuenta_movimiento_id]);
    assert.deepEqual(m, { tipo: 'ingreso', monto: '500.00', categoria: 'Depósito desde Caja ICR', source: 'deposito_caja_icr', anulado: false });
    const cuenta = async () => (await llamar('GET', '/api/contabilidad/cuentas', { token: sesiones.fina })).datos.find((x) => x.id === cta.id).saldo;
    assert.equal(await cuenta(), '1500.00');
    // desde el ERP no se anula; un depósito no se edita (solo su descripción)
    assert.equal((await llamar('POST', `/api/contabilidad/movimientos/${r.datos.mov.cuenta_movimiento_id}/anular`, { token: sesiones.admin, cuerpo: { motivo: 'x' } })).estado, 409);
    assert.equal((await llamar('PUT', `/api/caja-icr/movimientos/${r.datos.mov.id}`, { token: sesiones.fina, cuerpo: { monto: '10' } })).estado, 409);
    assert.equal((await llamar('PUT', `/api/caja-icr/movimientos/${r.datos.mov.id}`, { token: sesiones.fina, cuerpo: { descripcion: 'Depósito BCP Mercaderes' } })).estado, 200);
    // se anula en la caja → también en la cuenta principal
    const a = await llamar('POST', `/api/caja-icr/movimientos/${r.datos.mov.id}/anular`, { token: sesiones.fina, cuerpo: { motivo: 'Depósito duplicado' } });
    assert.equal(a.estado, 200);
    assert.equal(await cuenta(), '1000.00');
    assert.equal((await saldos()).efectivo, '774.70');
    const [m2] = await sql('SELECT anulado, anulado_motivo FROM cuenta_movimientos WHERE id = $1', [r.datos.mov.cuenta_movimiento_id]);
    assert.equal(m2.anulado, true);
    assert.match(m2.anulado_motivo, /Caja ICR/);
    // un depósito digital también vale
    const d = await registrar({ origen: 'CAPTURA', categoria: 'Depósito a cuenta principal', descripcion: 'Transferencia a BCP', monto: '100' });
    assert.equal(d.estado, 201);
    assert.equal(await cuenta(), '1100.00');
    assert.equal((await saldos()).digital, '0.50');
  });

  it('corregir un gasto queda en la auditoría con el antes y el después', async () => {
    const g = (await registrar({ origen: 'GASTO', categoria: 'Material', descripcion: 'Cinta aislante', monto: '12' })).datos.mov;
    const r = await llamar('PUT', `/api/caja-icr/movimientos/${g.id}`, { token: sesiones.fina, cuerpo: { monto: '15.50', categoria: 'Gastos fijos', subcategoria: 'Servicios' } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.monto, '15.50');
    assert.equal(r.datos.subcategoria, 'Servicios');
    assert.equal((await llamar('PUT', `/api/caja-icr/movimientos/${g.id}`, { token: sesiones.fina, cuerpo: { categoria: 'Depósito a cuenta principal' } })).estado, 400);
    const aud = await sql("SELECT accion, antes->>'monto' AS a, despues->>'monto' AS d FROM audit_log WHERE entidad = 'caja_icr' AND entidad_id = $1 ORDER BY id", [g.id]);
    assert.deepEqual(aud.map((x) => x.accion), ['crear', 'editar']);
    assert.deepEqual([aud[1].a, aud[1].d], ['12.00', '15.50']);
    assert.equal((await llamar('POST', `/api/caja-icr/movimientos/${g.id}/anular`, { token: sesiones.fina, cuerpo: {} })).estado, 400);
  });

  it('fotos: solo imágenes, privadas, con sesión', async () => {
    const g = (await registrar({ origen: 'GASTO', categoria: 'Oficina', descripcion: 'Papel', monto: '9' })).datos.mov;
    assert.equal((await llamar('POST', `/api/caja-icr/movimientos/${g.id}/fotos?ext=png`, { token: sesiones.fina, crudo: Buffer.from('no es imagen, solo texto'), tipo: 'image/png' })).estado, 400);
    const f = await llamar('POST', `/api/caja-icr/movimientos/${g.id}/fotos?ext=png`, { token: sesiones.fina, crudo: PNG, tipo: 'image/png' });
    assert.equal(f.estado, 201, JSON.stringify(f.datos));
    const sin = await fetch(`${base}/api/caja-icr/fotos/${f.datos.id}`);
    assert.equal(sin.status, 401);
    const con = await fetch(`${base}/api/caja-icr/fotos/${f.datos.id}`, { headers: { authorization: `Bearer ${sesiones.fina}` } });
    assert.equal(con.status, 200);
    assert.equal(con.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await con.arrayBuffer()).length, PNG.length);
    assert.deepEqual((await llamar('GET', `/api/caja-icr/movimientos/${g.id}`, { token: sesiones.fina })).datos.adjuntos, [f.datos.id]);
  });

  it('reportes: dos saldos, ventas, fondos, gastos físicos y digitales, por categoría y por proyecto', async () => {
    const r = (await llamar('GET', `/api/caja-icr/reportes?desde=${hoy}&hasta=${hoy}`, { token: sesiones.fina })).datos;
    assert.equal(r.efectivo.saldo_inicial, '0.00');
    assert.equal(r.efectivo.saldo_final, (await saldos()).efectivo);
    assert.equal(r.digital.saldo_final, (await saldos()).digital);
    assert.equal(r.ventas, '950.50');
    assert.equal(r.depositos, '100.00');
    // gastos reales (sin depósitos ni anulados): 25.30 + 50 + 15.50 + 9
    assert.equal(r.gastos, '99.80');
    assert.equal(r.gastos_fisicos, '49.80');
    assert.equal(r.gastos_digitales, '50.00');
    assert.equal(r.por_proyecto[0].monto, '25.30');
    assert.ok(r.por_categoria.some((c) => c.clave === 'Gastos fijos · Servicios' && c.monto === '15.50'));
    assert.equal(r.por_dia.length, 1);
  });

  it('permisos: Técnico no ve; Contabilidad registra; la lectura no registra', async () => {
    assert.equal((await llamar('GET', '/api/caja-icr/resumen', { token: sesiones.tito })).estado, 403);
    assert.equal((await registrar({ origen: 'GASTO', categoria: 'Movilidad', descripcion: 'x', monto: 1 }, sesiones.tito)).estado, 403);
    await sql("UPDATE rol_permisos SET nivel = 'lectura' WHERE rol = 'tecnico' AND modulo = 'caja_chica'");
    await (await import('../src/permisos.js')).matriz({ fresca: true });
    assert.equal((await llamar('GET', '/api/caja-icr/movimientos', { token: sesiones.tito })).estado, 200);
    assert.equal((await registrar({ origen: 'GASTO', categoria: 'Movilidad', descripcion: 'x', monto: 1 }, sesiones.tito)).estado, 403);
    // un Administrador registra un ajuste de saldo
    const aj = await registrar({ origen: 'AJUSTE', tipo: 'INGRESO', medio: 'DIGITAL', descripcion: 'Conteo de Yape', monto: '0.50' }, sesiones.admin);
    assert.equal(aj.estado, 201, JSON.stringify(aj.datos));
    assert.equal((await saldos()).digital, '1.00');
  });
});

describe('Caddyfile', () => {
  it('tiene todas las direcciones (y Relay al final): si falta una, Caddy no pide su certificado', () => {
    const c = readFileSync(fileURLToPath(new URL('../../Caddyfile', import.meta.url)), 'utf8');
    const bloques = [...c.matchAll(/^([a-z]\S*)\s+\{\s*$/gm)].map((m) => m[1]);
    for (const b of ['cotizador.{$DOMINIO}', 'app.{$DOMINIO}', 'api.{$DOMINIO}', 'finanzas.{$DOMINIO}', 'erp.{$DOMINIO}']) assert.ok(bloques.includes(b), `falta ${b}`);
    assert.deepEqual(bloques.slice(-2), ['atleta.adriancalderonbegazo.site', 'coach.adriancalderonbegazo.site']);
    assert.ok(!bloques.includes('finanza.{$DOMINIO}'));
  });
});
