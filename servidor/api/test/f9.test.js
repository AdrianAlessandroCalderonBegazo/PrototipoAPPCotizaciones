// ERP · Fase 9: Almacén (artículos, kardex solo-agregar, stock sin negativos, salida desde un requerimiento) y Activos (sistemas, equipos, VRM).
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

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const enDias = (n) => { const d = new Date(`${hoy()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

describe('permisos por defecto', () => {
  it('técnico registra en almacén y activos; ventas y contabilidad solo consultan', async () => {
    const m = (await llamar('GET', '/api/permisos/matriz', { token: sesiones.admin })).datos;
    const nivelDe = (rol, mod) => (m.matriz ?? m)[rol]?.[mod];
    assert.equal(nivelDe('tecnico', 'almacen'), 'completo');
    assert.equal(nivelDe('tecnico', 'activos'), 'completo');
    assert.equal(nivelDe('ventas', 'almacen'), 'lectura');
    assert.equal((await llamar('POST', '/api/almacen/articulos', { token: sesiones.vera, cuerpo: { nombre: 'X' } })).estado, 403);
    assert.equal((await llamar('GET', '/api/almacen/articulos', { token: sesiones.vera })).estado, 200);
  });
});

describe('almacén', () => {
  let cable;
  let mc4;
  it('crea artículos con stock inicial (queda en el kardex) y no repite nombres', async () => {
    const r = await llamar('POST', '/api/almacen/articulos', { token: sesiones.tito, cuerpo: { nombre: 'Cable solar 6 mm² rojo', unidad: 'm', categoria: 'Cables', stock_minimo: '100', stock_inicial: '250.5' } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    cable = r.datos;
    assert.equal(cable.stock, '250.50');
    assert.equal(cable.bajo, false);
    const dup = await llamar('POST', '/api/almacen/articulos', { token: sesiones.tito, cuerpo: { nombre: 'cable solar 6 mm² ROJO' } });
    assert.equal(dup.estado, 409);
    mc4 = (await llamar('POST', '/api/almacen/articulos', { token: sesiones.tito, cuerpo: { nombre: 'Conector MC4', unidad: 'par' } })).datos;
    assert.equal(mc4.stock, '0.00');
    const k = (await llamar('GET', `/api/almacen/articulos/${cable.id}`, { token: sesiones.vera })).datos;
    assert.equal(k.movimientos.length, 1);
    assert.equal(k.movimientos[0].nota, 'Stock inicial');
  });

  it('entrada, salida a un proyecto y nunca stock negativo', async () => {
    const e = await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'entrada', fecha: hoy(), documento: 'GR 001-123', items: [{ articulo_id: mc4.id, cantidad: '40' }] } });
    assert.equal(e.estado, 201, JSON.stringify(e.datos));
    const p = await llamar('POST', '/api/proyectos', { token: sesiones.admin, cuerpo: { nombre: 'Hostal Los Tambos', presupuesto: '1000' } });
    const s = await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'salida', fecha: hoy(), proyecto_id: p.datos.id, items: [{ articulo_id: cable.id, cantidad: '200' }, { articulo_id: mc4.id, cantidad: '12' }] } });
    assert.equal(s.estado, 201, JSON.stringify(s.datos));
    assert.deepEqual(s.datos.map((x) => x.stock_despues), ['50.50', '28.00']);
    // todo o nada: si una línea no alcanza, no se descuenta ninguna
    const no = await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'salida', fecha: hoy(), items: [{ articulo_id: mc4.id, cantidad: '1' }, { articulo_id: cable.id, cantidad: '60' }] } });
    assert.equal(no.estado, 409);
    assert.match(no.datos.error, /hay 50\.50 m/);
    const lista = (await llamar('GET', '/api/almacen/articulos', { token: sesiones.tito })).datos;
    assert.equal(lista.articulos.find((a) => a.id === mc4.id).stock, '28.00');
    assert.equal(lista.articulos.find((a) => a.id === cable.id).bajo, true);
    assert.equal(lista.resumen.bajos, 1);
    const futura = await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'entrada', fecha: enDias(3), items: [{ articulo_id: mc4.id, cantidad: '1' }] } });
    assert.equal(futura.estado, 400);
  });

  it('ajuste por conteo pide nota; anular deja el original y no se anula dos veces', async () => {
    assert.equal((await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'ajuste', fecha: hoy(), items: [{ articulo_id: mc4.id, cantidad: '25' }] } })).estado, 400);
    const a = await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'ajuste', fecha: hoy(), nota: 'Conteo de fin de mes', items: [{ articulo_id: mc4.id, cantidad: '25' }] } });
    assert.equal(a.estado, 201);
    assert.equal(a.datos[0].delta, '-3.00');
    const an = await llamar('POST', `/api/almacen/movimientos/${a.datos[0].id}/anular`, { token: sesiones.tito, cuerpo: { motivo: 'Se contó mal' } });
    assert.equal(an.estado, 201, JSON.stringify(an.datos));
    assert.equal(an.datos.stock_despues, '28.00');
    assert.equal((await llamar('POST', `/api/almacen/movimientos/${a.datos[0].id}/anular`, { token: sesiones.tito, cuerpo: { motivo: 'otra vez' } })).estado, 409);
    const movs = (await llamar('GET', `/api/almacen/movimientos?articulo_id=${mc4.id}`, { token: sesiones.tito })).datos;
    assert.equal(movs.find((m) => m.id === a.datos[0].id).anulado, true);
    // el kardex no se puede tocar directo en la base
    await assert.rejects(pool.query('DELETE FROM almacen_movimientos WHERE id = $1', [a.datos[0].id]), /no se modifican/);
    await assert.rejects(pool.query("UPDATE almacen_movimientos SET cantidad = 1 WHERE id = $1", [a.datos[0].id]), /no se modifican/);
  });

  it('salida desde un requerimiento de Logística: propone por nombre y no se repite sin confirmar', async () => {
    const req = await llamar('POST', '/api/requerimientos', {
      token: sesiones.tito,
      cuerpo: { numero: 'REQ-0101', obra: 'Hostal Los Tambos', solicitante: 'TITO', urgente: 0, fecha_creacion: `${hoy()}T09:00:00.000`,
        categorias_json: JSON.stringify([{ nombre: 'FOTOVOLTAICO', items: [{ texto: 'Conector  mc4', cantidad: 10 }, { texto: 'Breaker DC 2P', cantidad: 2 }, { texto: 'Canaleta', cantidad: 0 }] }]) },
    });
    assert.equal(req.estado, 201, JSON.stringify(req.datos));
    const rid = req.datos.id;
    const pr = (await llamar('GET', `/api/almacen/requerimientos/${rid}/salida`, { token: sesiones.tito })).datos;
    assert.equal(pr.items.length, 2);
    assert.equal(pr.items[0].articulo.id, mc4.id);
    assert.equal(pr.items[1].articulo, null);
    const s = await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'salida', fecha: hoy(), requerimiento_id: rid, items: [{ articulo_id: mc4.id, cantidad: pr.items[0].cantidad }] } });
    assert.equal(s.estado, 201, JSON.stringify(s.datos));
    const otra = await llamar('POST', '/api/almacen/movimientos', { token: sesiones.tito, cuerpo: { tipo: 'salida', fecha: hoy(), requerimiento_id: rid, items: [{ articulo_id: mc4.id, cantidad: '1' }] } });
    assert.equal(otra.estado, 409);
    assert.equal(otra.datos.repetido, true);
    assert.equal((await llamar('GET', `/api/almacen/requerimientos/${rid}/salida`, { token: sesiones.tito })).datos.salida_registrada, hoy());
    const op = (await llamar('GET', '/api/almacen/opciones', { token: sesiones.tito })).datos;
    assert.equal(op.requerimientos.find((x) => x.id === rid).con_salida, true);
  });

  it('agrega artículos desde el catálogo sin repetir y avisa en Inicio el stock bajo', async () => {
    const { rows } = await pool.query("INSERT INTO productos (codigo_erp, nombre, categoria_producto, unidad_medida) VALUES ('PMP482305012', 'MultiPlus-II 48/3000/35-32', 'INVERSORES', 'und'), (NULL, 'Conector MC4', 'CONECTORES', 'par') RETURNING id");
    const r = await llamar('POST', '/api/almacen/articulos/desde-catalogo', { token: sesiones.tito, cuerpo: { productos: rows.map((x) => x.id) } });
    assert.equal(r.estado, 201);
    assert.deepEqual(r.datos, { agregados: 1, saltados: 1 });
    const ini = (await llamar('GET', '/api/inicio', { token: sesiones.tito })).datos;
    const al = ini.alertas.find((a) => a.clave.startsWith('stock_bajo:'));
    assert.ok(al, JSON.stringify(ini.alertas));
    assert.match(al.titulo, /Cable solar 6 mm² rojo/);
    const aud = (await llamar('GET', '/api/auditoria?entidad=almacen_movimiento', { token: sesiones.admin })).datos;
    assert.ok((aud.registros ?? aud).length >= 4);
  });
});

describe('activos', () => {
  let sis;
  it('registra un sistema con su dirección de VRM (solo vrm.victronenergy.com)', async () => {
    const mal = await llamar('POST', '/api/activos', { token: sesiones.tito, cuerpo: { nombre: 'Hostal Los Tambos', vrm_url: 'https://evil.example.com/' } });
    assert.equal(mal.estado, 400);
    const r = await llamar('POST', '/api/activos', { token: sesiones.tito, cuerpo: { nombre: 'Hostal Los Tambos', cliente: 'Hostal Los Tambos EIRL', fecha_instalacion: '2026-03-10', vrm_url: 'https://vrm.victronenergy.com/installation/123456/dashboard' } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    sis = r.datos;
    assert.equal(sis.ubicacion, null);
    assert.equal((await llamar('POST', '/api/activos', { token: sesiones.vera, cuerpo: { nombre: 'X' } })).estado, 403);
  });

  it('equipos con serie y garantía; aviso de garantía por vencer en Inicio', async () => {
    const e1 = await llamar('POST', `/api/activos/${sis.id}/equipos`, { token: sesiones.tito, cuerpo: { tipo: 'inversor', marca: 'Victron', modelo: 'MultiPlus-II 48/3000', serie: 'HQ2233ABCDE', cantidad: 3, garantia_hasta: enDias(20) } });
    assert.equal(e1.estado, 201, JSON.stringify(e1.datos));
    const e2 = await llamar('POST', `/api/activos/${sis.id}/equipos`, { token: sesiones.tito, cuerpo: { tipo: 'bateria', marca: 'Ritar', garantia_hasta: enDias(-5) } });
    assert.equal(e2.estado, 201);
    assert.equal((await llamar('POST', `/api/activos/${sis.id}/equipos`, { token: sesiones.tito, cuerpo: { tipo: 'panel' } })).estado, 400);
    const l = (await llamar('GET', '/api/activos', { token: sesiones.fina })).datos;
    const a = l.activos.find((x) => x.id === sis.id);
    assert.deepEqual(a.equipos.map((e) => e.garantia).sort(), ['por_vencer', 'vencida']);
    assert.equal(l.resumen.equipos, 4);
    assert.equal(l.resumen.con_vrm, 1);
    const ini = (await llamar('GET', '/api/inicio', { token: sesiones.tito })).datos;
    assert.ok(ini.alertas.some((x) => x.clave.startsWith(`garantia:${e1.datos.id}:`)));
    const ed = await llamar('PUT', `/api/activos/equipos/${e2.datos.id}`, { token: sesiones.tito, cuerpo: { serie: 'RT-998' } });
    assert.equal(ed.datos.serie, 'RT-998');
    assert.equal((await llamar('DELETE', `/api/activos/equipos/${e2.datos.id}`, { token: sesiones.tito })).estado, 200);
    assert.equal((await llamar('GET', `/api/activos/${sis.id}`, { token: sesiones.tito })).datos.equipos.length, 1);
    const off = await llamar('PUT', `/api/activos/${sis.id}`, { token: sesiones.tito, cuerpo: { activo: false } });
    assert.equal(off.datos.activo, false);
    assert.equal((await llamar('GET', '/api/activos', { token: sesiones.tito })).datos.activos.length, 0);
  });
});
