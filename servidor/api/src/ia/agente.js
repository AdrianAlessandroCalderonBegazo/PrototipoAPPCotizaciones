// Conversaciones con la IA (Cotizador IA y Asistente IA) y la vuelta «pregunta → herramientas → respuesta» en streaming.
// La IA solo lee: lo que propone (una cotización) lo revisa y guarda una persona en Cotización.
import { leerEmpresa, leerParametros } from '../configuracion.js';
import { consulta } from '../db.js';
import { falla } from '../errores.js';
import { leerContexto } from './config.js';
import { ejecutarHerramienta, herramientasDe, paraOllama } from './herramientas.js';
import { buscarProductos } from './indice.js';
import { chatear } from './ollama.js';
import { calcularGuiada, parsearPedido, TIPOS } from './guiada.js';
import { reconocer, resumir } from './rapidas.js';

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const VUELTAS = 5; // máximo de idas y vueltas con herramientas por pregunta

// ---------------------------------------------------------------------------------------------
// Conversaciones
// ---------------------------------------------------------------------------------------------

const COLS = `c.id, c.modulo, c.titulo, c.autor_id, c.autor_nombre, c.creado_en::text AS creado_en, c.actualizado_en::text AS actualizado_en,
  (SELECT count(*)::int FROM ia_mensajes m WHERE m.conversacion_id = c.id) AS n_mensajes`;

export async function listarConversaciones(modulo, u, { q, autor } = {}) {
  const { rows } = await consulta(
    `SELECT ${COLS} FROM ia_conversaciones c
      WHERE c.modulo = $1 AND c.eliminado_en IS NULL AND ($2::int IS NULL OR c.autor_id = $2)
        AND ($3::text IS NULL OR translate(lower(c.titulo), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($3), 'áéíóúüñ', 'aeiouun') || '%')
        AND ($4::text IS NULL OR c.autor_nombre = $4)
      ORDER BY c.actualizado_en DESC LIMIT 300`,
    [modulo, modulo !== 'cotizador' ? u.id : null, q ? String(q).slice(0, 80) : null, autor ? String(autor).slice(0, 120) : null],
  );
  return rows;
}

async function conversacion(id, modulo, u) {
  const { rows } = await consulta(`SELECT ${COLS} FROM ia_conversaciones c WHERE c.id = $1 AND c.modulo = $2 AND c.eliminado_en IS NULL`, [id, modulo]);
  const c = rows[0];
  // Las del Asistente y las de Finanzas son privadas: cada respuesta depende de los permisos de quien preguntó.
  if (!c || (modulo !== 'cotizador' && c.autor_id !== u.id)) throw falla(404, 'No existe esa conversación.');
  return c;
}

export async function obtenerConversacion(id, modulo, u) {
  const c = await conversacion(id, modulo, u);
  const { rows } = await consulta(
    'SELECT id, rol, texto, datos, por_voz, autor_nombre, modelo, duracion_ms, creado_en::text AS creado_en FROM ia_mensajes WHERE conversacion_id = $1 ORDER BY id',
    [id],
  );
  return { ...c, mensajes: rows };
}

/** Borrado lógico (queda la fila y la auditoría). */
export async function eliminarConversaciones(ids, modulo, u) {
  const lista = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  if (!lista.length) throw falla(400, 'Elige al menos una consulta.');
  const { rows } = await consulta(
    `UPDATE ia_conversaciones SET eliminado_en = now() AT TIME ZONE 'America/Lima', eliminado_por = $3
      WHERE id = ANY($1::int[]) AND modulo = $2 AND eliminado_en IS NULL AND ($4::int IS NULL OR autor_id = $4)
      RETURNING id, titulo, autor_nombre`,
    [lista, modulo, u.nombre, modulo !== 'cotizador' ? u.id : null],
  );
  return rows;
}

/** La tarjeta de una cotización propuesta (para «Abrir en Cotización»). */
export async function propuesta(mensajeId) {
  const { rows } = await consulta(
    `SELECT m.id, m.datos, c.id AS conversacion_id, c.titulo FROM ia_mensajes m JOIN ia_conversaciones c ON c.id = m.conversacion_id
      WHERE m.id = $1 AND c.modulo = 'cotizador' AND c.eliminado_en IS NULL`,
    [mensajeId],
  );
  if (!rows[0]?.datos?.tarjeta) throw falla(404, 'Esa respuesta no tiene una cotización propuesta.');
  return { mensaje_id: rows[0].id, conversacion_id: rows[0].conversacion_id, ...rows[0].datos.tarjeta };
}

