// Configuración del ERP: datos de la empresa (para los PDF), parámetros (alertas, vigencia de precios, tipo de cambio),
// numeración de cotizaciones y estado de las integraciones. Se guarda en la tabla `configuracion` (clave → JSON).
// Lo que no se sabe queda en null y la pantalla lo muestra como «Sin dato»: nunca se inventa.
import { consulta } from './db.js';
import { falla } from './errores.js';
import { rucValido } from './validaciones.js';

async function leer(clave, porDefecto) {
  const { rows } = await consulta('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  if (!rows[0]) return structuredClone(porDefecto);
  try {
    return { ...structuredClone(porDefecto), ...JSON.parse(rows[0].valor) };
  } catch {
    return structuredClone(porDefecto);
  }
}

async function escribir(clave, valor) {
  await consulta(
    `INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now() AT TIME ZONE 'America/Lima'`,
    [clave, JSON.stringify(valor)],
  );
}

const textoONulo = (v, max = 300) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim().slice(0, max);
  return t === '' ? null : t;
};

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

const EMPRESA = {
  razon_social: null, nombre_comercial: null, ruc: null, direccion: null, ciudad: null, telefono: null, correo: null,
  web: null, logo: null, cuentas_bancarias: null, pie_pdf: null,
};

export const leerEmpresa = () => leer('empresa', EMPRESA);

export async function guardarEmpresa(datos) {
  const antes = await leerEmpresa();
  const nueva = { ...antes };
  for (const k of Object.keys(EMPRESA)) if (k in (datos ?? {})) nueva[k] = textoONulo(datos[k], k === 'pie_pdf' || k === 'cuentas_bancarias' ? 2000 : 300);
  if (nueva.ruc && !rucValido(nueva.ruc)) throw falla(400, 'El RUC no es válido (revisa los 11 dígitos).');
  if (nueva.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nueva.correo)) throw falla(400, 'El correo no tiene un formato válido.');
  if (nueva.logo && !/^\/uploads\/[0-9a-f]{24}\.(png|jpg|jpeg|webp)$/.test(nueva.logo)) throw falla(400, 'El logo debe ser una imagen subida al servidor.');
  await escribir('empresa', nueva);
  return { antes, despues: nueva };
}

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------

const PARAMETROS = {
  presupuesto_aviso_pct: 80, // aviso cuando un proyecto llega a este % de su presupuesto
  presupuesto_limite_pct: 100, // alerta roja
  vigencia_precios_dias: 30, // un precio de proveedor más antiguo se marca «desactualizado»
  tipo_cambio: { valor: null, fecha: null, fuente: null }, // US$ 1 = S/ valor
};

export const leerParametros = () => leer('parametros', PARAMETROS);

const entero = (v, min, max, nombre) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw falla(400, `${nombre} debe ser un número entero entre ${min} y ${max}.`);
  return n;
};

export async function guardarParametros(datos) {
  const antes = await leerParametros();
  const p = structuredClone(antes);
  if (datos?.presupuesto_aviso_pct !== undefined) p.presupuesto_aviso_pct = entero(datos.presupuesto_aviso_pct, 1, 100, 'El aviso de presupuesto');
  if (datos?.presupuesto_limite_pct !== undefined) p.presupuesto_limite_pct = entero(datos.presupuesto_limite_pct, 1, 500, 'El límite de presupuesto');
  if (p.presupuesto_aviso_pct > p.presupuesto_limite_pct) throw falla(400, 'El aviso debe ser menor o igual al límite.');
  if (datos?.vigencia_precios_dias !== undefined) p.vigencia_precios_dias = entero(datos.vigencia_precios_dias, 1, 365, 'La vigencia de precios');
  if (datos?.tipo_cambio !== undefined) {
    const tc = datos.tipo_cambio ?? {};
    // El tipo de cambio se guarda como texto con 4 decimales (nunca como número de coma flotante).
    const valor = tc.valor === null || tc.valor === '' || tc.valor === undefined ? null : String(tc.valor).trim();
    if (valor !== null && !/^\d{1,2}(\.\d{1,4})?$/.test(valor)) throw falla(400, 'El tipo de cambio debe ser un número como 3.742.');
    const fecha = textoONulo(tc.fecha, 10);
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw falla(400, 'La fecha del tipo de cambio debe ser AAAA-MM-DD.');
    p.tipo_cambio = { valor: valor === null ? null : Number(valor).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''), fecha, fuente: textoONulo(tc.fuente, 120) };
  }
  await escribir('parametros', p);
  return { antes, despues: p };
}

// ---------------------------------------------------------------------------
// Numeración de cotizaciones (usa el mismo correlativo que ya tenían las cotizaciones de la app)
// ---------------------------------------------------------------------------

const NUMERACION = { prefijo: 'S', digitos: 5 };

export async function leerNumeracion() {
  const n = await leer('numeracion_cotizacion', NUMERACION);
  const { rows } = await consulta("SELECT valor FROM correlativos WHERE clave = 'cotizacion'");
  const ultimo = rows[0]?.valor ?? 0;
  const siguiente = ultimo + 1;
  return { ...n, ultimo, siguiente, ejemplo: `${n.prefijo}${String(siguiente).padStart(n.digitos, '0')}` };
}

