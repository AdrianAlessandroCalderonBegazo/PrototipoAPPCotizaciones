// ERP · Fase 1: roles, matriz de permisos, auditoría y configuración (contra PostgreSQL de verdad).
// Uso:  DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('roles', () => {
  it('solo existen los 4 roles del ERP', async () => {
    const malo = await llamar('POST', '/api/usuarios', { token: sesiones.admin, cuerpo: { usuario: 'otro', nombre: 'Otro', clave: 'clave-segura', rol: 'encargado' } });
    assert.equal(malo.estado, 400);
    const cat = (await llamar('GET', '/api/permisos/catalogo', { token: sesiones.tito })).datos;
    assert.deepEqual(cat.roles.map((r) => r.nombre), ['Administrador', 'Ventas', 'Contabilidad', 'Técnico']);
    assert.ok(cat.modulos.some((m) => m.clave === 'caja_chica'));
  });

  it('al entrar, cada uno recibe su nivel en cada módulo', async () => {
    const vera = await entrar('vera', 'clave-segura');
    assert.equal(vera.usuario.rol_etiqueta, 'Ventas');
    assert.equal(vera.usuario.niveles.cotizacion, 'completo');
    assert.equal(vera.usuario.niveles.contabilidad, 'ninguno');
    const yo = (await llamar('GET', '/api/yo', { token: sesiones.fina })).datos;
    assert.equal(yo.niveles.contabilidad, 'completo');
    assert.equal(yo.niveles.caja_chica, 'completo');
    const adm = (await llamar('GET', '/api/yo', { token: sesiones.admin })).datos;
    assert.ok(Object.values(adm.niveles).every((n) => n === 'completo'), 'el administrador tiene todo');
    // queda la fecha del último acceso
    const lista = (await llamar('GET', '/api/usuarios', { token: sesiones.admin })).datos;
    assert.ok(lista.find((u) => u.usuario === 'vera').ultimo_acceso);
  });
});

describe('matriz de permisos', () => {
  it('solo el administrador la cambia; el cambio vale de inmediato y queda en la auditoría', async () => {
    const m = (await llamar('GET', '/api/permisos/matriz', { token: sesiones.admin })).datos;
    assert.equal(m.tecnico.logistica, 'completo');
    assert.equal((await llamar('GET', '/api/permisos/matriz', { token: sesiones.vera })).estado, 403);

    // Ventas no puede crear maletas en Logística...
    const maleta = { nombre: 'Maleta de prueba' };
    assert.equal((await llamar('POST', '/api/maletas', { token: sesiones.vera, cuerpo: maleta })).estado, 403);
    // ...nadie más que el admin cambia la matriz
    assert.equal((await llamar('PUT', '/api/permisos/matriz', { token: sesiones.fina, cuerpo: { matriz: { ventas: { logistica: 'completo' } } } })).estado, 403);
    assert.equal((await llamar('PUT', '/api/permisos/matriz', { token: sesiones.admin, cuerpo: { matriz: { ventas: { logistica: 'jefe' } } } })).estado, 400);
    const ok = await llamar('PUT', '/api/permisos/matriz', { token: sesiones.admin, cuerpo: { matriz: { ventas: { logistica: 'completo' } } } });
    assert.equal(ok.estado, 200);
    assert.equal(ok.datos.ventas.logistica, 'completo');
    // ...y ahora sí puede
    assert.equal((await llamar('POST', '/api/maletas', { token: sesiones.vera, cuerpo: maleta })).estado, 201);
    // el administrador no se puede recortar
    await llamar('PUT', '/api/permisos/matriz', { token: sesiones.admin, cuerpo: { matriz: { admin: { logistica: 'ninguno' } } } });
    assert.equal((await llamar('GET', '/api/yo', { token: sesiones.admin })).datos.niveles.logistica, 'completo');

    const aud = (await llamar('GET', '/api/auditoria?entidad=permisos', { token: sesiones.admin })).datos;
    assert.equal(aud[0].accion, 'editar');
    assert.equal(aud[0].antes.ventas.logistica, 'lectura');
    assert.equal(aud[0].despues.ventas.logistica, 'completo');
    assert.equal((await llamar('GET', '/api/auditoria', { token: sesiones.vera })).estado, 403);
  });

  it('quien administra usuarios sin ser admin no puede crear ni tocar administradores', async () => {
    await llamar('PUT', '/api/permisos/matriz', { token: sesiones.admin, cuerpo: { matriz: { contabilidad: { configuracion: 'completo' } } } });
    const crearAdmin = await llamar('POST', '/api/usuarios', { token: sesiones.fina, cuerpo: { usuario: 'jefe2', nombre: 'Jefe', clave: 'clave-segura', rol: 'admin' } });
    assert.equal(crearAdmin.estado, 403);
    const tecnico = await llamar('POST', '/api/usuarios', { token: sesiones.fina, cuerpo: { usuario: 'nuevo', nombre: 'Nuevo', clave: 'clave-segura', rol: 'tecnico' } });
    assert.equal(tecnico.estado, 201);
    const adminId = (await llamar('GET', '/api/usuarios', { token: sesiones.fina })).datos.find((u) => u.rol === 'admin').id;
    assert.equal((await llamar('PUT', `/api/usuarios/${adminId}`, { token: sesiones.fina, cuerpo: { activo: false } })).estado, 403);
    const aud = (await llamar('GET', '/api/auditoria?entidad=usuario', { token: sesiones.admin })).datos;
    assert.ok(aud.some((a) => a.accion === 'crear' && a.despues.usuario === 'nuevo' && a.usuario === 'FINA'));
    await llamar('PUT', '/api/permisos/matriz', { token: sesiones.admin, cuerpo: { matriz: { contabilidad: { configuracion: 'ninguno' } } } });
  });
});

