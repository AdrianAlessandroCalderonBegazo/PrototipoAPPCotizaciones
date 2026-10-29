// ERP · Fase 2: proyectos, cuenta principal, caja chica y envío de fondos (contra PostgreSQL de verdad, con las tablas de Finanzas).
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
const { aCentimos, deCentimos, montoEntrada } = await import('../src/dinero.js');

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
const diasAtras = (n) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const sql = (t, v = []) => pool.query(t, v).then((r) => r.rows);

describe('dinero sin coma flotante', () => {
  it('céntimos exactos', () => {
    assert.equal(aCentimos('0.1') + aCentimos('0.2'), aCentimos('0.3'));
    assert.equal(deCentimos(aCentimos('1234.5') - aCentimos('0.05')), '1234.45');
    assert.equal(deCentimos(-5), '-0.05');
    assert.equal(montoEntrada('1,250.50'), '1250.50');
    assert.equal(montoEntrada('80,5'), '80.50');
    assert.equal(montoEntrada(12.3), '12.30');
    for (const malo of ['abc', '0', '-5', '12.345', '', null]) assert.throws(() => montoEntrada(malo), /monto/i);
  });
});

let pry;
describe('proyectos', () => {
  it('crear: solo nombre y presupuesto; código correlativo; permisos', async () => {
    assert.equal((await llamar('POST', '/api/proyectos', { token: sesiones.tito, cuerpo: { nombre: 'X', presupuesto: 10 } })).estado, 403);
    assert.equal((await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { presupuesto: 10 } })).estado, 400);
    assert.equal((await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { nombre: 'X', presupuesto: '0' } })).estado, 400);
    assert.equal((await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { nombre: 'X', presupuesto: '10.999' } })).estado, 400);
    const r = await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { nombre: 'Lácteos Characato', presupuesto: '228,000.00' } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    pry = r.datos;
    assert.equal(pry.codigo, 'PRY-001');
    assert.equal(pry.presupuesto, '228000.00');
    assert.equal(pry.estado, 'activo');
    assert.equal(pry.cliente, null);
    const otro = await llamar('POST', '/api/proyectos', { token: sesiones.admin, cuerpo: { nombre: 'Hostal Los Tambos', presupuesto: 186000 } });
    assert.equal(otro.datos.codigo, 'PRY-002');
    // técnico (lectura) ve la lista; ventas (lectura) también; el detalle trae la creación en la línea de tiempo
    const lista = await llamar('GET', '/api/proyectos', { token: sesiones.tito });
    assert.equal(lista.estado, 200);
    assert.equal(lista.datos.proyectos.length, 2);
    assert.deepEqual(lista.datos.conteo, { activo: 2, pausado: 0, finalizado: 0 });
    assert.equal(lista.datos.proyectos[0].gastado, '0.00');
    const d = await llamar('GET', `/api/proyectos/${pry.id}`, { token: sesiones.vera });
    assert.equal(d.datos.estados.length, 1);
    assert.equal(d.datos.estados[0].usuario, 'FINA');
    const aud = await sql("SELECT accion FROM audit_log WHERE entidad = 'proyecto' AND entidad_id = $1", [String(pry.id)]);
    assert.deepEqual(aud.map((a) => a.accion), ['crear']);
  });

  it('editar datos y presupuesto con control de versión', async () => {
    const r = await llamar('PUT', `/api/proyectos/${pry.id}`, { token: sesiones.fina, cuerpo: { cliente: 'Lácteos del Sur S.A.C.', ubicacion: 'Characato', version: pry.version } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.cliente, 'Lácteos del Sur S.A.C.');
    assert.equal((await llamar('PUT', `/api/proyectos/${pry.id}`, { token: sesiones.fina, cuerpo: { cliente: 'Otro', version: pry.version } })).estado, 409);
    pry = r.datos;
  });

  it('pausar exige causa; historial; finalizado queda en solo lectura', async () => {
    const id = (await llamar('POST', '/api/proyectos', { token: sesiones.fina, cuerpo: { nombre: 'Granja Tiabaya', presupuesto: 50000 } })).datos.id;
    assert.equal((await llamar('POST', `/api/proyectos/${id}/estado`, { token: sesiones.fina, cuerpo: { estado: 'pausado' } })).estado, 400);
    assert.equal((await llamar('POST', `/api/proyectos/${id}/estado`, { token: sesiones.tito, cuerpo: { estado: 'pausado', causa: 'x' } })).estado, 403);
    const p = await llamar('POST', `/api/proyectos/${id}/estado`, { token: sesiones.fina, cuerpo: { estado: 'pausado', causa: 'Pago del cliente pendiente' } });
    assert.equal(p.datos.estado, 'pausado');
    assert.equal(p.datos.causa_pausa, 'Pago del cliente pendiente');
    const a = await llamar('POST', `/api/proyectos/${id}/estado`, { token: sesiones.fina, cuerpo: { estado: 'activo' } });
    assert.equal(a.datos.causa_pausa, null);
    assert.equal((await llamar('POST', `/api/proyectos/${id}/estado`, { token: sesiones.fina, cuerpo: { estado: 'finalizado' } })).estado, 200);
    assert.equal((await llamar('POST', `/api/proyectos/${id}/estado`, { token: sesiones.admin, cuerpo: { estado: 'activo' } })).estado, 409);
    assert.equal((await llamar('PUT', `/api/proyectos/${id}`, { token: sesiones.admin, cuerpo: { nombre: 'Otro' } })).estado, 409);
    const d = (await llamar('GET', `/api/proyectos/${id}`, { token: sesiones.fina })).datos;
    assert.deepEqual(d.estados.map((e) => e.estado), ['activo', 'pausado', 'activo', 'finalizado']);
    // ya no aparece entre los activos (para elegir al registrar un gasto)
    const activos = (await llamar('GET', '/api/proyectos/activos', { token: sesiones.fina })).datos;
    assert.ok(!activos.some((x) => x.id === id));
    assert.equal((await llamar('GET', '/api/proyectos/activos', { token: sesiones.vera })).estado, 200); // ventas: proyectos lectura
  });

  it('fotos: subir varias y quitar una', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
    const rutas = [];
    for (let i = 0; i < 2; i++) rutas.push((await llamar('POST', '/api/subidas?ext=png', { token: sesiones.fina, crudo: png })).datos.ruta);
    assert.equal((await llamar('POST', `/api/proyectos/${pry.id}/fotos`, { token: sesiones.fina, cuerpo: { fotos: [{ ruta: '/etc/passwd' }] } })).estado, 400);
    const r = await llamar('POST', `/api/proyectos/${pry.id}/fotos`, { token: sesiones.fina, cuerpo: { fotos: rutas.map((ruta) => ({ ruta })) } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.length, 2);
    assert.equal((await llamar('DELETE', `/api/proyectos/${pry.id}/fotos/${r.datos[0].id}`, { token: sesiones.fina })).estado, 200);
    assert.equal((await llamar('GET', `/api/proyectos/${pry.id}`, { token: sesiones.fina })).datos.fotos.length, 1);
  });
});

