// ERP · Fase 6: IA (Cotizador IA y Asistente IA) contra un Ollama falso: herramientas de solo lectura, permisos, streaming e historial.
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

/** Pregunta en streaming y devuelve los eventos. */
async function preguntar(token, modulo, cuerpo) {
  const r = await fetch(`${base}/api/ia/${modulo}/preguntar`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const texto = await r.text();
  if (r.status !== 200) return { estado: r.status, error: JSON.parse(texto).error, eventos: [] };
  const eventos = texto.split('\n\n').map((b) => b.split('\n').find((l) => l.startsWith('data: '))).filter(Boolean).map((l) => JSON.parse(l.slice(6)));
  return { estado: 200, eventos, texto: eventos.filter((e) => e.tipo === 'texto').map((e) => e.t).join(''), fin: eventos.find((e) => e.tipo === 'fin'), error: eventos.find((e) => e.tipo === 'error') };
}

describe('estado, permisos e índice', () => {
  it('estado: en línea con el modelo; sin OLLAMA_URL dice que no está instalada', async () => {
    const e = (await llamar('GET', '/api/ia/estado', { token: sesiones.vera })).datos;
    assert.equal(e.disponible, true);
    assert.equal(e.modelo, 'qwen3:4b');
    const guardada = process.env.OLLAMA_URL;
    delete process.env.OLLAMA_URL;
    assert.equal((await llamar('GET', '/api/ia/estado', { token: sesiones.vera })).datos.motivo, 'no_instalada');
    process.env.OLLAMA_URL = guardada;
    assert.equal((await llamar('GET', '/api/ia/estado', { token: sesiones.tito })).estado, 403);
  });
  it('permisos: técnico no usa la IA; contabilidad usa el Asistente pero no el Cotizador', async () => {
    assert.equal((await preguntar(sesiones.tito, 'asistente', { texto: 'hola' })).estado, 403);
    assert.equal((await preguntar(sesiones.fina, 'cotizador', { texto: 'hola' })).estado, 403);
    assert.equal((await llamar('GET', '/api/ia/cotizador/conversaciones', { token: sesiones.fina })).estado, 403);
  });
  it('reindexar el catálogo crea un vector por producto', async () => {
    const r = await llamar('POST', '/api/ia/reindexar', { token: sesiones.admin });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.ok(r.datos.total > 0);
    assert.equal(r.datos.indexados, r.datos.total);
    assert.equal((await llamar('POST', '/api/ia/reindexar', { token: sesiones.admin })).datos.nuevos, 0); // nada cambió
  });
});

describe('Cotizador IA', () => {
  let conv;
  let tarjetaMsg;
  it('busca en el catálogo y propone: precios del catálogo, lo que no existe queda «Sin dato»', async () => {
    const p = await llamar('POST', '/api/catalogo', { token: sesiones.vera, cuerpo: { codigo: 'FEL-10048', nombre: 'Inversor híbrido Felicity IVEM 10048', marca: 'Felicity', categoria: 'inversores híbridos', precio: '6240', moneda: 'PEN' } });
    assert.equal(p.estado, 201, JSON.stringify(p.datos));
    await llamar('POST', '/api/ia/reindexar', { token: sesiones.admin });
    const r = await preguntar(sesiones.vera, 'cotizador', { texto: 'Inversor híbrido Felicity IVEM 10048 para una bodega' });
    assert.equal(r.estado, 200);
    assert.equal(r.error, undefined, JSON.stringify(r.error));
    assert.ok(!r.texto.includes('<think>') && !r.texto.includes('pienso'), r.texto);
    assert.deepEqual(r.eventos.filter((e) => e.tipo === 'herramienta').map((e) => e.nombre), ['buscar_productos', 'proponer_cotizacion']);
    const t = r.fin.mensaje.datos.tarjeta;
    assert.equal(t.items[0].codigo, 'FEL-10048');
    assert.equal(t.items[0].precio_unitario, '6240.00');
    assert.equal(t.items[0].importe, '12480.00');
    assert.equal(t.items[1].descripcion, 'NO-EXISTE-9');
    assert.equal(t.items[1].precio_unitario, null);
    assert.equal(t.items[2].precio_unitario, null);
    assert.equal(t.faltan_precios, 2);
    assert.equal(t.totales.total, '12480.00');
    assert.ok(r.fin.mensaje.datos.fuentes.includes('Catálogo'));
    conv = r.eventos.find((e) => e.tipo === 'conversacion').id;
    tarjetaMsg = r.fin.mensaje.id;
  });
  it('el contexto de la empresa entra en las instrucciones del modelo', async () => {
    assert.equal((await llamar('PUT', '/api/ia/contexto', { token: sesiones.vera, cuerpo: { reglas: 'Incluir siempre instalación.', notas: 'Stock en Arequipa.' } })).estado, 200);
    const r = await preguntar(sesiones.vera, 'cotizador', { conversacion_id: conv, texto: 'Ahora con dos inversores Felicity' });
    assert.ok(r.fin);
    const ultimo = ollama.pedidos.filter((x) => x.ruta === '/api/chat').at(-1).cuerpo;
    assert.match(ultimo.messages[0].content, /Incluir siempre instalación\./);
    assert.ok(ultimo.messages.some((m) => m.role === 'user' && m.content.startsWith('Inversor híbrido Felicity'))); // recuerda lo anterior
    assert.equal(ultimo.think, false);
  });
  it('historial compartido: otro rol con permiso lo ve; la propuesta se abre solo con permiso de Cotización', async () => {
    const lista = (await llamar('GET', '/api/ia/cotizador/conversaciones', { token: sesiones.admin })).datos;
    assert.equal(lista[0].autor_nombre, 'VERA');
    const d = (await llamar('GET', `/api/ia/cotizador/conversaciones/${conv}`, { token: sesiones.admin })).datos;
    assert.deepEqual(d.mensajes.map((m) => m.rol), ['usuario', 'ia', 'usuario', 'ia']);
    const prop = await llamar('GET', `/api/ia/cotizador/propuesta/${tarjetaMsg}`, { token: sesiones.vera });
    assert.equal(prop.datos.items.length, 3);
    assert.equal((await llamar('GET', `/api/ia/cotizador/propuesta/${tarjetaMsg}`, { token: sesiones.tito })).estado, 403);
  });
  it('la IA no guardó nada: no hay cotizaciones nuevas', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM cotizaciones');
    assert.equal(rows[0].n, 0);
  });
  it('eliminar consultas: borrado lógico con auditoría', async () => {
    const r = await llamar('POST', '/api/ia/cotizador/conversaciones/eliminar', { token: sesiones.vera, cuerpo: { ids: [conv] } });
    assert.equal(r.datos.eliminadas, 1);
    assert.equal((await llamar('GET', '/api/ia/cotizador/conversaciones', { token: sesiones.vera })).datos.length, 0);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE entidad = 'ia_cotizador' AND accion = 'eliminar'");
    assert.equal(rows[0].n, 1);
  });
});

