// Rutas del ERP · Fase 1 (base): permisos, auditoría, datos de la empresa, parámetros, numeración e integraciones.
// Todas piden sesión (se montan después de exigirSesion). Lo que cambia algo queda en la auditoría.
import { Router } from 'express';
import { exigirRol } from './auth.js';
import { auditar, listarAuditoria } from './auditoria.js';
import {
  estadoIntegraciones, guardarEmpresa, guardarNumeracion, guardarParametros, leerEmpresa, leerNumeracion, leerParametros, probarIntegracion,
} from './configuracion.js';
import { MODULOS, NIVELES, ROLES, ROL_ETIQUETA, exigirNivel, guardarMatriz, matriz, nivel } from './permisos.js';

export function crearRutasErp() {
  const r = Router();

  // ---- permisos ----
  r.get('/permisos/catalogo', (_req, res) => {
    res.json({ roles: ROLES.map((clave) => ({ clave, nombre: ROL_ETIQUETA[clave] })), niveles: NIVELES, modulos: MODULOS });
  });
  r.get('/permisos/matriz', nivel('configuracion', 'lectura'), async (_req, res) => res.json(await matriz({ fresca: true })));
  r.put('/permisos/matriz', async (req, res) => {
    // Solo un administrador cambia la matriz (si no, alguien podría darse más permisos a sí mismo).
    exigirRol(req.usuario, 'cambiar la matriz de permisos');
    const { antes, despues } = await guardarMatriz(req.body?.matriz, req.usuario.nombre);
    await auditar(req, { accion: 'editar', entidad: 'permisos', antes, despues });
    res.json(despues);
  });

  // ---- auditoría ----
  r.get('/auditoria', nivel('configuracion', 'lectura'), async (req, res) => res.json(await listarAuditoria(req.query)));

  // ---- empresa (la leen todos: va en los PDF) ----
  r.get('/empresa', async (_req, res) => res.json(await leerEmpresa()));
  r.put('/empresa', nivel('configuracion', 'completo'), async (req, res) => {
    const { antes, despues } = await guardarEmpresa(req.body);
    await auditar(req, { accion: 'editar', entidad: 'empresa', antes, despues });
    res.json(despues);
  });

  // ---- parámetros (los leen todos: el tipo de cambio se muestra arriba) ----
  r.get('/parametros', async (_req, res) => res.json(await leerParametros()));
  r.put('/parametros', nivel('configuracion', 'completo'), async (req, res) => {
    const { antes, despues } = await guardarParametros(req.body);
    await auditar(req, { accion: 'editar', entidad: 'parametros', antes, despues });
    res.json(despues);
  });

  // ---- numeración de cotizaciones ----
  r.get('/numeracion/cotizacion', async (req, res) => {
    if (req.usuario.rol !== 'admin') {
      try {
        await exigirNivel(req.usuario, 'cotizacion', 'lectura');
      } catch {
        await exigirNivel(req.usuario, 'configuracion', 'lectura', 'ver la numeración');
      }
    }
    res.json(await leerNumeracion());
  });
  r.put('/numeracion/cotizacion', nivel('configuracion', 'completo'), async (req, res) => {
    const { antes, despues } = await guardarNumeracion(req.body);
    await auditar(req, { accion: 'editar', entidad: 'numeracion_cotizacion', antes, despues });
    res.json(despues);
  });

  // ---- integraciones ----
  r.get('/integraciones', nivel('configuracion', 'lectura'), async (_req, res) => res.json(await estadoIntegraciones()));
  r.post('/integraciones/:clave/probar', nivel('configuracion', 'lectura'), async (req, res) => res.json(await probarIntegracion(req.params.clave)));

  return r;
}