describe('configuración', () => {
  it('datos de la empresa: precargados con lo que ya usaba Logística; lo que no se sabe queda vacío; el RUC se valida', async () => {
    const inicial = (await llamar('GET', '/api/empresa', { token: sesiones.tito })).datos;
    assert.equal(inicial.razon_social, 'INVERSIONES ICR S.R.L.');
    assert.equal(inicial.telefono, null);
    assert.equal((await llamar('PUT', '/api/empresa', { token: sesiones.vera, cuerpo: { razon_social: 'X' } })).estado, 403);
    assert.equal((await llamar('PUT', '/api/empresa', { token: sesiones.admin, cuerpo: { ruc: '20605309488' } })).estado, 400);
    const ok = await llamar('PUT', '/api/empresa', { token: sesiones.admin, cuerpo: { razon_social: 'INVERSIONES ICR S.R.L.', ruc: '20605309489', ciudad: 'Arequipa', telefono: '' } });
    assert.equal(ok.estado, 200);
    assert.equal(ok.datos.ruc, '20605309489');
    assert.equal(ok.datos.telefono, null);
    assert.equal(ok.datos.direccion, 'Calle Pizarro 325 C');
    const aud = (await llamar('GET', '/api/auditoria?entidad=empresa', { token: sesiones.admin })).datos;
    assert.equal(aud[0].despues.razon_social, 'INVERSIONES ICR S.R.L.');
  });

  it('parámetros: tipo de cambio exacto (texto), porcentajes de alerta y vigencia de precios', async () => {
    const p = (await llamar('GET', '/api/parametros', { token: sesiones.tito })).datos;
    assert.deepEqual(p.tipo_cambio, { valor: null, fecha: null, fuente: null });
    assert.equal(p.presupuesto_aviso_pct, 80);
    assert.equal((await llamar('PUT', '/api/parametros', { token: sesiones.admin, cuerpo: { tipo_cambio: { valor: 'tres' } } })).estado, 400);
    assert.equal((await llamar('PUT', '/api/parametros', { token: sesiones.admin, cuerpo: { presupuesto_aviso_pct: 120 } })).estado, 400);
    const ok = await llamar('PUT', '/api/parametros', { token: sesiones.admin, cuerpo: { tipo_cambio: { valor: '3.7420', fecha: '2026-10-29', fuente: 'SBS' }, vigencia_precios_dias: 45 } });
    assert.equal(ok.estado, 200);
    assert.deepEqual(ok.datos.tipo_cambio, { valor: '3.742', fecha: '2026-10-29', fuente: 'SBS' });
    assert.equal(ok.datos.vigencia_precios_dias, 45);
  });

  it('numeración de cotizaciones: se puede adelantar pero nunca retroceder', async () => {
    const n = (await llamar('GET', '/api/numeracion/cotizacion', { token: sesiones.vera })).datos;
    assert.equal(n.ejemplo, `S${String(n.siguiente).padStart(5, '0')}`);
    assert.equal((await llamar('GET', '/api/numeracion/cotizacion', { token: sesiones.tito })).estado, 403);
    const ok = await llamar('PUT', '/api/numeracion/cotizacion', { token: sesiones.admin, cuerpo: { prefijo: 'COT-', digitos: 4, siguiente: n.siguiente + 100 } });
    assert.equal(ok.estado, 200);
    assert.equal(ok.datos.ejemplo, `COT-${String(n.siguiente + 100).padStart(4, '0')}`);
    assert.equal((await llamar('PUT', '/api/numeracion/cotizacion', { token: sesiones.admin, cuerpo: { prefijo: 'COT-', digitos: 4, siguiente: n.siguiente } })).estado, 400);
    // el correlativo que usa la app sigue desde ahí
    const sig = (await llamar('POST', '/api/correlativos/cotizacion', { token: sesiones.vera })).datos.valor;
    assert.equal(sig, n.siguiente + 100);
  });

  it('integraciones: la PWA Logística está conectada; lo no configurado lo dice', async () => {
    const lista = (await llamar('GET', '/api/integraciones', { token: sesiones.admin })).datos;
    const de = (c) => lista.find((i) => i.clave === c);
    assert.equal(de('logistica').estado, 'conectado');
    assert.equal(de('ollama').estado, 'no_configurado');
    assert.equal(de('vrm').estado, 'no_configurado');
    assert.equal(de('sunat').estado, 'en_navegador');
    assert.equal((await llamar('POST', '/api/integraciones/logistica/probar', { token: sesiones.admin })).datos.estado, 'conectado');
    assert.equal((await llamar('GET', '/api/integraciones', { token: sesiones.tito })).estado, 403);
  });

  it('eliminar documentos queda en la auditoría con lo que había', async () => {
    const num = (await llamar('POST', '/api/correlativos/requerimiento', { token: sesiones.tito })).datos.valor;
    const req = (await llamar('POST', '/api/requerimientos', { token: sesiones.tito, cuerpo: { numero: `REQ-${String(num).padStart(4, '0')}`, obra: 'Obra Z', solicitante: 'Tito', fecha_creacion: '2026-10-29T09:00:00.000', categorias_json: '[]' } })).datos;
    assert.equal((await llamar('DELETE', `/api/requerimientos/${req.id}`, { token: sesiones.admin })).estado, 200);
    const aud = (await llamar('GET', '/api/auditoria?entidad=requerimiento', { token: sesiones.admin })).datos;
    assert.equal(aud[0].accion, 'eliminar');
    assert.equal(aud[0].antes.obra, 'Obra Z');
  });
});
