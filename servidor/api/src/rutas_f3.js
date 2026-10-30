// Rutas del ERP · Fase 3: Cotización (catálogo, importar CSV, imágenes, kits y cotizaciones con PDF).
// Lectura: ver catálogo, kits y cotizaciones. Completo: crear y editar. Eliminar una cotización: solo admin (ruta de siempre).
import { Router } from 'express';
import { auditar } from './auditoria.js';
import { CAMPOS_CSV, asignarImagenes, crearProducto, editarProducto, importarCsv, listarCatalogo, productoDe, productoPorId, verificarImagenes } from './catalogo.js';
import { falla } from './errores.js';
import { programarReindexado } from './ia/indice.js';
import { crearKit, detalleKit, editarKit, eliminarKit, listarKits, varianteKit } from './kits.js';
import { pdfCotizacion } from './pdf.js';
import { nivel, tieneNivel } from './permisos.js';
import { ESTADOS, cambiarEstado, crearCotizacion, editarCotizacion, listarCotizaciones, obtenerCotizacion } from './ventas.js';

const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, 'El id no es válido.');
  return n;
};

export function crearRutasF3() {
  const r = Router();
  const lectura = nivel('cotizacion', 'lectura');
  const completo = (accion) => nivel('cotizacion', 'completo', accion);

  // ---- catálogo ----
  r.get('/catalogo', lectura, async (req, res) => res.json({ productos: await listarCatalogo(await tieneNivel(req.usuario, 'cotizacion', 'completo')), campos_csv: CAMPOS_CSV }));
  r.post('/catalogo', completo('agregar productos'), async (req, res) => {
    const p = await crearProducto(req.body);
    await auditar(req, { accion: 'crear', entidad: 'producto', entidadId: p.id, despues: p });
    programarReindexado();
    res.status(201).json(productoDe(p, true));
  });
  r.put('/catalogo/:id', completo('editar productos'), async (req, res) => {
    const { antes, despues } = await editarProducto(id(req.params.id), req.body);
    if (antes !== despues) await auditar(req, { accion: 'editar', entidad: 'producto', entidadId: despues.id, antes, despues });
    programarReindexado();
    res.json(productoDe(despues, true));
  });
  r.get('/catalogo/:id', lectura, async (req, res) => res.json(await productoPorId(id(req.params.id), await tieneNivel(req.usuario, 'cotizacion', 'completo'))));
  r.post('/catalogo/importar', completo('importar listas de precios'), async (req, res) => {
    const confirmar = req.body?.confirmar === true;
    const r2 = await importarCsv(req.body?.filas, { confirmar });
    if (confirmar) {
      await auditar(req, { accion: 'importar', entidad: 'catalogo', despues: r2.resumen, detalle: String(req.body?.archivo ?? '').slice(0, 200) || null });
      programarReindexado();
    }
    res.json(r2);
  });
  r.post('/catalogo/imagenes/verificar', completo('cargar imágenes'), async (req, res) => res.json(await verificarImagenes(req.body?.nombres)));
  r.post('/catalogo/imagenes', completo('cargar imágenes'), async (req, res) => {
    const r2 = await asignarImagenes(req.body?.asignaciones);
    await auditar(req, { accion: 'asignar_imagenes', entidad: 'catalogo', despues: r2 });
    res.json(r2);
  });

  // ---- kits ----
  r.get('/kits', lectura, async (_req, res) => res.json(await listarKits()));
  r.get('/kits/:id', lectura, async (req, res) => res.json(await detalleKit(id(req.params.id))));
  r.post('/kits', completo('crear kits'), async (req, res) => {
    const k = await crearKit(req.body, req.usuario);
    await auditar(req, { accion: 'crear', entidad: 'kit', entidadId: k.id, despues: k });
    res.status(201).json(k);
  });
  r.put('/kits/:id', completo('editar kits'), async (req, res) => {
    const { antes, despues } = await editarKit(id(req.params.id), req.body);
    await auditar(req, { accion: 'editar', entidad: 'kit', entidadId: despues.id, antes, despues });
    res.json(despues);
  });
  r.post('/kits/:id/variante', completo('crear kits'), async (req, res) => {
    const k = await varianteKit(id(req.params.id), req.body, req.usuario);
    await auditar(req, { accion: 'crear', entidad: 'kit', entidadId: k.id, despues: k, detalle: `Variante del kit ${req.params.id}` });
    res.status(201).json(k);
  });
  r.delete('/kits/:id', completo('eliminar kits'), async (req, res) => {
    const antes = await eliminarKit(id(req.params.id));
    await auditar(req, { accion: 'eliminar', entidad: 'kit', entidadId: antes.id, antes });
    res.json({ ok: true });
  });

  // ---- cotizaciones del ERP ----
  r.get('/ventas/cotizaciones', lectura, async (_req, res) => res.json({ cotizaciones: await listarCotizaciones(), estados: ESTADOS }));
  r.get('/ventas/cotizaciones/:id', lectura, async (req, res) => res.json(await obtenerCotizacion(id(req.params.id))));
  r.post('/ventas/cotizaciones', completo('crear cotizaciones'), async (req, res) => {
    const c = await crearCotizacion(req.body, req.usuario);
    await auditar(req, { accion: 'crear', entidad: 'cotizacion', entidadId: c.id, despues: { numero: c.numero, cliente: c.cliente, totales: c.totales } });
    res.status(201).json(c);
  });
  r.put('/ventas/cotizaciones/:id', completo('editar cotizaciones'), async (req, res) => {
    const { antes, despues } = await editarCotizacion(id(req.params.id), req.body, req.usuario);
    await auditar(req, { accion: 'editar', entidad: 'cotizacion', entidadId: despues.id, antes: { cliente: antes.cliente, totales: antes.totales, items: antes.items.length }, despues: { cliente: despues.cliente, totales: despues.totales, items: despues.items.length } });
    res.json(despues);
  });
  r.post('/ventas/cotizaciones/:id/estado', completo('cambiar el estado de una cotización'), async (req, res) => {
    const { antes, despues } = await cambiarEstado(id(req.params.id), req.body, req.usuario);
    await auditar(req, { accion: 'cambiar_estado', entidad: 'cotizacion', entidadId: despues.id, antes: { estado: antes.estado }, despues: { estado: despues.estado, motivo: despues.motivo_rechazo }, detalle: `${antes.estado ?? 'sin estado'} → ${despues.estado}` });
    res.json(despues);
  });
  r.get('/ventas/cotizaciones/:id/pdf', lectura, async (req, res) => {
    const c = await obtenerCotizacion(id(req.params.id));
    const pdf = await pdfCotizacion(c);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${c.numero}.pdf"`, 'Cache-Control': 'no-store' });
    res.send(pdf);
  });

  return r;
}