let cta;
describe('cuenta principal', () => {
  it('solo Contabilidad (y admin) la ven; ventas y técnicos no', async () => {
    assert.equal((await llamar('GET', '/api/contabilidad/resumen', { token: sesiones.vera })).estado, 403);
    assert.equal((await llamar('GET', '/api/contabilidad/cuentas', { token: sesiones.tito })).estado, 403);
    assert.equal((await llamar('GET', '/api/contabilidad/resumen', { token: sesiones.fina })).estado, 200);
  });

  it('cuenta sin saldo inicial: el saldo es «Sin dato» (null), los movimientos igual suman', async () => {
    const r = await llamar('POST', '/api/contabilidad/cuentas', { token: sesiones.fina, cuerpo: { nombre: 'BCP Cta. cte. S/', banco: 'BCP', moneda: 'PEN', principal: true } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    cta = r.datos;
    assert.equal(cta.saldo, null);
    const m1 = await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'ingreso', monto: '1000.10', fecha: hoy, concepto: 'Cobro adelanto', categoria: 'Adelanto de cliente' } });
    assert.equal(m1.estado, 201, JSON.stringify(m1.datos));
    assert.equal(m1.datos.monto, '1000.10'); // texto exacto, no coma flotante
    await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'egreso', monto: '200.05', fecha: hoy, concepto: 'Inversor', categoria: 'Proveedores / equipos', documento: 'F001-123' } });
    const l = (await llamar('GET', `/api/contabilidad/movimientos?cuenta_id=${cta.id}`, { token: sesiones.fina })).datos;
    assert.deepEqual(l.totales, { ingresos: '1000.10', egresos: '200.05' });
    assert.ok(l.movimientos.every((m) => m.saldo === null));
  });

  it('con saldo inicial: saldo exacto y saldo corrido por movimiento', async () => {
    assert.equal((await llamar('PUT', `/api/contabilidad/cuentas/${cta.id}`, { token: sesiones.fina, cuerpo: { saldo_inicial: '500', saldo_inicial_fecha: diasAtras(10) } })).estado, 200);
    const k = (await llamar('GET', '/api/contabilidad/cuentas', { token: sesiones.fina })).datos.find((x) => x.id === cta.id);
    assert.equal(k.saldo, '1300.05');
    const l = (await llamar('GET', `/api/contabilidad/movimientos?cuenta_id=${cta.id}`, { token: sesiones.fina })).datos;
    assert.deepEqual(l.movimientos.map((m) => m.saldo), ['1300.05', '1500.10']);
    // antes de la fecha del saldo inicial no se registra
    const viejo = await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'ingreso', monto: 1, fecha: diasAtras(20), concepto: 'x' } });
    assert.equal(viejo.estado, 400);
    // ni a futuro, ni categoría inventada, ni «envío a caja chica» a mano
    assert.equal((await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'ingreso', monto: 1, fecha: '2999-01-01', concepto: 'x' } })).estado, 400);
    assert.equal((await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'ingreso', monto: 1, fecha: hoy, concepto: 'x', categoria: 'Inventada' } })).estado, 400);
    assert.equal((await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'egreso', monto: 1, fecha: hoy, concepto: 'x', categoria: 'Envío a caja chica' } })).estado, 400);
  });

  it('anular con motivo (no se borra); el saldo lo descuenta; queda en la auditoría', async () => {
    const m = (await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'egreso', monto: '99.99', fecha: hoy, concepto: 'Error de digitación' } })).datos;
    assert.equal((await llamar('POST', `/api/contabilidad/movimientos/${m.id}/anular`, { token: sesiones.fina, cuerpo: {} })).estado, 400);
    const r = await llamar('POST', `/api/contabilidad/movimientos/${m.id}/anular`, { token: sesiones.fina, cuerpo: { motivo: 'Duplicado' } });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.anulado, true);
    assert.equal((await llamar('GET', '/api/contabilidad/cuentas', { token: sesiones.fina })).datos.find((x) => x.id === cta.id).saldo, '1300.05');
    const lista = (await llamar('GET', `/api/contabilidad/movimientos?cuenta_id=${cta.id}&anulados=1`, { token: sesiones.fina })).datos.movimientos;
    assert.equal(lista.find((x) => x.id === m.id).saldo, null);
    const aud = await sql("SELECT accion, detalle FROM audit_log WHERE entidad = 'movimiento_cuenta' AND entidad_id = $1 ORDER BY id", [String(m.id)]);
    assert.deepEqual(aud.map((a) => a.accion), ['crear', 'anular']);
    assert.equal(aud[1].detalle, 'Duplicado');
  });

  it('un egreso asignado a un proyecto suma a su gasto; un proyecto finalizado no recibe gastos', async () => {
    const r = await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'egreso', monto: '100.00', fecha: hoy, concepto: 'Estructuras', categoria: 'Gasto de proyecto', proyecto_id: pry.id } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    const fin = (await sql("SELECT id FROM proyectos WHERE estado = 'finalizado'"))[0].id;
    assert.equal((await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'egreso', monto: 1, fecha: hoy, concepto: 'x', proyecto_id: fin } })).estado, 409);
    assert.equal((await llamar('POST', '/api/contabilidad/movimientos', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, tipo: 'ingreso', monto: 1, fecha: hoy, concepto: 'x', proyecto_id: pry.id } })).estado, 400);
  });
});

