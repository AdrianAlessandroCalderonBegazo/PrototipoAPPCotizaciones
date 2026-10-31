// ERP · Fase 7: la IA en la app de Finanzas (Caja ICR), con un Ollama falso y datos de caja reales en Postgres.
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
    // Datos de la Caja ICR de verdad (la misma tabla que usa la app de Finanzas).
    const p = (await pool.query("INSERT INTO proyectos (codigo, nombre, presupuesto) VALUES ('PRY-901', 'Hostal Los Tambos', 50000) RETURNING id")).rows[0].id;
    const mov = (origen, medio, fecha, desc, cat, monto, proyecto = null) =>
      pool.query(`INSERT INTO caja_icr_mov (id, fecha, tipo, medio, origen, categoria, descripcion, persona, monto, proyecto_id)
                  VALUES (gen_random_uuid(), $1, CASE WHEN $2 IN ('VENTA', 'FONDO') THEN 'INGRESO' ELSE 'EGRESO' END, $3, $2, $4, $5, 'Luis', $6, $7) RETURNING id`, [fecha, origen, medio, cat, desc, monto, proyecto]);
    const m1 = (await mov('GASTO', 'EFECTIVO', hoy, 'Taxi a obra', 'Movilidad', '15.50')).rows[0].id;
    await mov('GASTO', 'EFECTIVO', hoy, 'Almuerzo cuadrilla', 'Viáticos', '84.00');
    await mov('CAPTURA', 'DIGITAL', hoy, 'Yape pasaje a Ilo', 'Movilidad', '30.00', p);
    await mov('GASTO', 'EFECTIVO', '2020-01-15', 'Gasto viejo', 'Movilidad', '999.00');
    await mov('DEPOSITO', 'EFECTIVO', hoy, 'Depósito BCP', 'Depósito a cuenta principal', '100.00');
    await pool.query("INSERT INTO caja_icr_adjunto (mov_id, archivo, mime, bytes) VALUES ($1, 'x.jpg', 'image/jpeg', 10)", [m1]);
    await mov('FONDO', 'EFECTIVO', hoy, 'Fondos de la cuenta principal', 'Fondos de la cuenta principal', '500');
    await mov('VENTA', 'EFECTIVO', hoy, 'Venta mostrador', 'Venta', '1200');
    await mov('VENTA', 'DIGITAL', hoy, 'Venta por Yape', 'Venta', '350');
    await mov('GASTO', 'EFECTIVO', hoy, 'Cemento', 'Material', '200', p);
  });

  it('períodos: semana desde el lunes, mes anterior completo', () => {
    assert.deepEqual(rangoDe({ periodo: 'semana' }, '2026-10-30'), { desde: '2026-10-26', hasta: '2026-10-30', texto: 'del 26/10/2026 al 30/10/2026' });
    assert.deepEqual(rangoDe({ periodo: 'mes_anterior' }, '2026-03-10'), { desde: '2026-02-01', hasta: '2026-02-28', texto: 'del 01/02/2026 al 28/02/2026' });
    assert.equal(rangoDe({}, '2026-10-30').desde, '2026-10-01');
  });
  it('todos los que entran a la caja pueden preguntar (basta lectura); los demás no', async () => {
    assert.equal((await preguntar(sesiones.vera, { texto: 'hola' })).estado, 403); // ventas: sin Caja ICR
    await pool.query("UPDATE rol_permisos SET nivel = 'lectura' WHERE rol = 'tecnico' AND modulo = 'caja_chica'");
    await pool.query("INSERT INTO rol_permisos (rol, modulo, nivel) VALUES ('tecnico', 'caja_chica', 'lectura') ON CONFLICT DO NOTHING");
    const { matriz } = await import('../src/permisos.js');
    await matriz({ fresca: true });
    const r = await preguntar(sesiones.tito, { texto: '¿Cuánto se gastó en movilidad esta semana?' });
    assert.equal(r.estado, 200);
    assert.ok(r.fin, JSON.stringify(r.error));
  });
  it('gastos de la Caja ICR: total del servidor, por categoría y sin foto; no cuenta ingresos, depósitos ni otras fechas', async () => {
    const r = await preguntar(sesiones.fina, { texto: '¿Cuánto se gastó este mes?' });
    const d = r.fin.mensaje.datos;
    assert.equal(d.herramientas[0], 'gastos_caja');
    const k = d.bloques.find((b) => b.tipo === 'kpis').items;
    assert.equal(k[0].v, 'S/ 329.50');
    assert.equal(k[1].v, '4');
    assert.equal(k[2].v, '3'); // solo el taxi tiene foto
    assert.match(r.texto, /S\/ 329\.50/);
    assert.deepEqual(d.fuentes, ['Caja ICR']); // respuesta directa: no la generó la IA
    assert.equal(d.rapida, true);
    const yape = await preguntar(sesiones.fina, { texto: '¿Cuánto se pagó por Yape este mes?' });
    assert.equal(yape.fin.mensaje.datos.bloques[0].items[0].v, 'S/ 30.00');
  });
  it('resumen (ventas, fondos, depósitos por efectivo y digital), saldos y gastos de un proyecto desde la caja', async () => {
    const d = (await preguntar(sesiones.fina, { texto: 'Resumen de ventas y fondos de este mes' })).fin.mensaje.datos;
    assert.equal(d.herramientas[0], 'resumen_caja');
    assert.equal(d.bloques[0].items[0].v, 'S/ 1,550.00');
    assert.equal(d.bloques[0].items[3].v, 'S/ 100.00');
    const s = (await preguntar(sesiones.fina, { texto: '¿Cuál es el saldo de la caja?' })).fin.mensaje.datos;
    // efectivo: 500 + 1200 − 15.50 − 84 − 999 (el gasto viejo también cuenta) − 100 − 200; digital: 350 − 30
    assert.deepEqual(s.bloques[0].items.map((x) => x.v), ['S/ 301.50', 'S/ 320.00', 'S/ 621.50']);
    const p = await preguntar(sesiones.fina, { texto: '¿Cuánto va gastado del proyecto PRY-901?' });
    const kp = p.fin.mensaje.datos.bloques[0].items;
    assert.equal(kp[0].v, 'S/ 230.00'); // 30 por Yape + 200 en efectivo
    assert.equal(kp[2].v, 'S/ 50,000.00'); // contabilidad también ve Proyectos: se agrega el presupuesto
  });
  it('las preguntas frecuentes se responden sin IA (al instante, aunque la IA esté apagada); las demás van a la IA', async () => {
    const chats = () => ollama.pedidos.filter((x) => x.ruta === '/api/chat').length;
    const antes = chats();
    const r = await preguntar(sesiones.fina, { texto: '¿Qué gastos no tienen foto del recibo este mes?' });
    assert.equal(chats(), antes, 'no debe llamar al modelo');
    assert.equal(r.fin.mensaje.datos.rapida, true);
    assert.equal(r.fin.mensaje.modelo, null);
    assert.match(r.fin.mensaje.texto, /3 no tienen foto/);
    const url = process.env.OLLAMA_URL;
    delete process.env.OLLAMA_URL; // IA apagada
    try {
      const s = await preguntar(sesiones.fina, { texto: 'saldo de la caja' });
      assert.ok(s.fin, JSON.stringify(s.error));
      assert.match(s.fin.mensaje.texto, /efectivo \*\*S\/ 301\.50\*\*/);
      const otra = await preguntar(sesiones.fina, { texto: '¿Por qué subieron tanto los gastos?' });
      assert.ok(otra.error); // esa sí necesita la IA
    } finally {
      process.env.OLLAMA_URL = url;
    }
    const ia = await preguntar(sesiones.fina, { texto: 'Registra un gasto de 20 soles de taxi' });
    assert.ok(chats() > antes, 'lo que no se reconoce va a la IA');
    assert.notEqual(ia.fin.mensaje.datos.rapida, true);
  });
  it('la IA no registra nada y las conversaciones son privadas', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM caja_icr_mov')).rows[0].n;
    const r = await preguntar(sesiones.fina, { texto: 'Registra un gasto de 20 soles de taxi' });
    assert.match(r.texto, /Solo puedo leer/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM caja_icr_mov')).rows[0].n, antes);
    const id = r.eventos.find((e) => e.tipo === 'conversacion').id;
    assert.equal((await llamar('GET', `/api/ia/finanzas/conversaciones/${id}`, { token: sesiones.tito })).estado, 404);
    assert.ok((await llamar('GET', '/api/ia/finanzas/conversaciones', { token: sesiones.fina })).datos.length >= 1);
    assert.equal((await llamar('POST', '/api/ia/finanzas/conversaciones/eliminar', { token: sesiones.fina, cuerpo: { ids: [id] } })).datos.eliminadas, 1);
  });
});