export async function guardarNumeracion(datos) {
  const antes = await leerNumeracion();
  const prefijo = textoONulo(datos?.prefijo, 10) ?? '';
  if (!/^[A-Z0-9-]{0,10}$/i.test(prefijo)) throw falla(400, 'El prefijo solo puede tener letras, números y guiones.');
  const digitos = entero(datos?.digitos ?? antes.digitos, 1, 10, 'Los dígitos');
  await escribir('numeracion_cotizacion', { prefijo, digitos });
  if (datos?.siguiente !== undefined) {
    const sig = entero(datos.siguiente, 1, 99_999_999, 'El siguiente número');
    // Nunca hacia atrás: se repetirían números ya usados.
    if (sig < antes.siguiente) throw falla(400, `El siguiente número no puede ser menor a ${antes.siguiente} (ya se usaron los anteriores).`);
    await consulta(
      `INSERT INTO correlativos (clave, valor) VALUES ('cotizacion', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [sig - 1],
    );
  }
  return { antes, despues: await leerNumeracion() };
}

// ---------------------------------------------------------------------------
// Integraciones: estado y prueba de conexión. Los secretos (tokens) van en variables de entorno, nunca en la base.
// ---------------------------------------------------------------------------

async function conTiempo(url, opciones = {}, ms = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const INTEGRACIONES = [
  { clave: 'logistica', nombre: 'PWA Logística', descripcion: 'Requerimientos de materiales y checklists (misma base de datos).' },
  { clave: 'finanzas', nombre: 'PWA Finanzas', descripcion: 'Caja chica: movimientos, cierres y gastos de proyecto.' },
  { clave: 'ollama', nombre: 'Ollama (IA local)', descripcion: 'Modelo de IA en el VPS para el Cotizador IA y el Asistente.' },
  { clave: 'vrm', nombre: 'Victron VRM', descripcion: 'Datos de los sistemas Victron para Activos y control.' },
  { clave: 'padron', nombre: 'Consulta RUC / DNI', descripcion: 'Trae la razón social y dirección al escribir un RUC o DNI en Facturación (servicio externo con token, opcional).' },
  { clave: 'sunat', nombre: 'Extensión SUNAT', descripcion: 'Extensión de Chrome que rellena el portal SOL. Se detecta en el navegador.' },
];

export async function probarIntegracion(clave, env = process.env) {
  const ahora = new Date().toISOString();
  try {
    if (clave === 'logistica') {
      const { rows } = await consulta('SELECT count(*)::int AS n FROM requerimientos');
      return { estado: 'conectado', detalle: `${rows[0].n} requerimientos en la base.`, probado_en: ahora };
    }
    if (clave === 'finanzas') {
      const url = env.FINANZAS_API_URL;
      if (!url) return { estado: 'no_configurado', detalle: 'Falta FINANZAS_API_URL en el servidor.', probado_en: ahora };
      const r = await conTiempo(`${url.replace(/\/+$/, '')}/health`);
      return r.ok ? { estado: 'conectado', detalle: 'La API de Finanzas responde.', probado_en: ahora } : { estado: 'error', detalle: `La API de Finanzas respondió ${r.status}.`, probado_en: ahora };
    }
    if (clave === 'ollama') {
      const url = env.OLLAMA_URL;
      if (!url) return { estado: 'no_configurado', detalle: 'Falta OLLAMA_URL (se instala en la fase de IA).', probado_en: ahora };
      const r = await conTiempo(`${url.replace(/\/+$/, '')}/api/tags`);
      if (!r.ok) return { estado: 'error', detalle: `Ollama respondió ${r.status}.`, probado_en: ahora };
      const modelos = ((await r.json()).models ?? []).map((m) => m.name);
      const modelo = env.OLLAMA_MODELO || 'qwen3:4b';
      return modelos.includes(modelo)
        ? { estado: 'conectado', detalle: `Modelo ${modelo} disponible.`, probado_en: ahora }
        : { estado: 'error', detalle: `Ollama responde, pero falta el modelo ${modelo} (hay: ${modelos.join(', ') || 'ninguno'}).`, probado_en: ahora };
    }
    if (clave === 'vrm') {
      if (!env.VRM_TOKEN) return { estado: 'no_configurado', detalle: 'Falta VRM_TOKEN (se configura en la fase de Activos y control).', probado_en: ahora };
      const r = await conTiempo('https://vrmapi.victronenergy.com/v2/users/me', { headers: { 'X-Authorization': `Token ${env.VRM_TOKEN}` } }, 8000);
      return r.ok ? { estado: 'conectado', detalle: 'El token de VRM es válido.', probado_en: ahora } : { estado: 'error', detalle: `VRM respondió ${r.status}.`, probado_en: ahora };
    }
    if (clave === 'padron') {
      if (!env.CONSULTA_DOC_TOKEN) return { estado: 'no_configurado', detalle: 'Falta CONSULTA_DOC_TOKEN. Sin él, Facturación usa los datos ya registrados en el ERP y el nombre se escribe a mano.', probado_en: ahora };
      const url = (env.CONSULTA_RUC_URL || 'https://api.decolecta.com/v1/sunat/ruc?numero={numero}').replace('{numero}', '20605309489');
      const r = await conTiempo(url, { headers: { Authorization: `Bearer ${env.CONSULTA_DOC_TOKEN}`, Accept: 'application/json' } }, 8000);
      return r.ok ? { estado: 'conectado', detalle: 'El servicio de consulta responde.', probado_en: ahora } : { estado: 'error', detalle: `El servicio de consulta respondió ${r.status}.`, probado_en: ahora };
    }
    if (clave === 'sunat') return { estado: 'en_navegador', detalle: 'La extensión se detecta en el navegador de cada persona.', probado_en: ahora };
    throw falla(404, 'No existe esa integración.');
  } catch (e) {
    if (e?.codigo) throw e;
    return { estado: 'error', detalle: e?.name === 'AbortError' ? 'No respondió a tiempo.' : 'No se pudo conectar.', probado_en: ahora };
  }
}

export async function estadoIntegraciones(env = process.env) {
  const out = [];
  for (const i of INTEGRACIONES) out.push({ ...i, ...(await probarIntegracion(i.clave, env)) });
  return out;
}