describe('gastos de proyecto desde la caja (Finanzas)', () => {
  it('caja chica y caja diaria con proyecto aparecen en el detalle, con su origen y quién lo registró', async () => {
    const fina = (await sql("SELECT id FROM usuarios WHERE usuario = 'fina'"))[0].id;
    const [mov] = await sql(
      `INSERT INTO caja_chica_mov (ciudad, fecha, tipo, descripcion, persona, categoria, monto, proyecto_id, proyecto_nombre, created_by)
       VALUES ('AQP', $1, 'EGRESO', 'Pernos y tacos', 'Luis', 'Gasto de proyecto', 45.50, $2, 'Lácteos Characato', $3) RETURNING id`,
      [hoy, pry.id, String(fina)],
    );
    const [hoja] = await sql("INSERT INTO caja_hoja (ciudad, fecha) VALUES ('AQP', $1) RETURNING id", [hoy]);
    await sql(
      `INSERT INTO caja_fila (hoja_id, orden, tipo, descripcion, responsable, comprobante, caja_salida_efectivo, categoria, proyecto_id, proyecto_nombre, created_by)
       VALUES ($1, 1, 'OBRA', 'Cable 10mm', 'Luis', 'BOLETA', 300.40, 'Gasto de proyecto', $2, 'Lácteos Characato', $3)`,
      [hoja.id, pry.id, String(fina)],
    );
    const d = (await llamar('GET', `/api/proyectos/${pry.id}`, { token: sesiones.tito })).datos;
    assert.equal(d.caja_disponible, true);
    assert.deepEqual(d.gastos.map((g) => g.origen).sort(), ['caja_chica', 'caja_diaria', 'cuenta_principal']);
    assert.equal(d.proyecto.gastado, '445.90');
    assert.equal(d.proyecto.saldo, '227554.10');
    assert.equal(d.gastos.find((g) => g.origen === 'caja_chica').por, 'FINA');
    assert.equal(d.gastos.find((g) => g.origen === 'caja_diaria').comprobante, 'BOLETA');
    assert.equal(d.gastos.find((g) => g.id === mov.id).monto, '45.50');
    const lista = (await llamar('GET', '/api/proyectos?estado=activo', { token: sesiones.tito })).datos.proyectos;
    assert.equal(lista.find((p) => p.id === pry.id).gastado, '445.90');
    // borrado en Finanzas → deja de contar
    await sql('UPDATE caja_chica_mov SET deleted_at = now() WHERE id = $1', [mov.id]);
    assert.equal((await llamar('GET', `/api/proyectos/${pry.id}`, { token: sesiones.tito })).datos.proyecto.gastado, '400.40');
  });
});

