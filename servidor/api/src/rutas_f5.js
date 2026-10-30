// Rutas del ERP · Fase 5: Facturación SUNAT. Lectura: ver comprobantes y descargar sus archivos.
// Completo: preparar, enviar a SUNAT (abrir con la extensión), marcar emitido, anular y adjuntar el PDF/XML de SUNAT.
import express, { Router } from 'express';
import { join } from 'node:path';
import { auditar } from './auditoria.js';
import { falla } from './errores.js';
import {
  ESTADOS, TIPOS, UNIDADES, anular, consultarPadron, crearComprobante, editarComprobante, eliminarBorrador, enviar, guardarArchivo, leerArchivo,
  listarComprobantes, marcarEmitido, obtenerComprobante, propuestaDesdeCotizacion, validaciones, volverABorrador,
} from './facturacion.js';
import { leerParametros } from './configuracion.js';
import { nivel, tieneNivel } from './permisos.js';
import { carpetaSubidas } from './rutas.js';

const carpeta = () => join(carpetaSubidas, 'privado', 'comprobantes');
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, 'El id no es válido.');
  return n;
};
const resumen = (c) => ({ tipo: c.tipo, estado: c.estado, numero: c.numero, cliente: c.cliente_nombre, doc: c.cliente_doc, totales: c.totales });

export function crearRutasF5() {
  const r = Router();
  const lectura = nivel('facturacion', 'lectura');
  const completo = (accion) => nivel('facturacion', 'completo', accion);

  r.get('/facturacion', lectura, async (_req, res) => res.json({ ...(await listarComprobantes()), tipos: TIPOS, estados: ESTADOS, unidades: UNIDADES }));
  r.get('/facturacion/padron/:doc', completo('consultar el padrón'), async (req, res) => res.json(await consultarPadron(req.params.doc)));
  r.get('/facturacion/desde-cotizacion/:id', completo('preparar comprobantes'), async (req, res) => {
    if (!(await tieneNivel(req.usuario, 'cotizacion', 'lectura'))) throw falla(403, 'Tu rol no puede ver cotizaciones.');
    res.json(await propuestaDesdeCotizacion(id(req.params.id), req.query));
  });
  r.get('/facturacion/:id', lectura, async (req, res) => {
    const c = await obtenerComprobante(id(req.params.id));
    res.json({ ...c, validaciones: validaciones(c, (await leerParametros()).tipo_cambio?.valor ?? null) });
  });
  r.post('/facturacion', completo('preparar comprobantes'), async (req, res) => {
    const c = await crearComprobante(req.body, req.usuario);
    await auditar(req, { accion: 'crear', entidad: 'comprobante', entidadId: c.id, despues: resumen(c) });
    res.status(201).json(c);
  });
  r.put('/facturacion/:id', completo('editar comprobantes'), async (req, res) => {
    const { antes, despues } = await editarComprobante(id(req.params.id), req.body, req.usuario);
    await auditar(req, { accion: 'editar', entidad: 'comprobante', entidadId: despues.id, antes: resumen(antes), despues: resumen(despues) });
    res.json(despues);
  });
  r.delete('/facturacion/:id', completo('eliminar borradores'), async (req, res) => {
    const antes = await eliminarBorrador(id(req.params.id));
    await auditar(req, { accion: 'eliminar', entidad: 'comprobante', entidadId: antes.id, antes: resumen(antes) });
    res.json({ ok: true });
  });
  const estado = (ruta, fn, accion, detalle) =>
    r.post(`/facturacion/:id/${ruta}`, completo(accion), async (req, res) => {
      const { antes, despues } = await fn(id(req.params.id), req.body, req.usuario);
      await auditar(req, { accion: 'cambiar_estado', entidad: 'comprobante', entidadId: despues.id, antes: resumen(antes), despues: { ...resumen(despues), motivo: despues.motivo_anulacion ?? undefined }, detalle: detalle(antes, despues) });
      res.json(despues);
    });
  estado('enviar', enviar, 'enviar comprobantes a SUNAT', () => 'borrador → enviado');
  estado('borrador', volverABorrador, 'editar comprobantes', () => 'enviado → borrador');
  estado('emitir', marcarEmitido, 'registrar comprobantes emitidos', (_a, d) => `enviado → emitido · ${d.numero}`);
  estado('anular', anular, 'anular comprobantes', (_a, d) => `emitido → anulado · ${d.numero}`);

  r.post('/facturacion/:id/archivo', completo('adjuntar archivos de SUNAT'), express.raw({ type: () => true, limit: '8mb' }), async (req, res) => {
    const tipo = String(req.query.tipo ?? '');
    const c = await guardarArchivo(id(req.params.id), tipo, req.body, carpeta(), req.usuario);
    await auditar(req, { accion: 'adjuntar', entidad: 'comprobante', entidadId: c.id, detalle: `${tipo.toUpperCase()} de SUNAT · ${c.numero ?? 'sin número'}` });
    res.json(c);
  });
  r.get('/facturacion/:id/archivo/:tipo', lectura, async (req, res) => {
    const { bytes, nombre } = await leerArchivo(id(req.params.id), req.params.tipo, carpeta());
    res.set({ 'Content-Type': req.params.tipo === 'pdf' ? 'application/pdf' : 'application/xml', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' });
    res.send(bytes);
  });

  return r;
}
