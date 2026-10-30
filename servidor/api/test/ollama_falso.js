// Ollama falso para las pruebas (y para probar la pantalla sin descargar modelos): responde como el de verdad, en streaming NDJSON,
// con llamadas a herramientas y con un bloque <think> que hay que quitar. Uso suelto:  node test/ollama_falso.js 11434
import { createServer } from 'node:http';

const vector = (texto) => {
  const v = new Array(64).fill(0);
  for (const w of String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % 64] += 1;
  }
  return v;
};

export function iniciarOllamaFalso(puerto = 0, { modelos = ['qwen3:4b', 'bge-m3:latest'] } = {}) {
  const pedidos = [];
  const srv = createServer(async (req, res) => {
    let cuerpo = '';
    for await (const c of req) cuerpo += c;
    const b = cuerpo ? JSON.parse(cuerpo) : {};
    pedidos.push({ ruta: req.url, cuerpo: b });
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: modelos.map((name) => ({ name })) }));
    if (req.url === '/api/embed') return res.end(JSON.stringify({ embeddings: [b.input].flat().map(vector) }));
    if (req.url !== '/api/chat') return res.writeHead(404).end();
    if (!modelos.some((m) => m === b.model || m === `${b.model}:latest`)) return res.writeHead(404).end(JSON.stringify({ error: `model "${b.model}" not found` }));
    const msgs = b.messages;
    const sistema = msgs[0]?.content ?? '';
    const usuario = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '';
    if (/FALLA/.test(usuario)) return res.writeHead(500).end('falla simulada');
    const ultimo = msgs[msgs.length - 1];
    const herramientas = (b.tools ?? []).map((t) => t.function.name);
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const linea = (o) => res.write(`${JSON.stringify({ model: b.model, ...o })}\n`);
    const decir = async (t) => {
      for (let i = 0; i < t.length; i += 7) {
        linea({ message: { role: 'assistant', content: t.slice(i, i + 7) }, done: false });
        await new Promise((ok) => setTimeout(ok, 3));
      }
    };
    const llamar = (name, args) => linea({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] }, done: false });
    if (/Cotizador IA/.test(sistema)) {
      if (ultimo.role === 'user') {
        await decir('<think>pienso en voz baja</think>Busco en el catálogo. ');
        llamar('buscar_productos', { texto: usuario.slice(0, 60) });
      } else if (ultimo.role === 'tool' && ultimo.tool_name === 'buscar_productos') {
        const r = JSON.parse(ultimo.content);
        const p = r.productos?.[0];
        llamar('proponer_cotizacion', { titulo: 'Propuesta de prueba', items: [...(p ? [{ codigo: p.codigo, cantidad: 2 }] : []), { codigo: 'NO-EXISTE-9', cantidad: 1 }, { descripcion: 'Instalación y puesta en marcha', cantidad: 1 }] });
      } else await decir('Propuse dos equipos del catálogo y la instalación; el precio de la instalación lo pone una persona.');
    } else if (/app Finanzas/.test(sistema)) {
      if (/borra|registra/i.test(usuario)) await decir('Solo puedo leer: los gastos se registran o corrigen en Caja diaria o Caja chica.');
      else if (ultimo.role === 'user') {
        const periodo = /semana/i.test(usuario) ? 'semana' : /hoy/i.test(usuario) ? 'hoy' : /mes pasado/i.test(usuario) ? 'mes_anterior' : 'mes';
        const ciudad = /moquegua/i.test(usuario) ? 'MOQ' : /arequipa/i.test(usuario) ? 'AQP' : undefined;
        if (/saldo/i.test(usuario)) llamar('saldos_caja', {});
        else if (/proyecto/i.test(usuario)) llamar('gastos_proyecto_caja', { proyecto: usuario.replace(/^.*proyecto\s+/i, '').replace(/[?¿.]/g, '').trim() });
        else if (/diaria|yape/i.test(usuario)) llamar('caja_diaria', { periodo, ciudad });
        else llamar('gastos_caja_chica', { periodo, ciudad, sin_recibo: /recibo|comprobante/i.test(usuario) || undefined, categoria: /movilidad/i.test(usuario) ? 'movilidad' : undefined });
      } else if (ultimo.role === 'tool') {
        const d = JSON.parse(ultimo.content);
        await decir(d.error ? `No pude consultar eso: ${d.error}`
          : d.total_gastado ? `${d.periodo[0].toUpperCase()}${d.periodo.slice(1)} se gastó **${d.total_gastado}** en ${d.cantidad} gastos (${d.sin_recibo} sin foto del recibo).`
          : d.saldos ? `Saldos: ${d.saldos.map((x) => `${x.ciudad} caja chica ${x.caja_chica}`).join('; ')}.`
          : d.gastado_desde_cajas ? `En ${d.proyecto} se gastó ${d.gastado_desde_cajas} desde las cajas.`
          : d.ingresos_efectivo ? `${d.periodo}: entraron ${d.ingresos_efectivo} en efectivo y por Yape ${d.yape_ingresos}.` : 'Aquí tienes los datos.');
      } else await decir('Listo.');
    } else {
      if (/borra/i.test(usuario)) await decir('No puedo borrar ni cambiar datos: solo leo. Hazlo en el módulo correspondiente.');
      else if (ultimo.role === 'user') {
        const nombre = /factur|venta|comprobante/i.test(usuario) ? 'comprobantes' : /proyecto/i.test(usuario) ? 'proyectos' : 'resumen_finanzas';
        llamar(nombre, {}); // aunque no esté en la lista: el servidor debe negarse
      } else if (ultimo.role === 'tool') {
        const d = JSON.parse(ultimo.content);
        await decir(d.error ? `No pude consultar eso: ${d.error}` : d.ingresos ? `En **${d.mes}** entraron ${d.ingresos} y salieron ${d.egresos}; el flujo neto es ${d.flujo_neto}.` : d.conteo_por_estado ? `Hay ${d.conteo_por_estado.activo} proyectos activos y ${d.conteo_por_estado.pausado} pausados.` : d.total_emitido ? `En ${d.mes} se emitieron ${d.emitidos} comprobantes por ${d.total_emitido}.` : 'Aquí tienes los datos.');
      }
      else await decir('Listo.');
    }
    linea({ message: { role: 'assistant', content: '' }, done: true, eval_count: 10 });
    res.end();
  });
  return new Promise((ok) => srv.listen(puerto, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}`, pedidos, cerrar: () => new Promise((c) => { srv.closeAllConnections?.(); srv.close(c); }) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const o = await iniciarOllamaFalso(Number(process.argv[2] || 11434));
  console.log(`Ollama falso en ${o.url}`);
}