describe('enviar fondos a caja chica', () => {
  const saldoChica = async (ciudad) => (await sql('SELECT saldo::text AS s FROM v_caja_chica_saldo WHERE ciudad = $1', [ciudad]))[0].s;

  it('una sola operación: egreso en la cuenta + ingreso FONDO en la caja + historial de Finanzas + auditoría', async () => {
    const antes = await saldoChica('MOQ');
    const r = await llamar('POST', '/api/contabilidad/envios', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, ciudad: 'MOQ', monto: '250.25', concepto: 'Reposición semana 44' } });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.saldo_antes, '1200.05');
    assert.equal(r.datos.saldo_despues, '949.80');
    assert.equal(deCentimos(aCentimos(await saldoChica('MOQ')) - aCentimos(antes)), '250.25');
    const [mov] = await sql('SELECT tipo, origen, monto::text AS monto FROM caja_chica_mov WHERE id = $1', [r.datos.envio.caja_chica_mov_id]);
    assert.deepEqual(mov, { tipo: 'FONDO', origen: 'ERP', monto: '250.25' });
    assert.equal((await sql("SELECT count(*)::int AS n FROM caja_auditoria WHERE entidad_id = $1 AND accion = 'crear'", [r.datos.envio.caja_chica_mov_id]))[0].n, 1);
    assert.equal((await sql("SELECT count(*)::int AS n FROM audit_log WHERE entidad = 'envio_caja_chica'"))[0].n, 1);
    // el egreso del envío no se anula desde el ERP
    assert.equal((await llamar('POST', `/api/contabilidad/movimientos/${r.datos.envio.movimiento_id}/anular`, { token: sesiones.admin, cuerpo: { motivo: 'x' } })).estado, 409);
    // y aparece en la caja chica del ERP
    const caja = (await llamar('GET', '/api/contabilidad/caja-chica', { token: sesiones.fina })).datos;
    assert.equal(caja.disponible, true);
    assert.ok(caja.movimientos.some((m) => m.tipo === 'FONDO' && m.monto === '250.25'));
    assert.equal(caja.saldos.find((s) => s.ciudad === 'MOQ').saldo, await saldoChica('MOQ'));
  });

  it('si la cuenta queda en negativo: solo un Administrador lo confirma', async () => {
    const cuerpo = { cuenta_id: cta.id, ciudad: 'AQP', monto: '5000', concepto: 'Obra grande' };
    const r1 = await llamar('POST', '/api/contabilidad/envios', { token: sesiones.fina, cuerpo });
    assert.equal(r1.estado, 409);
    assert.equal(r1.datos.codigo, 'SALDO_NEGATIVO');
    assert.equal(r1.datos.saldo_despues, '-4050.20');
    assert.equal((await llamar('POST', '/api/contabilidad/envios', { token: sesiones.fina, cuerpo: { ...cuerpo, autorizar_negativo: true } })).estado, 403);
    assert.equal((await llamar('POST', '/api/contabilidad/envios', { token: sesiones.admin, cuerpo })).estado, 409); // sin confirmar
    const ok = await llamar('POST', '/api/contabilidad/envios', { token: sesiones.admin, cuerpo: { ...cuerpo, autorizar_negativo: true } });
    assert.equal(ok.estado, 201);
    assert.equal(ok.datos.envio.saldo_negativo_autorizado, true);
    // nada quedó a medias de los intentos rechazados: 2 envíos en total
    assert.equal((await sql('SELECT count(*)::int AS n FROM envios_caja_chica'))[0].n, 2);
    assert.equal((await sql("SELECT count(*)::int AS n FROM caja_chica_mov WHERE tipo = 'FONDO'"))[0].n, 2);
  });

  it('cuenta sin saldo conocido o en dólares; ventas no puede enviar', async () => {
    const usd = (await llamar('POST', '/api/contabilidad/cuentas', { token: sesiones.fina, cuerpo: { nombre: 'BCP US$', moneda: 'USD', saldo_inicial: '1000', saldo_inicial_fecha: hoy } })).datos;
    assert.equal((await llamar('POST', '/api/contabilidad/envios', { token: sesiones.fina, cuerpo: { cuenta_id: usd.id, ciudad: 'AQP', monto: 10, concepto: 'x' } })).estado, 400);
    const sin = (await llamar('POST', '/api/contabilidad/cuentas', { token: sesiones.fina, cuerpo: { nombre: 'Interbank S/', moneda: 'PEN' } })).datos;
    const r = await llamar('POST', '/api/contabilidad/envios', { token: sesiones.fina, cuerpo: { cuenta_id: sin.id, ciudad: 'AQP', monto: 10, concepto: 'x' } });
    assert.equal(r.estado, 409);
    assert.match(r.datos.error, /saldo inicial/);
    assert.equal((await llamar('POST', '/api/contabilidad/envios', { token: sesiones.vera, cuerpo: { cuenta_id: cta.id, ciudad: 'AQP', monto: 10, concepto: 'x' } })).estado, 403);
    assert.equal((await llamar('POST', '/api/contabilidad/envios', { token: sesiones.fina, cuerpo: { cuenta_id: cta.id, ciudad: 'LIM', monto: 10, concepto: 'x' } })).estado, 400);
  });
});

describe('resumen de contabilidad', () => {
  it('flujo de 6 meses, egresos por categoría y por proyecto (cuenta + caja)', async () => {
    const r = (await llamar('GET', '/api/contabilidad/resumen', { token: sesiones.fina })).datos;
    assert.equal(r.cuenta.id, cta.id);
    assert.equal(r.flujo.length, 6);
    assert.equal(r.flujo.at(-1).mes, hoy.slice(0, 7));
    assert.equal(r.kpis.ingresos_mes, '1000.10');
    // egresos: 200.05 + 100.00 (proyecto) + 250.25 + 5000.00 (envíos); el anulado no cuenta
    assert.equal(r.kpis.egresos_mes, '5550.30');
    const env = r.egresos_por_categoria.find((c) => c.categoria === 'Envío a caja chica');
    assert.equal(env.monto, '5250.25');
    const p = r.egresos_por_proyecto.find((x) => x.id === pry.id);
    assert.equal(p.total, '400.40'); // 100 cuenta + 300.40 caja diaria (el de caja chica se borró)
  });
});
