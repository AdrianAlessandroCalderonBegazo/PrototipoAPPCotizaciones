// ERP · Fase 5: Facturación SUNAT (comprobantes, cálculo, validaciones, estados, archivos y padrón) con PostgreSQL de verdad.
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
const enDias = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const RUC = '20605309489'; // dígito verificador correcto
const factura = (extra = {}) => ({
  tipo: 'factura', cliente_doc: RUC, cliente_nombre: 'Granja Avícola Tiabaya S.A.C.', cliente_direccion: 'Tiabaya, Arequipa',
  items: [{ descripcion: 'Sistema On-Grid 60 kWp – 2.º hito (30%)', unidad: 'ZZ', cantidad: '1', valor_unitario: '57966.10' }], ...extra,
});

describe('permisos y cálculo', () => {
  it('el técnico no ve facturación; ventas y contabilidad sí', async () => {
    assert.equal((await llamar('GET', '/api/facturacion', { token: sesiones.tito })).estado, 403);
    assert.equal((await llamar('GET', '/api/facturacion', { token: sesiones.vera })).estado, 200);
    assert.equal((await llamar('POST', '/api/facturacion', { token: sesiones.tito, cuerpo: factura() })).estado, 403);
  });
  it('IGV sobre el valor sin IGV, por línea, en céntimos exactos', async () => {
    const r = await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ items: [
      { descripcion: 'Hito', unidad: 'ZZ', cantidad: '1', valor_unitario: '57,966.10' },
      { descripcion: 'Conector MC4', unidad: 'NIU', cantidad: '3', valor_unitario: '12.3456' },
    ] }) });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.estado, 'borrador');
    assert.equal(r.datos.numero, null);
    assert.deepEqual(r.datos.items.map((i) => [i.valor_venta, i.igv, i.importe]), [['57966.10', '10433.90', '68400.00'], ['37.04', '6.67', '43.71']]);
    assert.deepEqual(r.datos.totales, { op_gravada: '58003.14', igv: '10440.57', total: '68443.71' });
  });
  it('rechaza documentos inválidos y datos mal escritos', async () => {
    assert.equal((await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ cliente_doc: '20605309488' }) })).estado, 400);
    assert.equal((await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ cliente_doc: '43218765' }) })).estado, 400); // factura con DNI
    assert.equal((await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ items: [{ descripcion: 'x', cantidad: '1', valor_unitario: '1.23456' }] }) })).estado, 400);
    assert.equal((await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ tipo: 'nota' }) })).estado, 400);
  });
});

describe('validaciones antes de abrir SUNAT', () => {
  it('factura sin RUC no se envía; boleta sin DNI solo hasta S/ 700', async () => {
    const f = (await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ cliente_doc: null, cliente_nombre: null }) })).datos;
    const e = await llamar('POST', `/api/facturacion/${f.id}/enviar`, { token: sesiones.fina, cuerpo: {} });
    assert.equal(e.estado, 400);
    assert.ok(e.datos.validaciones.some((v) => v.texto.startsWith('RUC del cliente')));
    const b1 = (await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: { tipo: 'boleta', items: [{ descripcion: 'Panel', cantidad: '2', valor_unitario: '339.00' }] } })).datos;
    assert.equal(b1.totales.total, '800.04');
    assert.equal((await llamar('POST', `/api/facturacion/${b1.id}/enviar`, { token: sesiones.fina, cuerpo: {} })).estado, 400);
    const b2 = (await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: { tipo: 'boleta', items: [{ descripcion: 'Panel', cantidad: '1', valor_unitario: '423.73' }] } })).datos;
    const ok = await llamar('POST', `/api/facturacion/${b2.id}/enviar`, { token: sesiones.fina, cuerpo: { version: b2.version } });
    assert.equal(ok.estado, 200, JSON.stringify(ok.datos));
    assert.equal(ok.datos.estado, 'enviado');
  });
  it('crédito: las cuotas deben sumar el total y vencer después de hoy', async () => {
    const mal = (await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ forma_pago: 'credito', cuotas: [{ fecha: enDias(30), monto: '1000' }] }) })).datos;
    assert.equal((await llamar('POST', `/api/facturacion/${mal.id}/enviar`, { token: sesiones.fina, cuerpo: {} })).estado, 400);
    const ayer = (await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ forma_pago: 'credito', cuotas: [{ fecha: hoy(), monto: '68400' }] }) })).datos;
    assert.equal((await llamar('POST', `/api/facturacion/${ayer.id}/enviar`, { token: sesiones.fina, cuerpo: {} })).estado, 400);
    const bien = (await llamar('POST', '/api/facturacion', { token: sesiones.fina, cuerpo: factura({ forma_pago: 'credito', cuotas: [{ fecha: enDias(30), monto: '34200' }, { fecha: enDias(60), monto: '34,200.00' }] }) })).datos;
    const r = await llamar('GET', `/api/facturacion/${bien.id}`, { token: sesiones.fina });
    assert.ok(r.datos.validaciones.every((v) => v.ok), JSON.stringify(r.datos.validaciones));
    assert.equal((await llamar('POST', `/api/facturacion/${bien.id}/enviar`, { token: sesiones.fina, cuerpo: {} })).estado, 200);
  });
});

