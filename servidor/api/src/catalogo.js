// Catálogo del ERP (Fase 3): los mismos productos que usaba Logística, con código, marca, modelo, moneda y características.
// Importar CSV: el navegador lee el archivo y manda las filas ya mapeadas; aquí se valida, se muestra la vista previa y,
// al confirmar, se aplica todo en una sola transacción. La clave para reconocer un producto es su código.
import { consulta, enTransaccion } from './db.js';
import { aCentimos, monto } from './dinero.js';
import { falla } from './errores.js';

const t = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};

const COLS = `p.id, p.codigo_erp AS codigo, p.nombre, p.marca, p.modelo, p.categoria_producto AS categoria, p.unidad_medida AS unidad,
  p.precio_venta::text AS precio, p.costo::text AS costo, p.moneda, p.caracteristicas, p.referencia_interna, p.archivo_imagen, p.imagen_url,
  p.origen, p.source, p.actualizado_en::text AS actualizado_en, p.precio_actualizado_en::text AS precio_actualizado_en`;

/** URL de la imagen: una subida al servidor (/uploads/…) o la del catálogo inicial (/productos/archivo.jpg, la sirve el ERP). */
export function imagenDe(p) {
  if (p.imagen_url && /^\/uploads\//.test(p.imagen_url)) return p.imagen_url;
  if (p.archivo_imagen && /^[\w.\- ]+\.(jpe?g|png|webp)$/i.test(p.archivo_imagen)) return `/productos/${encodeURIComponent(p.archivo_imagen)}`;
  return null;
}

export const productoDe = (p, verCosto) => {
  const { archivo_imagen: _a, imagen_url: _u, costo, ...r } = p;
  return { ...r, precio: monto(r.precio), costo: verCosto ? monto(costo) : undefined, imagen: imagenDe(p) };
};

export async function listarCatalogo(verCosto) {
  const { rows } = await consulta(`SELECT ${COLS} FROM productos p WHERE NOT p.eliminado ORDER BY p.categoria_producto, p.nombre`);
  return rows.map((p) => productoDe(p, verCosto));
}

export async function productoPorId(id, verCosto = true) {
  const { rows } = await consulta(`SELECT ${COLS} FROM productos p WHERE p.id = $1 AND NOT p.eliminado`, [id]);
  if (!rows[0]) throw falla(404, 'No existe ese producto.');
  return productoDe(rows[0], verCosto);
}

const precioODato = (v, nombre) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  let s = String(v).trim().replace(/^(S\/|US\$|\$)\s*/i, '');
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) throw new Error(`${nombre} no es un número válido («${v}»)`);
  return monto(s);
};

const RUTA_IMAGEN = /^\/uploads\/[0-9a-f]{24}\.(jpg|jpeg|png|webp)$/;

/** Campos de un producto que llegan del formulario (crear o editar). */
function campos(b, parcial) {
  const d = {};
  const poner = (k, col, max) => {
    if (!parcial || b?.[k] !== undefined) d[col] = t(b?.[k], max);
  };
  poner('codigo', 'codigo_erp', 60);
  poner('nombre', 'nombre', 255);
  poner('marca', 'marca', 80);
  poner('modelo', 'modelo', 120);
  poner('unidad', 'unidad_medida', 40);
  poner('caracteristicas', 'caracteristicas', 4000);
  if (!parcial || b?.categoria !== undefined) d.categoria_producto = t(b?.categoria, 120)?.toUpperCase() ?? 'SIN CATEGORIA';
  if (!parcial || b?.moneda !== undefined) {
    const m = b?.moneda ?? 'PEN';
    if (!['PEN', 'USD'].includes(m)) throw falla(400, 'La moneda debe ser PEN o USD.');
    d.moneda = m;
  }
  try {
    if (!parcial || b?.precio !== undefined) d.precio_venta = precioODato(b?.precio, 'El precio');
    if (!parcial || b?.costo !== undefined) d.costo = precioODato(b?.costo, 'El costo');
  } catch (e) {
    throw falla(400, e.message);
  }
  if (b?.imagen !== undefined) {
    if (b.imagen !== null && !RUTA_IMAGEN.test(String(b.imagen))) throw falla(400, 'La imagen debe subirse al servidor.');
    d.imagen_url = b.imagen;
  }
  if ('nombre' in d && !d.nombre) throw falla(400, 'Escribe el nombre del producto.');
  return d;
}

async function codigoLibre(c, codigo, id = null) {
  if (!codigo) return;
  const { rows } = await c.query('SELECT id, nombre FROM productos WHERE lower(codigo_erp) = lower($1) AND ($2::int IS NULL OR id <> $2)', [codigo, id]);
  if (rows[0]) throw falla(409, `El código ${codigo} ya lo tiene «${rows[0].nombre}».`);
}