describe('Asistente IA', () => {
  it('responde con datos del servidor (kpis y fuentes) y la conversación es privada', async () => {
    const r = await preguntar(sesiones.fina, 'asistente', { texto: '¿Cómo van las finanzas este mes?' });
    assert.ok(r.fin, JSON.stringify(r.error));
    const d = r.fin.mensaje.datos;
    assert.equal(d.herramientas[0], 'resumen_finanzas');
    assert.ok(d.bloques.some((b) => b.tipo === 'kpis' && b.items[0].v.startsWith('S/')));
    assert.deepEqual(d.fuentes, ['Contabilidad', 'Generado por IA']);
    const id = r.eventos.find((e) => e.tipo === 'conversacion').id;
    assert.equal((await llamar('GET', `/api/ia/asistente/conversaciones/${id}`, { token: sesiones.vera })).estado, 404);
    assert.equal((await llamar('GET', '/api/ia/asistente/conversaciones', { token: sesiones.vera })).datos.length, 0);
  });
  it('respeta los permisos: ventas no ve la contabilidad aunque el modelo lo intente', async () => {
    const r = await preguntar(sesiones.vera, 'asistente', { texto: '¿Cuánto entró a la cuenta este mes?' });
    assert.ok(r.fin);
    const pedido = ollama.pedidos.filter((x) => x.ruta === '/api/chat').at(-2).cuerpo;
    assert.ok(!pedido.tools.some((t) => t.function.name === 'resumen_finanzas'));
    assert.equal(r.fin.mensaje.datos.bloques.length, 0);
    assert.match(r.texto, /no existe/);
  });
  it('si la IA no responde, queda el error guardado y no se rompe nada', async () => {
    const r = await preguntar(sesiones.fina, 'asistente', { texto: 'FALLA ahora' });
    assert.equal(r.error.motivo, 'error');
    const guardada = process.env.OLLAMA_URL;
    process.env.OLLAMA_URL = 'http://127.0.0.1:9';
    const r2 = await preguntar(sesiones.fina, 'asistente', { texto: 'hola' });
    process.env.OLLAMA_URL = guardada;
    assert.equal(r2.error.motivo, 'sin_conexion');
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM ia_mensajes WHERE rol = 'error'");
    assert.equal(rows[0].n, 2);
  });
  it('cambiar de modelo desde Configuración (y avisar si no está descargado)', async () => {
    assert.equal((await llamar('PUT', '/api/ia/config', { token: sesiones.vera, cuerpo: { modelo: 'qwen3:8b' } })).estado, 403);
    assert.equal((await llamar('PUT', '/api/ia/config', { token: sesiones.admin, cuerpo: { modelo: 'qwen3:8b; rm' } })).estado, 400);
    assert.equal((await llamar('PUT', '/api/ia/config', { token: sesiones.admin, cuerpo: { modelo: 'qwen3:8b' } })).estado, 200);
    const e = (await llamar('GET', '/api/ia/estado', { token: sesiones.admin })).datos;
    assert.equal(e.motivo, 'falta_modelo');
    const r = await preguntar(sesiones.fina, 'asistente', { texto: 'hola' });
    assert.equal(r.error.motivo, 'falta_modelo');
    await llamar('PUT', '/api/ia/config', { token: sesiones.admin, cuerpo: { modelo: 'qwen3:4b' } });
  });
});
