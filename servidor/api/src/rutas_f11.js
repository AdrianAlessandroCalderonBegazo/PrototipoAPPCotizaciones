// Rutas · Fase 11: Caja ICR (la usa la app de Finanzas; el ERP la consulta). Permiso «caja_chica» (en pantalla: «Caja ICR»):
// lectura = ver saldos, historial, fotos y reportes; completo = registrar, corregir y anular. Contabilidad (lectura) también la ve.
import { join } from 'node:path';
import express, { Router } from 'express';
import { anular, editar, leerAdjunto, listar, movimiento, registrar, reportes, resumen, subirAdjunto } from './cajaicr.js';
import { falla } from './errores.js';
import { tieneNivel } from './permisos.js';
import { carpetaSubidas } from './rutas.js';

const carpeta = () => join(carpetaSubidas, 'privado', 'caja-icr');

async function ve(req, _res, next) {
  if ((await tieneNivel(req.usuario, 'caja_chica')) || (await tieneNivel(req.usuario, 'contabilidad'))) return next();
  throw falla(403, 'Tu rol no tiene acceso a la Caja ICR.');
}
async function registra(req, _res, next) {
  if (await tieneNivel(req.usuario, 'caja_chica', 'completo')) return next();
  throw falla(403, 'Tu rol puede ver la Caja ICR, pero no registrar ni corregir.');
}

export function crearRutasF11() {
  const r = Router();
  r.get('/caja-icr/resumen', ve, async (_req, res) => res.json(await resumen()));
  r.get('/caja-icr/movimientos', ve, async (req, res) => res.json(await listar(req.query)));
  r.get('/caja-icr/movimientos/:id', ve, async (req, res) => res.json(await movimiento(req.params.id)));
  r.post('/caja-icr/movimientos', registra, async (req, res) => {
    const x = await registrar(req.body, req.usuario, req);
    res.status(x.repetido ? 200 : 201).json(x);
  });
  r.put('/caja-icr/movimientos/:id', registra, async (req, res) => res.json(await editar(req.params.id, req.body, req.usuario, req)));
  r.post('/caja-icr/movimientos/:id/anular', registra, async (req, res) => res.json(await anular(req.params.id, req.body, req.usuario, req)));
  r.post('/caja-icr/movimientos/:id/fotos', registra, express.raw({ type: () => true, limit: '8mb' }), async (req, res) =>
    res.status(201).json(await subirAdjunto(req.params.id, req.query.ext, req.body, carpeta(), req.usuario, req)));
  r.get('/caja-icr/fotos/:id', ve, async (req, res) => {
    const f = await leerAdjunto(req.params.id, carpeta());
    res.set('Content-Type', f.mime).set('Cache-Control', 'private, max-age=86400').send(f.bytes);
  });
  r.get('/caja-icr/reportes', ve, async (req, res) => res.json(await reportes(req.query)));
  return r;
}
