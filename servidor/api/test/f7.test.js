// ERP · Fase 7: la IA en la app de Finanzas (caja diaria y caja chica), con un Ollama falso y datos de caja reales en Postgres.
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

const { iniciarOllamaFalso } = await import('./ollama_falso.js');
const ollama = await iniciarOllamaFalso();
process.env.OLLAMA_URL = ollama.url;
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
  await ollama.cerrar();
  await pool.end();
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${nombreBase} WITH (FORCE)`);
  await c.end();
});

async function preguntar(token, cuerpo) {
  const r = await fetch(`${base}/api/ia/finanzas/preguntar`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const texto = await r.text();
  if (r.status !== 200) return { estado: r.status, eventos: [] };
  const eventos = texto.split('\n\n').map((b) => b.split('\n').find((l) => l.startsWith('data: '))).filter(Boolean).map((l) => JSON.parse(l.slice(6)));
  return { estado: 200, eventos, texto: eventos.filter((e) => e.tipo === 'texto').map((e) => e.t).join(''), fin: eventos.find((e) => e.tipo === 'fin'), error: eventos.find((e) => e.tipo === 'error') };
}

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const { rangoDe } = await import('../src/ia/herramientas.js');

describe('IA de Finanzas', () => {
  before(async () => {
    // Datos de caja de verdad (las mismas tablas que usa la app de Finanzas).
    const p = (await pool.query("INSERT INTO proyectos (codigo, nombre, presupuesto) VALUES ('PRY-901', 'Hostal Los Tambos', 50000) RETURNING id")).rows[0].id;
    const mov = (ciudad, fecha, desc, cat, monto, proyecto = null) =>
      pool.query("INSERT INTO caja_chica_mov (ciudad, fecha, tipo, descripcion, persona, categoria, subcategoria, monto, proyecto_id) VALUES ($1, $2, 'EGRESO', $3, 'Luis', $4, $4, $5, $6) RETURNING id", [ciudad, fecha, desc, cat, monto, proyecto]);
    const m1 = (await mov('AQP', hoy, 'Taxi a obra', 'Movilidad', '15.50')).rows[0].id;
    await mov('AQP', hoy, 'Almuerzo cuadrilla', 'Alimentación', '84.00');
    await mov('MOQ', hoy, 'Pasaje a Ilo', 'Movilidad', '30.00', p);
    await mov('AQP', '2020-01-15', 'Gasto viejo', 'Movilidad', '999.00');
    await pool.query("INSERT INTO caja_adjunto (movimiento_id, archivo, mime, bytes) VALUES ($1, 'x.jpg', 'image/jpeg', 10)", [m1]);
    await pool.query("INSERT INTO caja_chica_mov (ciudad, fecha, tipo, descripcion, monto) VALUES ('AQP', $1, 'FONDO', 'Fondos', 500)", [hoy]);
    const h = (await pool.query("INSERT INTO caja_hoja (ciudad, fecha) VALUES ('AQP', $1) RETURNING id", [hoy])).rows[0].id;
    await pool.query("INSERT INTO caja_fila (hoja_id, tipo, descripcion, caja_ingreso_efectivo, cta_cte_ingreso) VALUES ($1, 'VTA', 'Venta mostrador', 1200, 350)", [h]);
    await pool.query("INSERT INTO caja_fila (hoja_id, tipo, descripcion, caja_salida_efectivo, categoria, proyecto_id) VALUES ($1, 'OBRA', 'Cemento', 200, 'Materiales', $2)", [h, p]);
  });

  it('períodos: semana desde el lunes, mes anterior completo', () => {
    assert.deepEqual(rangoDe({ periodo: 'semana' }, '2026-10-30'), { desde: '2026-10-26', hasta: '2026-10-30', texto: 'del 26/10/2026 al 30/10/2026' });
    assert.deepEqual(rangoDe({ periodo: 'mes_anterior' }, '2026-03-10'), { desde: '2026-02-01', hasta: '2026-02-28', texto: 'del 01/02/2026 al 28/02/2026' });
    assert.equal(rangoDe({}, '2026-10-30').desde, '2026-10-01');
  });
  it('todos los que entran a la caja pueden preguntar (basta lectura); los demás no', async () => {
    assert.equal((await preguntar(sesiones.vera, { texto: 'hola' })).estado, 403); // ventas: sin caja chica
    await pool.query("UPDATE rol_permisos SET nivel = 'lectura' WHERE rol = 'tecnico' AND modulo = 'caja_chica'");
    await pool.query("INSERT INTO rol_permisos (rol, modulo, nivel) VALUES ('tecnico', 'caja_chica', 'lectura') ON CONFLICT DO NOTHING");
    const { matriz } = await import('../src/permisos.js');
    await matriz({ fresca: true });
    const r = await preguntar(sesiones.tito, { texto: '¿Cuánto se gastó en movilidad esta semana?' });
    assert.equal(r.estado, 200);
    assert.ok(r.fin, JSON.stringify(r.error));
  });
  it('gastos de caja chica: total del servidor, por categoría y sin recibo; no cuenta FONDO ni gastos de otras fechas', async () => {
    const r = await preguntar(sesiones.fina, { texto: '¿Cuánto se gastó este mes?' });
    const d = r.fin.mensaje.datos;
    assert.equal(d.herramientas[0], 'gastos_caja_chica');
    const k = d.bloques.find((b) => b.tipo === 'kpis').items;
    assert.equal(k[0].v, 'S/ 129.50');
    assert.equal(k[1].v, '3');
    assert.equal(k[2].v, '2'); // solo el taxi tiene foto
    assert.match(r.texto, /S\/ 129\.50/);
    assert.deepEqual(d.fuentes, ['Caja chica', 'Generado por IA']);
    const moq = await preguntar(sesiones.fina, { texto: '¿Cuánto se gastó en Moquegua este mes?' });
    assert.equal(moq.fin.mensaje.datos.bloques[0].items[0].v, 'S/ 30.00');
  });
  it('caja diaria (efectivo y Yape), saldos y gastos de un proyecto desde las cajas', async () => {
    const d = (await preguntar(sesiones.fina, { texto: '¿Cómo va la caja diaria y el Yape este mes?' })).fin.mensaje.datos;
    assert.equal(d.herramientas[0], 'caja_diaria');
    assert.equal(d.bloques[0].items[0].v, 'S/ 1,200.00');
    assert.equal(d.bloques[0].items[2].v, 'S/ 350.00 / S/ 0.00');
    const s = (await preguntar(sesiones.fina, { texto: '¿Cuál es el saldo de las cajas?' })).fin.mensaje.datos;
    assert.equal(s.bloques[1].filas[0][1], 'S/ -598.50'); // AQP caja chica: 500 − 15.50 − 84 − 999 (incluye el gasto viejo)
    const p = await preguntar(sesiones.fina, { texto: '¿Cuánto va gastado del proyecto PRY-901?' });
    const kp = p.fin.mensaje.datos.bloques[0].items;
    assert.equal(kp[0].v, 'S/ 230.00'); // 30 caja chica + 200 caja diaria
    assert.equal(kp[2].v, 'S/ 50,000.00'); // contabilidad también ve Proyectos: se agrega el presupuesto
  });
  it('la IA no registra nada y las conversaciones son privadas', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM caja_chica_mov')).rows[0].n;
    const r = await preguntar(sesiones.fina, { texto: 'Registra un gasto de 20 soles de taxi' });
    assert.match(r.texto, /Solo puedo leer/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM caja_chica_mov')).rows[0].n, antes);
    const id = r.eventos.find((e) => e.tipo === 'conversacion').id;
    assert.equal((await llamar('GET', `/api/ia/finanzas/conversaciones/${id}`, { token: sesiones.tito })).estado, 404);
    assert.ok((await llamar('GET', '/api/ia/finanzas/conversaciones', { token: sesiones.fina })).datos.length >= 1);
    assert.equal((await llamar('POST', '/api/ia/finanzas/conversaciones/eliminar', { token: sesiones.fina, cuerpo: { ids: [id] } })).datos.eliminadas, 1);
  });
});