// ---------------------------------------------------------------------------------------------
// Borradores del modelo: lo que escribe antes de usar una herramienta («voy a buscar…») o su razonamiento en inglés
// no es la respuesta. No se muestra ni se guarda.
// ---------------------------------------------------------------------------------------------
const INGLES = /\b(the|user|i|i'll|i'm|let's|let|need|should|wants|first|then|check|okay|so|maybe|wait|function|call|tool|catalog|answer|think)\b/gi;
const ESPANOL = /\b(el|la|los|las|de|del|que|para|con|una|un|se|es|por|en|sistema|precio|total|cotizaci[oó]n)\b/gi;
/** ¿Este párrafo es el razonamiento del modelo (en inglés o «voy a usar la herramienta…») y no una respuesta? */
export function esRazonamiento(p) {
  const t = String(p ?? '').trim();
  if (!t) return false;
  if (/^(okay|ok,|alright|let me|let's|first,|so,|hmm|wait|the user|i need|i should|i'll|i will)\b/i.test(t)) return true;
  if (/\b(buscar_productos|proponer_cotizacion|ver_kits|tool|function call)\b/i.test(t) && /\b(I|I'll|should|need)\b/.test(t)) return true;
  const en = (t.match(INGLES) ?? []).length;
  const es = (t.match(ESPANOL) ?? []).length;
  return en >= 6 && en > es * 1.5;
}
/** Quita los párrafos de razonamiento; deja solo la respuesta para la persona. */
export function limpiarRespuesta(texto) {
  return String(texto ?? '').split(/\n\s*\n/).filter((p) => !esRazonamiento(p)).join('\n\n').trim();
}

// ---------------------------------------------------------------------------------------------
// Instrucciones para el modelo
// ---------------------------------------------------------------------------------------------

async function sistemaCotizador(texto) {
  const [ctx, emp, par] = await Promise.all([leerContexto(), leerEmpresa(), leerParametros()]);
  const partes = [
    `Eres el Cotizador IA de ${emp.razon_social ?? 'la empresa'}, de Arequipa (Perú): vende e instala sistemas solares fotovoltaicos. Hoy es ${hoyLima()}.`,
    'Respondes en español, en pocas frases y claro. No expliques lo que vas a hacer ni tu razonamiento: usa las herramientas y da solo el resultado.',
    'REGLAS QUE NUNCA ROMPES:',
    '- No inventas productos ni precios. Solo usas productos que te devuelve buscar_productos (o kits de ver_kits).',
    '- Para un sistema completo (On-Grid, híbrido o aislado) usa cotizacion_guiada con el tipo y el consumo o la potencia: el sistema elige paneles, inversor y baterías y calcula todo. No busques producto por producto.',
    '- Para equipos sueltos: busca con buscar_productos y llama a proponer_cotizacion con los CÓDIGOS y cantidades. El sistema pone los precios y calcula los totales.',
    '- Instalación, mano de obra o lo que no esté en el catálogo: agrégalo con solo «descripcion» (quedará «Sin dato» para que una persona ponga el precio).',
    '- Si falta un dato (consumo, horas de respaldo, tipo de sistema), propone con supuestos razonables y dilo en una frase.',
    '- Tú no guardas nada: una persona revisa la propuesta y la abre en Cotización.',
  ];
  if (ctx.usar_reglas && ctx.reglas) partes.push(`REGLAS DE COTIZACIÓN DE LA EMPRESA:\n${ctx.reglas}`);
  if (ctx.usar_notas && ctx.notas) partes.push(`NOTAS:\n${ctx.notas}`);
  if (ctx.usar_precios) {
    const tc = par.tipo_cambio?.valor ? `${par.tipo_cambio.valor} (al ${par.tipo_cambio.fecha ?? 'sin fecha'})` : 'Sin dato';
    partes.push(`PRECIOS: los del catálogo ya incluyen IGV 18 %. Tipo de cambio US$ → S/: ${tc}.`);
  }
  if (ctx.usar_catalogo) {
    const cands = await buscarProductos(texto, { limite: 15 });
    if (cands.length) partes.push(`PRODUCTOS DEL CATÁLOGO QUE PODRÍAN SERVIR (código | nombre | marca | precio con IGV):\n${cands.map((p) => `${p.codigo ?? `ID${p.id}`} | ${p.nombre} | ${p.marca ?? '-'} | ${p.precio ? `${p.moneda === 'USD' ? 'US$' : 'S/'} ${p.precio}` : 'Sin dato'}`).join('\n')}`);
  }
  partes.push('/no_think');
  return partes.join('\n');
}

async function sistemaAsistente(nombres) {
  const emp = await leerEmpresa();
  const hoy = hoyLima();
  return [
    `Eres el Asistente IA del ERP de ${emp.razon_social ?? 'la empresa'} (Arequipa, Perú; sistemas solares). Hoy es ${hoy}; el mes actual es ${hoy.slice(0, 7)}.`,
    'Respondes en español, en 2 a 5 frases, claro y sin rodeos. No expliques lo que vas a hacer ni tu razonamiento: da solo el resultado.',
    'REGLAS QUE NUNCA ROMPES:',
    '- Toda cifra sale de una herramienta. Nunca inventes ni calcules sumas: los totales ya vienen hechos, cópialos tal cual (con S/).',
    '- Solo puedes LEER. No puedes crear, cambiar, anular ni borrar nada. Si te piden un cambio, explica que lo debe hacer una persona en el módulo que corresponde.',
    '- Si una herramienta dice que no hay permiso o no hay datos, dilo así («Sin dato»).',
    '- Las tablas y gráficos se muestran solos debajo de tu respuesta: no dibujes tablas, solo resume lo importante.',
    `Herramientas disponibles para esta persona: ${nombres.join(', ') || 'ninguna'}.`,
    '/no_think',
  ].join('\n');
}

function sistemaFinanzas(nombres) {
  const hoy = hoyLima();
  const dia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(`${hoy}T12:00:00Z`).getUTCDay()];
  return [
    `Eres el asistente de la app Finanzas de la empresa (caja diaria y caja chica de Arequipa = AQP y Moquegua = MOQ). Hoy es ${dia} ${hoy}.`,
    'Respondes en español, en 1 a 4 frases cortas: lo leen en el celular. No expliques tu razonamiento: da solo el resultado.',
    'REGLAS QUE NUNCA ROMPES:',
    '- Toda cifra sale de una herramienta. Nunca inventes ni sumes: los totales ya vienen hechos (con S/), cópialos tal cual.',
    '- Solo puedes LEER. No registras, corriges ni borras gastos: si te lo piden, explica que se hace en Caja diaria o Caja chica.',
    '- «esta semana» = periodo semana; «este mes» = mes; «ayer», «hoy», «el mes pasado» = mes_anterior. Si dicen una ciudad, usa ciudad.',
    '- «Cta. cte.» de la caja diaria es Yape. «Recibo» o «comprobante» de caja chica = la foto adjunta.',
    '- Las tablas y gráficos se muestran solos debajo de tu respuesta: no dibujes tablas.',
    `Herramientas disponibles: ${nombres.join(', ') || 'ninguna'}.`,
    '/no_think',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Preguntar (streaming)
// ---------------------------------------------------------------------------------------------

/** Guarda la respuesta (de la IA o directa) y avisa el fin al navegador. */
async function guardarRespuesta(conv, respuesta, datos, modelo, inicio, enviar) {
  const { rows } = await consulta(
    `INSERT INTO ia_mensajes (conversacion_id, rol, texto, datos, modelo, duracion_ms) VALUES ($1, 'ia', $2, $3, $4, $5)
     RETURNING id, rol, texto, datos, por_voz, autor_nombre, modelo, duracion_ms, creado_en::text AS creado_en`,
    [conv.id, respuesta, JSON.stringify(datos), modelo, Date.now() - inicio],
  );
  await consulta("UPDATE ia_conversaciones SET actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1", [conv.id]);
  enviar({ tipo: 'fin', mensaje: rows[0] });
  return conv.id;
}

/**
 * enviar(evento) recibe: { tipo: 'conversacion', id, titulo } · { tipo: 'herramienta', nombre, fuente } · { tipo: 'texto', t }
 * · { tipo: 'borrar' } (descartar el texto mostrado: era un borrador)
 * · { tipo: 'fin', mensaje } · { tipo: 'error', mensaje, motivo }.
 */
export async function preguntar({ modulo, conversacionId, texto: textoIn, porVoz = false, u, enviar, senal }) {
  const texto = String(textoIn ?? '').trim().slice(0, 4000);
  if (!texto) throw falla(400, 'Escribe tu consulta.');
  let conv;
  if (conversacionId) conv = await conversacion(Number(conversacionId), modulo, u);
  else {
    const { rows } = await consulta(
      'INSERT INTO ia_conversaciones (modulo, titulo, autor_id, autor_nombre) VALUES ($1, $2, $3, $4) RETURNING id, titulo',
      [modulo, texto.replace(/\s+/g, ' ').slice(0, 120), u.id, u.nombre],
    );
    conv = rows[0];
  }
  enviar({ tipo: 'conversacion', id: conv.id, titulo: conv.titulo });
  const { rows: previos } = await consulta(
    "SELECT rol, texto FROM ia_mensajes WHERE conversacion_id = $1 AND rol <> 'error' ORDER BY id DESC LIMIT 10",
    [conv.id],
  );
  await consulta('INSERT INTO ia_mensajes (conversacion_id, rol, texto, por_voz, autor_nombre) VALUES ($1, $2, $3, $4, $5)', [conv.id, 'usuario', texto, !!porVoz, u.nombre]);

  const lista = await herramientasDe(modulo, u);
  const inicio = Date.now();

  // Cotizador: un pedido claro al empezar («híbrido de 10 kW para 900 kWh/mes») se calcula con la cotización guiada, sin IA.
  if (modulo === 'cotizador' && !conversacionId) {
    const pedido = parsearPedido(texto);
    if (pedido) {
      try {
        enviar({ tipo: 'herramienta', nombre: 'cotizacion_guiada', fuente: 'Catálogo' });
        const g = await calcularGuiada(pedido);
        enviar({ tipo: 'texto', t: g.texto });
        return await guardarRespuesta(conv, g.texto, { tarjeta: g.tarjeta, bloques: [], fuentes: ['Catálogo'], herramientas: ['cotizacion_guiada'], rapida: true, guiada: true, calculo: g.calculo }, null, inicio, enviar);
      } catch (e) {
        console.error('Cotización guiada falló, se pasa a la IA:', e?.message);
      }
    }
  }

  // Respuesta directa (sin IA): preguntas frecuentes o escritas parecido → consulta fija, en menos de un segundo.
  const rapida = reconocer(modulo, texto);
  if (rapida && lista.some((h) => h.nombre === rapida.herramienta)) {
    try {
      const h = lista.find((x) => x.nombre === rapida.herramienta);
      enviar({ tipo: 'herramienta', nombre: h.nombre, fuente: h.fuente });
      const res = await ejecutarHerramienta(lista, h.nombre, rapida.args, u);
      const respuesta = resumir(h.nombre, res.modelo);
      enviar({ tipo: 'texto', t: respuesta });
      const datos = { tarjeta: null, bloques: (res.bloques ?? []).slice(-8), fuentes: [res.fuente, ...(res.fuentesExtra ?? [])].filter(Boolean), herramientas: [h.nombre], rapida: true };
      return await guardarRespuesta(conv, respuesta, datos, null, inicio, enviar);
    } catch (e) {
      console.error('Respuesta directa falló, se pasa a la IA:', e?.message);
    }
  }
  const mensajes = [
    { role: 'system', content: modulo === 'cotizador' ? await sistemaCotizador([texto, ...previos.filter((m) => m.rol === 'usuario').slice(0, 2).map((m) => m.texto)].join(' ')) : modulo === 'finanzas' ? sistemaFinanzas(lista.map((h) => h.nombre)) : await sistemaAsistente(lista.map((h) => h.nombre)) },
    ...previos.reverse().map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.texto })),
    { role: 'user', content: texto },
  ];
  const bloques = [];
  const fuentes = new Set();
  const usadas = [];
  let tarjeta = null;
  let respuesta = '';
  let modelo = null;
  try {
    for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
      // El texto se muestra en vivo solo cuando ya no parece un borrador: los primeros caracteres se retienen y, si son
      // razonamiento («Okay, let's…») o la vuelta termina usando herramientas, se descarta (evento «borrar»).
      let retenido = '';
      let enVivo = false;
      let descartado = false;
      const r = await chatear({
        mensajes, herramientas: paraOllama(lista), senal,
        alTexto: (t) => {
          if (descartado) return;
          if (enVivo) return enviar({ tipo: 'texto', t });
          retenido += t;
          if (retenido.length < 90 && !/\n\s*\n/.test(retenido)) return;
          if (esRazonamiento(retenido.split(/\n\s*\n/)[0])) descartado = true;
          else {
            enVivo = true;
            enviar({ tipo: 'texto', t: retenido });
          }
        },
      });
      modelo = r.modelo;
      if (r.llamadas.length) {
        if (enVivo) enviar({ tipo: 'borrar' }); // era un borrador antes de usar herramientas: no es la respuesta
      } else {
        const limpio = limpiarRespuesta(r.texto);
        if (limpio !== r.texto.trim() || !enVivo) {
          if (enVivo) enviar({ tipo: 'borrar' });
          if (limpio) enviar({ tipo: 'texto', t: limpio });
        }
        if (limpio) respuesta = limpio;
        break;
      }
      mensajes.push({ role: 'assistant', content: '', tool_calls: r.llamadas.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) });
      for (const c of r.llamadas.slice(0, 4)) {
        const h = lista.find((x) => x.nombre === c.name);
        enviar({ tipo: 'herramienta', nombre: c.name, fuente: h?.fuente ?? null });
        const res = await ejecutarHerramienta(lista, c.name, c.arguments, u);
        usadas.push(c.name);
        if (res.fuente && res.fuente !== 'Generado por IA') fuentes.add(res.fuente);
        for (const f of res.fuentesExtra ?? []) fuentes.add(f);
        if (res.tarjeta) tarjeta = res.tarjeta;
        bloques.push(...(res.bloques ?? []));
        mensajes.push({ role: 'tool', tool_name: c.name, content: JSON.stringify(res.modelo) });
      }
      if (vuelta === VUELTAS - 2) mensajes.push({ role: 'system', content: 'Ya tienes los datos: responde ahora sin usar más herramientas.' });
    }
    if (tarjeta) fuentes.add('Catálogo');
    const datos = { tarjeta, bloques: bloques.slice(-8), fuentes: [...fuentes, 'Generado por IA'], herramientas: usadas };
    if (!respuesta && tarjeta) respuesta = 'Esta es la propuesta. Revísala y ábrela en Cotización para completarla y guardarla.';
    if (!respuesta && !bloques.length) respuesta = 'No obtuve una respuesta. Intenta escribir la consulta de otra forma.';
    await guardarRespuesta(conv, respuesta, datos, modelo, inicio, enviar);
  } catch (e) {
    const motivo = e?.sinIa ? 'no_instalada' : e?.sinConexion ? 'sin_conexion' : e?.tiempo ? 'tiempo' : e?.estado === 404 ? 'falta_modelo' : 'error';
    const mensaje = e?.estado === 404 ? 'El modelo de IA no está descargado en el servidor.' : e?.message ?? 'No se pudo generar la respuesta.';
    await consulta("INSERT INTO ia_mensajes (conversacion_id, rol, texto, modelo, duracion_ms) VALUES ($1, 'error', $2, $3, $4)", [conv.id, mensaje, modelo, Date.now() - inicio]);
    await consulta("UPDATE ia_conversaciones SET actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1", [conv.id]);
    enviar({ tipo: 'error', mensaje, motivo });
  }
  return conv.id;
}

