// Roles y matriz de permisos del ERP (y de las PWA Logística y Finanzas).
// Cada rol tiene, en cada módulo, un nivel: ninguno, lectura o completo. El administrador siempre tiene acceso completo.
// La matriz vive en la tabla rol_permisos (se edita en ERP › Configuración) y el servidor la comprueba en cada pedido:
// ocultar botones en la pantalla es solo comodidad.
import { consulta } from './db.js';
import { falla } from './errores.js';

export const ROLES = ['admin', 'ventas', 'contabilidad', 'tecnico'];
export const ROL_ETIQUETA = { admin: 'Administrador', ventas: 'Ventas', contabilidad: 'Contabilidad', tecnico: 'Técnico' };
export const NIVELES = ['ninguno', 'lectura', 'completo'];
const ORDEN = { ninguno: 0, lectura: 1, completo: 2 };

/** Módulos y qué permite cada nivel (lo que se muestra en la matriz). */
export const MODULOS = [
  { clave: 'inicio', nombre: 'Inicio', grupo: 'General', lectura: 'Ver el panel de inicio', completo: 'Ver el panel de inicio' },
  { clave: 'proyectos', nombre: 'Proyectos', grupo: 'Operación', lectura: 'Ver proyectos, gastos y fotos', completo: 'Crear proyectos, cambiar su estado y subir fotos' },
  { clave: 'almacen', nombre: 'Almacén', grupo: 'Operación', lectura: 'Ver requerimientos y checklists', completo: 'Ver requerimientos y checklists' },
  { clave: 'activos', nombre: 'Activos y control', grupo: 'Operación', lectura: 'Ver el panel Victron', completo: 'Ver el panel Victron y pedir resúmenes' },
  { clave: 'cotizacion', nombre: 'Cotización', grupo: 'Comercial', lectura: 'Ver catálogo y cotizaciones', completo: 'Crear y editar cotizaciones, productos, kits e importar listas' },
  { clave: 'cotizador_ia', nombre: 'Cotizador IA', grupo: 'Comercial', lectura: 'Ver las conversaciones', completo: 'Cotizar con IA y editar el contexto' },
  { clave: 'comparador', nombre: 'Comparador de proveedores', grupo: 'Comercial', lectura: 'Buscar y comparar precios', completo: 'Gestionar proveedores y cargar listas' },
  { clave: 'contabilidad', nombre: 'Contabilidad', grupo: 'Finanzas', lectura: 'Ver cuenta principal y caja chica', completo: 'Ver todo y enviar fondos a caja chica' },
  { clave: 'facturacion', nombre: 'Facturación SUNAT', grupo: 'Finanzas', lectura: 'Ver comprobantes', completo: 'Preparar, enviar a SUNAT y registrar comprobantes' },
  { clave: 'asistente_ia', nombre: 'Asistente IA', grupo: 'Inteligencia', lectura: 'Ver conversaciones', completo: 'Consultar al asistente (con los datos que el rol puede ver)' },
  { clave: 'configuracion', nombre: 'Configuración', grupo: 'Sistema', lectura: 'Ver la configuración y la auditoría', completo: 'Cambiar usuarios, permisos, empresa e integraciones' },
  { clave: 'logistica', nombre: 'PWA Logística', grupo: 'Apps', lectura: 'Ver, pedir requerimientos y salidas, confirmar lo recibido', completo: 'Además aprobar, alistar, confirmar salidas y devoluciones, editar listas y maletas' },
  { clave: 'caja_chica', nombre: 'PWA Finanzas (caja chica)', grupo: 'Apps', lectura: 'Ver la caja, alertas e historial', completo: 'Registrar, corregir días anteriores y cerrar el día' },
];
const CLAVES = new Set(MODULOS.map((m) => m.clave));

// Matriz en memoria: se recarga al cambiarla y como máximo cada 30 s (otro servicio podría haberla cambiado).
let cache = null;
let cargadaEn = 0;

export async function matriz({ fresca = false } = {}) {
  if (!cache || fresca || Date.now() - cargadaEn > 30_000) {
    const { rows } = await consulta('SELECT rol, modulo, nivel FROM rol_permisos');
    const m = {};
    for (const rol of ROLES) m[rol] = Object.fromEntries(MODULOS.map((x) => [x.clave, rol === 'admin' ? 'completo' : 'ninguno']));
    for (const f of rows) if (m[f.rol] && CLAVES.has(f.modulo)) m[f.rol][f.modulo] = f.nivel;
    cache = m;
    cargadaEn = Date.now();
  }
  return cache;
}

/** Nivel de cada módulo para este usuario: { proyectos: 'lectura', ... }. */
export async function nivelesDe(usuario) {
  const m = await matriz();
  return { ...(m[usuario?.rol] ?? Object.fromEntries(MODULOS.map((x) => [x.clave, 'ninguno']))) };
}

export async function tieneNivel(usuario, modulo, minimo = 'lectura') {
  if (usuario?.rol === 'admin') return true;
  const n = (await nivelesDe(usuario))[modulo] ?? 'ninguno';
  return ORDEN[n] >= ORDEN[minimo];
}

/** Lanza 403 si el usuario no llega a ese nivel en el módulo. */
export async function exigirNivel(usuario, modulo, minimo, accion) {
  if (!(await tieneNivel(usuario, modulo, minimo))) {
    const m = MODULOS.find((x) => x.clave === modulo)?.nombre ?? modulo;
    throw falla(403, `Tu rol no permite ${accion ?? (minimo === 'completo' ? `hacer cambios en ${m}` : `ver ${m}`)}.`);
  }
}

/** Middleware de Express: exige un nivel en un módulo. */
export const nivel = (modulo, minimo = 'lectura', accion) => async (req, _res, next) => {
  await exigirNivel(req.usuario, modulo, minimo, accion);
  next();
};

/** Guarda una matriz nueva (solo los roles distintos de admin). Devuelve { antes, despues } para la auditoría. */
export async function guardarMatriz(nueva, quien) {
  const antes = await matriz({ fresca: true });
  const filas = [];
  for (const rol of ROLES.filter((r) => r !== 'admin')) {
    for (const mod of MODULOS) {
      const n = nueva?.[rol]?.[mod.clave];
      if (n === undefined) continue;
      if (!NIVELES.includes(n)) throw falla(400, `Nivel no válido para ${ROL_ETIQUETA[rol]} en ${mod.nombre}.`);
      filas.push([rol, mod.clave, n]);
    }
  }
  if (!filas.length) throw falla(400, 'No hay cambios en la matriz.');
  for (const [rol, modulo, n] of filas) {
    await consulta(
      `INSERT INTO rol_permisos (rol, modulo, nivel, actualizado_por, actualizado_en) VALUES ($1, $2, $3, $4, now() AT TIME ZONE 'America/Lima')
       ON CONFLICT (rol, modulo) DO UPDATE SET nivel = EXCLUDED.nivel, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = EXCLUDED.actualizado_en`,
      [rol, modulo, n, quien],
    );
  }
  const despues = await matriz({ fresca: true });
  return { antes, despues };
}