export async function crearProducto(b) {
  const d = { ...campos(b, false), origen: 'erp', source: 'erp', modificado: true };
  return enTransaccion(async (c) => {
    await codigoLibre(c, d.codigo_erp);
    if (d.precio_venta !== null) d.precio_actualizado_en = new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima' });
    const cols = Object.keys(d);
    const { rows } = await c.query(`INSERT INTO productos (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((k) => d[k]));
    return (await c.query(`SELECT ${COLS} FROM productos p WHERE p.id = $1`, [rows[0].id])).rows[0];
  });
}

export async function editarProducto(id, b) {
  const d = campos(b, true);
  return enTransaccion(async (c) => {
    const { rows: ya } = await c.query(`SELECT ${COLS} FROM productos p WHERE p.id = $1 AND NOT p.eliminado FOR UPDATE`, [id]);
    if (!ya[0]) throw falla(404, 'No existe ese producto.');
    await codigoLibre(c, d.codigo_erp, id);
    const cols = Object.keys(d);
    if (!cols.length) return { antes: ya[0], despues: ya[0] };
    const cambioPrecio = 'precio_venta' in d && monto(ya[0].precio) !== d.precio_venta;
    await c.query(
      `UPDATE productos SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, modificado = TRUE,
         ${cambioPrecio ? "precio_actualizado_en = now() AT TIME ZONE 'America/Lima'," : ''} actualizado_en = now() AT TIME ZONE 'America/Lima'
       WHERE id = $1`,
      [id, ...cols.map((k) => d[k])],
    );
    return { antes: ya[0], despues: (await c.query(`SELECT ${COLS} FROM productos p WHERE p.id = $1`, [id])).rows[0] };
  });
}

// ---------------------------------------------------------------------------------------------
// Importar CSV
// ---------------------------------------------------------------------------------------------

export const CAMPOS_CSV = ['codigo', 'nombre', 'marca', 'modelo', 'categoria', 'unidad', 'precio', 'costo', 'moneda', 'caracteristicas'];

/**
 * filas: [{ codigo, nombre, ... }] (ya mapeadas por la persona). Devuelve la vista previa; con `confirmar` además aplica
 * los cambios en una transacción. Solo se cambia lo que trae la fila (una celda vacía no borra el dato que había).
 */
export async function importarCsv(filas, { confirmar = false } = {}) {
  if (!Array.isArray(filas) || !filas.length) throw falla(400, 'El archivo no tiene filas.');
  if (filas.length > 5000) throw falla(400, 'Importa como máximo 5000 filas a la vez.');
  return enTransaccion(async (c) => {
    const { rows: actuales } = await c.query(`SELECT ${COLS} FROM productos p WHERE NOT p.eliminado AND p.codigo_erp IS NOT NULL`);
    const porCodigo = new Map(actuales.map((p) => [p.codigo.toLowerCase(), p]));
    const vistos = new Set();
    const resultado = [];
    for (const [i, f] of filas.entries()) {
      const fila = i + 2; // la fila 1 del archivo son los títulos
      const codigo = t(f?.codigo, 60);
      const r = { fila, codigo, nombre: t(f?.nombre, 255), estado: 'error', error: null, cambios: [], precio_anterior: null, precio_nuevo: null };
      try {
        if (!codigo) throw new Error('Falta el código');
        if (vistos.has(codigo.toLowerCase())) throw new Error('Código repetido en el archivo');
        vistos.add(codigo.toLowerCase());
        const datos = {};
        for (const [k, col, max] of [['nombre', 'nombre', 255], ['marca', 'marca', 80], ['modelo', 'modelo', 120], ['unidad', 'unidad_medida', 40], ['caracteristicas', 'caracteristicas', 4000]]) {
          const v = t(f?.[k], max);
          if (v !== null) datos[col] = v;
        }
        const cat = t(f?.categoria, 120);
        if (cat) datos.categoria_producto = cat.toUpperCase();
        const precio = precioODato(f?.precio, 'El precio');
        if (precio !== null) datos.precio_venta = precio;
        const costo = precioODato(f?.costo, 'El costo');
        if (costo !== null) datos.costo = costo;
        const mon = t(f?.moneda, 5)?.toUpperCase().replace('S/', 'PEN').replace('SOLES', 'PEN').replace('US$', 'USD').replace('DOLARES', 'USD');
        if (mon) {
          if (!['PEN', 'USD'].includes(mon)) throw new Error(`Moneda no reconocida («${f.moneda}»)`);
          datos.moneda = mon;
        }
        const ya = porCodigo.get(codigo.toLowerCase());
        r.precio_nuevo = datos.precio_venta ?? null;
        if (!ya) {
          if (!datos.nombre) throw new Error('Producto nuevo sin nombre');
          r.estado = 'nuevo';
          r.nombre = datos.nombre;
          if (confirmar) {
            const d = { codigo_erp: codigo, categoria_producto: 'SIN CATEGORIA', ...datos, origen: 'erp', source: 'csv', modificado: true };
            const cols = Object.keys(d);
            await c.query(
              `INSERT INTO productos (${cols.join(', ')}, precio_actualizado_en) VALUES (${cols.map((_, j) => `$${j + 1}`).join(', ')}, ${d.precio_venta ? "now() AT TIME ZONE 'America/Lima'" : 'NULL'})`,
              cols.map((k) => d[k]),
            );
          }
        } else {
          r.nombre = ya.nombre;
          r.precio_anterior = monto(ya.precio);
          const actual = { nombre: ya.nombre, marca: ya.marca, modelo: ya.modelo, unidad_medida: ya.unidad, caracteristicas: ya.caracteristicas, categoria_producto: ya.categoria, precio_venta: monto(ya.precio), costo: monto(ya.costo), moneda: ya.moneda };
          const cambios = Object.keys(datos).filter((k) => (actual[k] ?? null) !== datos[k]);
          r.cambios = cambios;
          r.estado = cambios.length ? 'actualizado' : 'sin_cambios';
          if (confirmar && cambios.length) {
            await c.query(
              `UPDATE productos SET ${cambios.map((k, j) => `${k} = $${j + 2}`).join(', ')}, source = 'csv', modificado = TRUE,
                 ${cambios.includes('precio_venta') ? "precio_actualizado_en = now() AT TIME ZONE 'America/Lima'," : ''} actualizado_en = now() AT TIME ZONE 'America/Lima'
               WHERE id = $1`,
              [ya.id, ...cambios.map((k) => datos[k])],
            );
          }
        }
      } catch (e) {
        r.estado = 'error';
        r.error = e.message;
      }
      resultado.push(r);
    }
    const contar = (e) => resultado.filter((r) => r.estado === e).length;
    // variación promedio de los precios que cambian (en %, un decimal)
    const variaciones = resultado
      .filter((r) => r.estado === 'actualizado' && r.cambios.includes('precio_venta') && r.precio_anterior && aCentimos(r.precio_anterior) > 0)
      .map((r) => ((aCentimos(r.precio_nuevo) - aCentimos(r.precio_anterior)) * 1000) / aCentimos(r.precio_anterior));
    const codigosConPrecio = resultado.filter((r) => r.estado === 'actualizado' && r.cambios.includes('precio_venta')).map((r) => r.codigo.toLowerCase());
    const { rows: kits } = codigosConPrecio.length
      ? await c.query(
          `SELECT count(DISTINCT k.id)::int AS n FROM kits k JOIN kit_items i ON i.kit_id = k.id JOIN productos p ON p.id = i.producto_id
            WHERE k.activo AND i.precio_unitario IS NULL AND lower(p.codigo_erp) = ANY($1)`,
          [codigosConPrecio],
        )
      : { rows: [{ n: 0 }] };
    const { rows: total } = await c.query('SELECT count(*)::int AS n FROM kits WHERE activo');
    return {
      confirmado: confirmar,
      resumen: {
        nuevos: contar('nuevo'), actualizados: contar('actualizado'), sin_cambios: contar('sin_cambios'), errores: contar('error'),
        variacion_promedio_pct: variaciones.length ? Math.round(variaciones.reduce((a, b) => a + b, 0) / variaciones.length) / 10 : null,
        kits_afectados: kits[0].n, kits_total: total[0].n,
      },
      filas: resultado,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Imágenes por código (el nombre del archivo es el código del producto)
// ---------------------------------------------------------------------------------------------

export async function verificarImagenes(nombres) {
  if (!Array.isArray(nombres) || !nombres.length) throw falla(400, 'No llegaron archivos.');
  if (nombres.length > 500) throw falla(400, 'Carga como máximo 500 imágenes a la vez.');
  const codigos = nombres.map((n) => String(n).replace(/\.[^.]+$/, '').trim());
  const { rows } = await consulta('SELECT id, nombre, codigo_erp FROM productos WHERE NOT eliminado AND lower(codigo_erp) = ANY($1)', [codigos.map((x) => x.toLowerCase())]);
  const m = new Map(rows.map((p) => [p.codigo_erp.toLowerCase(), p]));
  return nombres.map((archivo, i) => {
    const p = m.get(codigos[i].toLowerCase());
    return { archivo, codigo: codigos[i], producto_id: p?.id ?? null, producto: p?.nombre ?? null };
  });
}

export async function asignarImagenes(asignaciones) {
  if (!Array.isArray(asignaciones) || !asignaciones.length) throw falla(400, 'No hay imágenes para asignar.');
  return enTransaccion(async (c) => {
    let n = 0;
    for (const a of asignaciones) {
      if (!RUTA_IMAGEN.test(String(a?.ruta ?? ''))) throw falla(400, 'Una imagen no se subió bien.');
      const r = await c.query("UPDATE productos SET imagen_url = $2, modificado = TRUE, actualizado_en = now() AT TIME ZONE 'America/Lima' WHERE id = $1 AND NOT eliminado", [Number(a.producto_id), a.ruta]);
      n += r.rowCount;
    }
    return { asignadas: n };
  });
}