describe('flujo completo: enviar → emitir → archivos → anular', () => {
  let c;
  it('emitir pide el número de SUNAT con una serie que corresponda', async () => {
    c = (await llamar('POST', '/api/facturacion', { token: sesiones.vera, cuerpo: factura() })).datos;
    assert.equal((await llamar('POST', `/api/facturacion/${c.id}/emitir`, { token: sesiones.vera, cuerpo: { numero: 'E001-15' } })).estado, 409); // aún borrador
    c = (await llamar('POST', `/api/facturacion/${c.id}/enviar`, { token: sesiones.vera, cuerpo: {} })).datos;
    assert.equal((await llamar('PUT', `/api/facturacion/${c.id}`, { token: sesiones.vera, cuerpo: factura() })).estado, 409); // enviado no se edita
    assert.equal((await llamar('POST', `/api/facturacion/${c.id}/emitir`, { token: sesiones.vera, cuerpo: { numero: 'B001-15' } })).estado, 400);
    assert.equal((await llamar('POST', `/api/facturacion/${c.id}/emitir`, { token: sesiones.vera, cuerpo: { numero: '15' } })).estado, 400);
    assert.equal((await llamar('POST', `/api/facturacion/${c.id}/emitir`, { token: sesiones.vera, cuerpo: { numero: 'E001-15', fecha_emision: enDias(2) } })).estado, 400);
    const r = await llamar('POST', `/api/facturacion/${c.id}/emitir`, { token: sesiones.vera, cuerpo: { numero: ' e001-15 ', version: c.version } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    c = r.datos;
    assert.equal(c.estado, 'emitido');
    assert.equal(c.numero, 'E001-00000015');
    assert.equal(c.fecha_emision, hoy());
  });
  it('el mismo número no se registra dos veces', async () => {
    let otro = (await llamar('POST', '/api/facturacion', { token: sesiones.vera, cuerpo: factura() })).datos;
    otro = (await llamar('POST', `/api/facturacion/${otro.id}/enviar`, { token: sesiones.vera, cuerpo: {} })).datos;
    assert.equal((await llamar('POST', `/api/facturacion/${otro.id}/emitir`, { token: sesiones.vera, cuerpo: { numero: 'E001-00000015' } })).estado, 409);
    const vuelta = await llamar('POST', `/api/facturacion/${otro.id}/borrador`, { token: sesiones.vera, cuerpo: {} });
    assert.equal(vuelta.datos.estado, 'borrador');
    assert.equal((await llamar('DELETE', `/api/facturacion/${otro.id}`, { token: sesiones.vera })).estado, 200);
    assert.equal((await llamar('DELETE', `/api/facturacion/${c.id}`, { token: sesiones.vera })).estado, 409); // emitido no se borra
  });
  it('adjunta el PDF y el XML de SUNAT en una carpeta privada', async () => {
    assert.equal((await llamar('POST', `/api/facturacion/${c.id}/archivo?tipo=pdf`, { token: sesiones.vera, crudo: Buffer.from('no soy un pdf, de verdad') })).estado, 400);
    const pdf = Buffer.from('%PDF-1.4\n% comprobante de prueba\n%%EOF');
    const r = await llamar('POST', `/api/facturacion/${c.id}/archivo?tipo=pdf`, { token: sesiones.vera, crudo: pdf, tipo: 'application/pdf' });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.tiene_pdf, true);
    assert.equal((await llamar('POST', `/api/facturacion/${c.id}/archivo?tipo=xml`, { token: sesiones.vera, crudo: Buffer.from('<?xml version="1.0"?><Invoice/>'), tipo: 'application/xml' })).datos.tiene_xml, true);
    const sin = await fetch(`${base}/api/facturacion/${c.id}/archivo/pdf`);
    assert.equal(sin.status, 401);
    const con = await fetch(`${base}/api/facturacion/${c.id}/archivo/pdf`, { headers: { authorization: `Bearer ${sesiones.fina}` } });
    assert.equal(con.status, 200);
    assert.match(con.headers.get('content-disposition'), /E001-00000015\.pdf/);
    assert.deepEqual(Buffer.from(await con.arrayBuffer()), pdf);
    const listado = readdirSync(join(process.env.UPLOAD_DIR, 'privado', 'comprobantes'));
    assert.equal(listado.length, 2);
    assert.equal((await fetch(`${base}/uploads/privado/comprobantes/${listado[0]}`)).status, 404);
  });
  it('anular pide motivo y queda en la auditoría', async () => {
    assert.equal((await llamar('POST', `/api/facturacion/${c.id}/anular`, { token: sesiones.vera, cuerpo: { motivo: ' ' } })).estado, 400);
    const r = await llamar('POST', `/api/facturacion/${c.id}/anular`, { token: sesiones.vera, cuerpo: { motivo: 'RUC del cliente incorrecto' } });
    assert.equal(r.datos.estado, 'anulado');
    assert.equal(r.datos.motivo_anulacion, 'RUC del cliente incorrecto');
    const { rows } = await pool.query("SELECT accion, detalle FROM audit_log WHERE entidad = 'comprobante' AND entidad_id = $1 ORDER BY id", [String(c.id)]);
    assert.deepEqual(rows.map((x) => x.detalle).filter(Boolean), ['borrador → enviado', 'enviado → emitido · E001-00000015', 'PDF de SUNAT · E001-00000015', 'XML de SUNAT · E001-00000015', 'emitido → anulado · E001-00000015']);
    const l = (await llamar('GET', '/api/facturacion', { token: sesiones.fina })).datos;
    assert.equal(l.resumen.por_estado.anulado, 1);
  });
});

describe('desde una cotización y padrón', () => {
  let cot;
  it('propone un hito en una línea (precio con IGV → valor sin IGV)', async () => {
    cot = (await llamar('POST', '/api/ventas/cotizaciones', { token: sesiones.vera, cuerpo: {
      cliente: 'Lácteos del Sur S.A.C.', ruc_dni: RUC, direccion: 'Characato', sistema: 'Sistema On-Grid 50 kW Huawei', descuento: '200',
      items: [{ descripcion: 'Inversor', cantidad: '1', precio_unitario: '30000', unidad: 'Unidades', producto_id: null }, { descripcion: 'Instalación', cantidad: '1', precio_unitario: '50000' }],
    } })).datos;
    assert.equal(cot.totales.total, '79800.00');
    const r = await llamar('GET', `/api/facturacion/desde-cotizacion/${cot.id}?modo=resumen&porcentaje=50`, { token: sesiones.vera });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.tipo, 'factura');
    assert.equal(r.datos.cliente_doc, RUC);
    assert.equal(r.datos.items.length, 1);
    assert.match(r.datos.items[0].descripcion, /Sistema On-Grid 50 kW Huawei – 50% \(cotización /);
    assert.equal(r.datos.items[0].valor_unitario, '33813.5593');
    assert.deepEqual(r.datos.totales, { op_gravada: '33813.56', igv: '6086.44', total: '39900.00' });
    assert.equal(r.datos.diferencia, '0.00');
  });
  it('o el detalle, repartiendo el descuento comercial', async () => {
    const r = (await llamar('GET', `/api/facturacion/desde-cotizacion/${cot.id}?modo=detalle`, { token: sesiones.vera })).datos;
    assert.deepEqual(r.items.map((i) => i.unidad), ['NIU', 'ZZ']);
    assert.equal(r.objetivo, '79800.00');
    assert.ok(Math.abs(Number(r.diferencia)) <= 0.02, r.diferencia);
  });
  it('padrón sin proveedor: usa lo último registrado en el ERP', async () => {
    const r = (await llamar('GET', `/api/facturacion/padron/${RUC}`, { token: sesiones.vera })).datos;
    assert.equal(r.configurado, false);
    assert.equal(r.fuente, 'historial');
    assert.ok(['Granja Avícola Tiabaya S.A.C.', 'Lácteos del Sur S.A.C.'].includes(r.nombre));
    assert.equal((await llamar('GET', '/api/facturacion/padron/43218765', { token: sesiones.vera })).datos.encontrado, false);
    assert.equal((await llamar('GET', '/api/facturacion/padron/123', { token: sesiones.vera })).estado, 400);
  });
});
