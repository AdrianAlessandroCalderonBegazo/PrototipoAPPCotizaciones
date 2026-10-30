// ERP · Fase 10: cierre de seguridad (sesiones al cambiar la clave, límite de intentos por persona, aviso de claves de fábrica).
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

const ingresar = (usuario, clave, ip) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: JSON.stringify({ usuario, clave }) });

describe('seguridad', () => {
  it('cambiar la clave propia cierra las otras sesiones, no la actual', async () => {
    const a = (await entrar('tito', 'clave-segura')).token;
    const b = (await entrar('tito', 'clave-segura')).token;
    const r = await llamar('POST', '/api/yo/clave', { token: a, cuerpo: { actual: 'clave-segura', nueva: 'clave-nueva-1' } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal((await llamar('GET', '/api/yo', { token: a })).estado, 200);
    assert.equal((await llamar('GET', '/api/yo', { token: b })).estado, 401);
  });

  it('los intentos fallidos se limitan por persona (IP real que manda Caddy o Finanzas), no para todos', async () => {
    for (let i = 0; i < 10; i++) assert.equal((await ingresar('vera', 'mala', '203.0.113.7')).status, 401);
    assert.equal((await ingresar('vera', 'clave-segura', '203.0.113.7')).status, 429);
    assert.equal((await ingresar('vera', 'clave-segura', '198.51.100.9')).status, 200);
  });

  it('el Inicio del administrador avisa claves de ejemplo y la clave de edición 1234', async () => {
    await llamar('POST', '/api/usuarios', { token: sesiones.admin, cuerpo: { usuario: 'jefe', nombre: 'JEFE', clave: 'admin123', rol: 'admin' } });
    await llamar('PUT', '/api/clave-edicion', { token: sesiones.admin, cuerpo: { nueva: '1234' } });
    const al = (await llamar('GET', '/api/inicio', { token: sesiones.admin })).datos.alertas.filter((a) => a.origen === 'Seguridad');
    assert.ok(al.some((a) => a.clave === 'clave_admin:jefe'), JSON.stringify(al));
    assert.ok(al.some((a) => a.clave === 'clave_edicion:1234'));
    // a quien no es administrador no se le muestra
    assert.equal((await llamar('GET', '/api/inicio', { token: sesiones.fina })).datos.alertas.filter((a) => a.origen === 'Seguridad').length, 0);
    // al cambiarlas, el aviso desaparece
    const jefe = (await llamar('GET', '/api/usuarios', { token: sesiones.admin })).datos.find((u) => u.usuario === 'jefe');
    await llamar('PUT', `/api/usuarios/${jefe.id}`, { token: sesiones.admin, cuerpo: { clave: 'una-clave-larga-de-verdad' } });
    await llamar('PUT', '/api/clave-edicion', { token: sesiones.admin, cuerpo: { nueva: 'otra-9876' } });
    assert.equal((await llamar('GET', '/api/inicio', { token: sesiones.admin })).datos.alertas.filter((a) => a.origen === 'Seguridad').length, 0);
  });
});