/** Cotización guiada desde el formulario: crea la consulta (visible en el historial compartido) con la propuesta calculada. */
export async function cotizarGuiada(b, u) {
  const inicio = Date.now();
  const g = await calcularGuiada(b);
  const c = g.calculo;
  const pedido = [`Cotización guiada: ${TIPOS[c.tipo]}`, c.consumo_kwh_mes ? `${c.consumo_kwh_mes} kWh/mes` : null, c.potencia_kw ? `${c.potencia_kw} kW` : null,
    c.bateria_kwh ? `baterías ${c.bateria_kwh} kWh` : c.horas_respaldo ? `${c.horas_respaldo} h de respaldo` : null, b?.cliente ? String(b.cliente).slice(0, 120) : null].filter(Boolean).join(' · ');
  const { rows } = await consulta('INSERT INTO ia_conversaciones (modulo, titulo, autor_id, autor_nombre) VALUES ($1, $2, $3, $4) RETURNING id, titulo', ['cotizador', pedido.slice(0, 120), u.id, u.nombre]);
  await consulta("INSERT INTO ia_mensajes (conversacion_id, rol, texto, autor_nombre) VALUES ($1, 'usuario', $2, $3)", [rows[0].id, pedido, u.nombre]);
  let fin = null;
  await guardarRespuesta(rows[0], g.texto, { tarjeta: g.tarjeta, bloques: [], fuentes: ['Catálogo'], herramientas: ['cotizacion_guiada'], rapida: true, guiada: true, calculo: c }, null, inicio, (e) => { fin = e.mensaje; });
  return { conversacion_id: rows[0].id, mensaje: fin };
}
