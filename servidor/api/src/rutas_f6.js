// Rutas del ERP · Fase 6: Inteligencia artificial (Cotizador IA y Asistente IA).
// Ver conversaciones: lectura del módulo. Preguntar, borrar consultas y editar el contexto: completo. La IA nunca escribe datos del negocio.
import { Router } from 'express';
import { auditar } from './auditoria.js';
import { falla } from './errores.js';
import { cotizarGuiada, eliminarConversaciones, listarConversaciones, obtenerConversacion, preguntar, propuesta } from './ia/agente.js';
import { opcionesGuiada } from './ia/guiada.js';
import { guardarConfigIa, guardarContexto, leerConfigIa, leerContexto } from './ia/config.js';
import { estadoIndice, reindexar } from './ia/indice.js';
import { salud } from './ia/ollama.js';
import { leerParametros } from './configuracion.js';
import { nivel, tieneNivel } from './permisos.js';

// Permiso que exige cada IA. La de Finanzas la usa todo el que entra a la caja (basta «lectura»): solo lee.
const MODULO = { cotizador: 'cotizador_ia', asistente: 'asistente_ia', finanzas: 'caja_chica' };
const NIVEL_PREGUNTAR = { cotizador: 'completo', asistente: 'completo', finanzas: 'lectura' };
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw falla(400, 'El id no es válido.');
  return n;
};
/** :modulo de la ruta → clave de permisos, exigiendo el nivel pedido. */
async function exigir(req, minimo, accion) {
  const m = MODULO[req.params.modulo];
  if (!m) throw falla(404, 'No existe ese módulo de IA.');
  if (!(await tieneNivel(req.usuario, m, minimo))) throw falla(403, `Tu rol no puede ${accion}.`);
  return req.params.modulo;
}

export function crearRutasF6() {
  const r = Router();

  r.get('/ia/estado', async (req, res) => {
    const ve = (await tieneNivel(req.usuario, 'cotizador_ia')) || (await tieneNivel(req.usuario, 'asistente_ia')) || (await tieneNivel(req.usuario, 'caja_chica')) || (await tieneNivel(req.usuario, 'configuracion'));
    if (!ve) throw falla(403, 'Tu rol no usa la IA.');
    res.json({ ...(await salud()), indice: await estadoIndice() });
  });
  r.get('/ia/config', nivel('configuracion', 'lectura'), async (_req, res) => res.json(await leerConfigIa()));
  r.put('/ia/config', nivel('configuracion', 'completo', 'cambiar el modelo de IA'), async (req, res) => {
    const { antes, despues } = await guardarConfigIa(req.body);
    await auditar(req, { accion: 'editar', entidad: 'ia_config', antes, despues });
    res.json(despues);
  });
  r.post('/ia/reindexar', async (req, res) => {
    if (!(await tieneNivel(req.usuario, 'configuracion', 'completo')) && !(await tieneNivel(req.usuario, 'cotizador_ia', 'completo'))) throw falla(403, 'Tu rol no puede actualizar el índice de la IA.');
    const r2 = await reindexar();
    await auditar(req, { accion: 'reindexar', entidad: 'ia_indice', despues: r2 });
    res.json(r2);
  });

  // ---- contexto del Cotizador IA ----
  r.get('/ia/contexto', nivel('cotizador_ia', 'lectura'), async (_req, res) => {
    const [ctx, idx, par] = await Promise.all([leerContexto(), estadoIndice(), leerParametros()]);
    res.json({ ...ctx, catalogo: idx, tipo_cambio: par.tipo_cambio, igv_pct: 18 });
  });
  r.put('/ia/contexto', nivel('cotizador_ia', 'completo', 'editar el contexto de la IA'), async (req, res) => {
    const { antes, despues } = await guardarContexto(req.body);
    await auditar(req, { accion: 'editar', entidad: 'ia_contexto', antes, despues });
    res.json(despues);
  });
  // ---- cotización guiada (sin IA) ----
  r.get('/ia/cotizador/guiada/opciones', nivel('cotizador_ia', 'lectura'), async (_req, res) => res.json(await opcionesGuiada()));
  r.post('/ia/cotizador/guiada', nivel('cotizador_ia', 'completo', 'hacer cotizaciones guiadas'), async (req, res) => res.status(201).json(await cotizarGuiada(req.body, req.usuario)));
  r.get('/ia/cotizador/propuesta/:mensaje', nivel('cotizacion', 'completo', 'abrir propuestas en Cotización'), async (req, res) => res.json(await propuesta(id(req.params.mensaje))));

  // ---- conversaciones ----
  r.get('/ia/:modulo/conversaciones', async (req, res) => {
    const m = await exigir(req, 'lectura', 'ver estas conversaciones');
    res.json(await listarConversaciones(m, req.usuario, { q: req.query.q, autor: req.query.autor }));
  });
  r.get('/ia/:modulo/conversaciones/:id', async (req, res) => {
    const m = await exigir(req, 'lectura', 'ver estas conversaciones');
    res.json(await obtenerConversacion(id(req.params.id), m, req.usuario));
  });
  r.post('/ia/:modulo/conversaciones/eliminar', async (req, res) => {
    const m = await exigir(req, req.params.modulo === 'cotizador' ? 'completo' : 'lectura', 'eliminar consultas');
    const borradas = await eliminarConversaciones(req.body?.ids, m, req.usuario);
    for (const b of borradas) await auditar(req, { accion: 'eliminar', entidad: `ia_${m}`, entidadId: b.id, antes: b });
    res.json({ eliminadas: borradas.length });
  });

  // Respuesta en streaming (text/event-stream): el texto llega mientras el modelo lo escribe.
  r.post('/ia/:modulo/preguntar', async (req, res) => {
    const m = await exigir(req, NIVEL_PREGUNTAR[req.params.modulo] ?? 'completo', 'hacer consultas a la IA');
    if (!String(req.body?.texto ?? '').trim()) throw falla(400, 'Escribe tu consulta.');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    const ctl = new AbortController();
    res.on('close', () => ctl.abort());
    const enviar = (ev) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    };
    const latido = setInterval(() => !res.writableEnded && res.write(': esperando\n\n'), 15_000);
    try {
      await preguntar({ modulo: m, conversacionId: req.body?.conversacion_id, texto: req.body?.texto, porVoz: req.body?.por_voz === true, u: req.usuario, enviar, senal: ctl.signal });
    } catch (e) {
      enviar({ tipo: 'error', mensaje: e?.message ?? 'No se pudo responder.', motivo: 'error' });
    } finally {
      clearInterval(latido);
      res.end();
    }
  });

  return r;
}
