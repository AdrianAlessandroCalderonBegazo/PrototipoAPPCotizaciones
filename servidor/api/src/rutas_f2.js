// Rutas del ERP · Fase 2: proyectos y contabilidad. Cada ruta exige su nivel en la matriz de permisos.
import { Router } from 'express';
import { auditar } from './auditoria.js';
import {
  CATEGORIAS, anularMovimiento, cajaChica, crearCuenta, editarCuenta, enviarFondos, listarCuentas, listarMovimientos, registrarMovimiento, resumen,
} from './contabilidad.js';
import { falla } from './errores.js';
import { nivel, tieneNivel } from './permisos.js';
import {
  CAUSAS_PAUSA, agregarFotos, cambiarEstado, crearProyecto, detalleProyecto, editarProyecto, listarProyectos, proyectosActivos, quitarFoto,
} from './proyectos.js';

export function crearRutasF2() {
  const r = Router();

  // ---- proyectos ----
  r.get('/proyectos', nivel('proyectos', 'lectura'), async (req, res) => res.json({ ...(await listarProyectos(req.query)), causas_pausa: CAUSAS_PAUSA }));
  // Lista para elegir proyecto al registrar un gasto (Contabilidad, Finanzas).
  r.get('/proyectos/activos', async (req, res) => {
    const ok = (await tieneNivel(req.usuario, 'proyectos')) || (await tieneNivel(req.usuario, 'contabilidad')) || (await tieneNivel(req.usuario, 'caja_chica'));
    if (!ok) throw falla(403, 'Tu rol no permite ver los proyectos.');
    res.json(await proyectosActivos());
  });
  r.get('/proyectos/:id', nivel('proyectos', 'lectura'), async (req, res) => res.json({ ...(await detalleProyecto(req.params.id)), causas_pausa: CAUSAS_PAUSA }));
  r.post('/proyectos', nivel('proyectos', 'completo', 'crear proyectos'), async (req, res) => {
    const p = await crearProyecto(req.body, req.usuario);
    await auditar(req, { accion: 'crear', entidad: 'proyecto', entidadId: p.id, despues: p });
    res.status(201).json(p);
  });
  r.put('/proyectos/:id', nivel('proyectos', 'completo', 'editar proyectos'), async (req, res) => {
    const { antes, despues } = await editarProyecto(req.params.id, req.body);
    if (antes !== despues) await auditar(req, { accion: 'editar', entidad: 'proyecto', entidadId: despues.id, antes, despues });
    res.json(despues);
  });
  r.post('/proyectos/:id/estado', nivel('proyectos', 'completo', 'cambiar el estado de un proyecto'), async (req, res) => {
    const { antes, despues } = await cambiarEstado(req.params.id, req.body, req.usuario);
    await auditar(req, { accion: 'cambiar_estado', entidad: 'proyecto', entidadId: despues.id, antes, despues, detalle: `${antes.estado} → ${despues.estado}` });
    res.json(despues);
  });
  r.post('/proyectos/:id/fotos', nivel('proyectos', 'completo', 'subir fotos'), async (req, res) => {
    const fotos = await agregarFotos(req.params.id, req.body?.fotos, req.usuario);
    await auditar(req, { accion: 'subir_fotos', entidad: 'proyecto', entidadId: req.params.id, despues: fotos, detalle: `${fotos.length} foto(s)` });
    res.status(201).json(fotos);
  });
  r.delete('/proyectos/:id/fotos/:foto', nivel('proyectos', 'completo', 'quitar fotos'), async (req, res) => {
    const f = await quitarFoto(req.params.id, req.params.foto);
    await auditar(req, { accion: 'eliminar', entidad: 'proyecto_foto', entidadId: f.id, antes: f });
    res.json({ ok: true });
  });

  // ---- contabilidad ----
  r.get('/contabilidad/categorias', nivel('contabilidad', 'lectura'), (_req, res) => res.json(CATEGORIAS));
  r.get('/contabilidad/resumen', nivel('contabilidad', 'lectura'), async (req, res) => res.json(await resumen(req.query)));
  r.get('/contabilidad/cuentas', nivel('contabilidad', 'lectura'), async (_req, res) => res.json(await listarCuentas()));
  r.post('/contabilidad/cuentas', nivel('contabilidad', 'completo', 'crear cuentas'), async (req, res) => {
    const k = await crearCuenta(req.body);
    await auditar(req, { accion: 'crear', entidad: 'cuenta', entidadId: k.id, despues: k });
    res.status(201).json(k);
  });
  r.put('/contabilidad/cuentas/:id', nivel('contabilidad', 'completo', 'cambiar cuentas'), async (req, res) => {
    const { antes, despues } = await editarCuenta(req.params.id, req.body);
    await auditar(req, { accion: 'editar', entidad: 'cuenta', entidadId: despues.id, antes, despues });
    res.json(despues);
  });
  r.get('/contabilidad/movimientos', nivel('contabilidad', 'lectura'), async (req, res) => res.json(await listarMovimientos(req.query)));
  r.post('/contabilidad/movimientos', nivel('contabilidad', 'completo', 'registrar movimientos'), async (req, res) => {
    res.status(201).json(await registrarMovimiento(req.body, req.usuario, req));
  });
  r.post('/contabilidad/movimientos/:id/anular', nivel('contabilidad', 'completo', 'anular movimientos'), async (req, res) => {
    res.json(await anularMovimiento(req.params.id, req.body, req.usuario, req));
  });
  r.get('/contabilidad/caja-chica', nivel('contabilidad', 'lectura'), async (req, res) => res.json(await cajaChica(req.query)));
  r.post('/contabilidad/envios', nivel('contabilidad', 'completo', 'enviar fondos a caja chica'), async (req, res) => {
    res.status(201).json(await enviarFondos(req.body, req.usuario, req));
  });

  return r;
}
