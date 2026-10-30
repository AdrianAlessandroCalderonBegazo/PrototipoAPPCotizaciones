// Rutas del ERP · Fase 9: Almacén (inventario y kardex) y Activos y control (sistemas instalados, equipos y portal VRM).
// Lectura: consultar. Completo: registrar movimientos, artículos, sistemas y equipos. Todo cambio queda en la auditoría.
import { Router } from 'express';
import {
  agregarEquipo, crearActivo, activo, editarActivo, editarEquipo, listarActivos, quitarEquipo, TIPOS_EQUIPO,
} from './activos.js';
import {
  anularMovimiento, articulosDesdeCatalogo, crearArticulo, editarArticulo, kardex, listarArticulos, listarMovimientos, propuestaRequerimiento, registrarMovimientos,
} from './almacen.js';
import { auditar } from './auditoria.js';
import { consulta } from './db.js';
import { falla } from './errores.js';
import { nivel } from './permisos.js';

const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, 'El id no es válido.');
  return n;
};

export function crearRutasF9() {
  const r = Router();
  const alm = nivel('almacen', 'lectura');
  const almC = (accion) => nivel('almacen', 'completo', accion);
  const act = nivel('activos', 'lectura');
  const actC = (accion) => nivel('activos', 'completo', accion);

  // ---- almacén ----
  r.get('/almacen/articulos', alm, async (req, res) => res.json(await listarArticulos(req.query)));
  r.get('/almacen/articulos/:id', alm, async (req, res) => res.json(await kardex(id(req.params.id))));
  r.post('/almacen/articulos', almC('crear artículos del almacén'), async (req, res) => {
    const a = await crearArticulo(req.body, req.usuario);
    await auditar(req, { accion: 'crear', entidad: 'articulo', entidadId: a.id, despues: a });
    res.status(201).json(a);
  });
  r.put('/almacen/articulos/:id', almC('editar artículos del almacén'), async (req, res) => {
    const { antes, despues } = await editarArticulo(id(req.params.id), req.body);
    await auditar(req, { accion: req.body?.activo === undefined ? 'editar' : 'cambiar_estado', entidad: 'articulo', entidadId: despues.id, antes, despues });
    res.json(despues);
  });
  r.post('/almacen/articulos/desde-catalogo', almC('crear artículos del almacén'), async (req, res) => {
    const x = await articulosDesdeCatalogo(req.body?.productos);
    await auditar(req, { accion: 'crear', entidad: 'articulo', despues: x, detalle: 'desde el catálogo de Cotización' });
    res.status(201).json(x);
  });
  // Lo que se elige al registrar: productos del catálogo, proyectos, proveedores y requerimientos recientes.
  r.get('/almacen/opciones', alm, async (_req, res) => {
    const [productos, proyectos, proveedores, requerimientos] = await Promise.all([
      consulta('SELECT id, codigo_erp AS codigo, nombre, categoria_producto AS categoria, unidad_medida AS unidad FROM productos WHERE NOT eliminado ORDER BY nombre'),
      consulta("SELECT id, nombre, estado FROM proyectos WHERE estado <> 'finalizado' ORDER BY nombre"),
      consulta('SELECT id, nombre FROM proveedores WHERE activo ORDER BY nombre').catch(() => ({ rows: [] })),
      consulta(`SELECT q.id, q.numero, q.obra, q.estado, q.fecha_creacion::text AS fecha,
                       EXISTS (SELECT 1 FROM almacen_movimientos m WHERE m.requerimiento_id = q.id AND m.tipo = 'salida') AS con_salida
                  FROM requerimientos q ORDER BY q.id DESC LIMIT 60`),
    ]);
    res.json({ productos: productos.rows, proyectos: proyectos.rows, proveedores: proveedores.rows, requerimientos: requerimientos.rows });
  });
  r.get('/almacen/movimientos', alm, async (req, res) => res.json(await listarMovimientos(req.query)));
  r.post('/almacen/movimientos', almC('registrar movimientos del almacén'), async (req, res) => {
    const hechos = await registrarMovimientos(req.body, req.usuario);
    await auditar(req, {
      accion: req.body.tipo, entidad: 'almacen_movimiento', entidadId: hechos.map((h) => h.id).join(','), despues: hechos,
      detalle: hechos.map((h) => `${h.articulo}: ${h.delta}`).join(' · ').slice(0, 500),
    });
    res.status(201).json(hechos);
  });
  r.post('/almacen/movimientos/:id/anular', almC('anular movimientos del almacén'), async (req, res) => {
    const h = await anularMovimiento(id(req.params.id), req.body, req.usuario);
    await auditar(req, { accion: 'anular', entidad: 'almacen_movimiento', entidadId: req.params.id, despues: h, detalle: String(req.body?.motivo ?? '').slice(0, 300) });
    res.status(201).json(h);
  });
  r.get('/almacen/requerimientos/:id/salida', alm, async (req, res) => res.json(await propuestaRequerimiento(id(req.params.id))));

  // ---- activos ----
  r.get('/activos', act, async (req, res) => res.json({ ...(await listarActivos(req.query)), tipos: TIPOS_EQUIPO }));
  r.get('/activos/:id', act, async (req, res) => res.json(await activo(id(req.params.id))));
  r.post('/activos', actC('registrar sistemas'), async (req, res) => {
    const a = await crearActivo(req.body);
    await auditar(req, { accion: 'crear', entidad: 'activo', entidadId: a.id, despues: a });
    res.status(201).json(a);
  });
  r.put('/activos/:id', actC('editar sistemas'), async (req, res) => {
    const { antes, despues } = await editarActivo(id(req.params.id), req.body);
    await auditar(req, { accion: req.body?.activo === undefined ? 'editar' : 'cambiar_estado', entidad: 'activo', entidadId: despues.id, antes, despues });
    res.json(despues);
  });
  r.post('/activos/:id/equipos', actC('registrar equipos'), async (req, res) => {
    const e = await agregarEquipo(id(req.params.id), req.body);
    await auditar(req, { accion: 'crear', entidad: 'equipo', entidadId: e.id, despues: e });
    res.status(201).json(e);
  });
  r.put('/activos/equipos/:id', actC('editar equipos'), async (req, res) => {
    const { antes, despues } = await editarEquipo(id(req.params.id), req.body);
    await auditar(req, { accion: 'editar', entidad: 'equipo', entidadId: despues.id, antes, despues });
    res.json(despues);
  });
  r.delete('/activos/equipos/:id', actC('quitar equipos'), async (req, res) => {
    const antes = await quitarEquipo(id(req.params.id));
    await auditar(req, { accion: 'eliminar', entidad: 'equipo', entidadId: antes.id, antes });
    res.json({ ok: true });
  });
  return r;
}
