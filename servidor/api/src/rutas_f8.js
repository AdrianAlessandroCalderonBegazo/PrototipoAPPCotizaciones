// Rutas del ERP · Fase 8: Comparador de proveedores. Lectura: buscar, comparar y ver historial. Completo: proveedores, listas y páginas web.
import { Router } from 'express';
import { auditar } from './auditoria.js';
import {
  CAMPOS_LISTA, buscar, cargasDe, crearProveedor, decidirEquivalencia, detalleProducto, editarProveedor, guardarFuenteWeb, importarLista, listarProveedores, mapeoArchivo,
  programarIndiceProveedores, reindexarProveedores,
} from './comparador.js';
import { ejecucionesDe, ejecutarFuente } from './comparador_web.js';
import { consulta } from './db.js';
import { falla } from './errores.js';
import { nivel } from './permisos.js';

const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, 'El id no es válido.');
  return n;
};

export function crearRutasF8() {
  const r = Router();
  const lectura = nivel('comparador', 'lectura');
  const completo = (accion) => nivel('comparador', 'completo', accion);

  r.get('/comparador/buscar', lectura, async (req, res) => res.json(await buscar(req.query)));
  r.get('/comparador/productos/:id', lectura, async (req, res) => res.json(await detalleProducto(id(req.params.id))));
  r.post('/comparador/equivalencias', completo('decidir equivalencias'), async (req, res) => {
    const d = await decidirEquivalencia(req.body, req.usuario);
    await auditar(req, { accion: 'decidir', entidad: 'equivalencia', entidadId: `${d.a_id}-${d.b_id}`, despues: d });
    res.json(d);
  });

  r.get('/comparador/proveedores', lectura, async (_req, res) => res.json({ proveedores: await listarProveedores(), campos: CAMPOS_LISTA }));
  r.post('/comparador/proveedores', completo('registrar proveedores'), async (req, res) => {
    const p = await crearProveedor(req.body);
    await auditar(req, { accion: 'crear', entidad: 'proveedor', entidadId: p.id, despues: p });
    res.status(201).json(p);
  });
  r.put('/comparador/proveedores/:id', completo('editar proveedores'), async (req, res) => {
    const { antes, despues } = await editarProveedor(id(req.params.id), req.body);
    await auditar(req, { accion: req.body?.activo === undefined ? 'editar' : 'cambiar_estado', entidad: 'proveedor', entidadId: despues.id, antes, despues });
    res.json(despues);
  });
  r.get('/comparador/proveedores/:id/cargas', lectura, async (req, res) => res.json(await cargasDe(id(req.params.id))));
  r.get('/comparador/proveedores/:id/mapeo', lectura, async (req, res) => res.json(await mapeoArchivo(id(req.params.id))));

  // ---- listas (archivo) ----
  r.post('/comparador/importar', completo('cargar listas de precios'), async (req, res) => {
    const r2 = await importarLista(req.body, req.usuario);
    if (r2.confirmado) {
      await auditar(req, { accion: 'importar', entidad: 'lista_proveedor', entidadId: r2.carga_id, despues: r2.resumen, detalle: String(req.body?.archivo ?? '').slice(0, 200) });
      programarIndiceProveedores();
    }
    res.json(r2);
  });

  // ---- páginas web ----
  r.post('/comparador/proveedores/:id/fuentes', completo('configurar páginas de proveedores'), async (req, res) => {
    const pid = id(req.params.id);
    const fid = await guardarFuenteWeb(pid, req.body);
    await auditar(req, { accion: 'crear', entidad: 'fuente_web', entidadId: fid, despues: { proveedor_id: pid, url: req.body?.url, adaptador: req.body?.adaptador, frecuencia_dias: req.body?.frecuencia_dias } });
    res.status(201).json({ id: fid });
  });
  r.put('/comparador/fuentes/:id', completo('configurar páginas de proveedores'), async (req, res) => {
    const fid = id(req.params.id);
    const { rows } = await consulta("SELECT proveedor_id FROM proveedor_fuentes WHERE id = $1 AND tipo = 'web'", [fid]);
    if (!rows[0]) throw falla(404, 'No existe esa fuente web.');
    await guardarFuenteWeb(rows[0].proveedor_id, req.body, fid);
    await auditar(req, { accion: 'editar', entidad: 'fuente_web', entidadId: fid, despues: req.body });
    res.json({ id: fid });
  });
  r.post('/comparador/fuentes/:id/leer', completo('leer páginas de proveedores'), async (req, res) => {
    const r2 = await ejecutarFuente(id(req.params.id), req.usuario);
    await auditar(req, { accion: 'leer_web', entidad: 'fuente_web', entidadId: req.params.id, despues: r2 });
    res.json(r2);
  });
  r.get('/comparador/fuentes/:id/ejecuciones', lectura, async (req, res) => res.json(await ejecucionesDe(id(req.params.id))));
  r.post('/comparador/reindexar', completo('actualizar el índice'), async (_req, res) => res.json(await reindexarProveedores()));
  return r;
}
