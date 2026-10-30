// Cálculo de una cotización, exacto (enteros, nunca coma flotante). Los precios del catálogo INCLUYEN IGV:
//   importe de línea = cantidad × precio unitario − descuento % de la línea
//   total            = Σ importes − descuento comercial
//   valor de venta   = total ÷ 1.18   ·   IGV = total − valor de venta
// La misma cuenta está en erp/web/src/paginas/cotizacion/calculo.ts (para la vista previa); el servidor manda.
import { falla } from './errores.js';

export const IGV_PCT = 18;

/** «12.5» → 1250n (centésimas), con hasta 2 decimales. */
function centesimas(v, nombre, { min = 0n, max = 10n ** 14n } = {}) {
  let t = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) throw falla(400, `${nombre} debe ser un número con hasta 2 decimales.`);
  const [e, d = ''] = t.split('.');
  const n = BigInt(e) * 100n + BigInt(d.padEnd(2, '0'));
  if (n < min || n > max) throw falla(400, `${nombre} está fuera de rango.`);
  return n;
}

/** División entera redondeando la mitad hacia arriba (montos positivos). */
const div = (a, b) => (a * 2n + b) / (b * 2n);

export const texto = (c) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};

/**
 * items: [{ descripcion, cantidad, precio_unitario, descuento_pct?, producto_id?, codigo?, unidad? }]
 * descuento: descuento comercial global en soles (texto).
 * Devuelve las líneas normalizadas (montos en texto) y los totales.
 */
export function calcular(items, descuento = '0') {
  if (!Array.isArray(items) || !items.length) throw falla(400, 'La cotización necesita al menos un ítem.');
  if (items.length > 300) throw falla(400, 'Una cotización puede tener como máximo 300 ítems.');
  let subtotal = 0n;
  let descLineas = 0n;
  const lineas = items.map((it, i) => {
    const n = i + 1;
    const descripcion = String(it?.descripcion ?? '').trim().slice(0, 255);
    if (!descripcion) throw falla(400, `El ítem ${n} no tiene descripción.`);
    const cant = centesimas(it.cantidad, `La cantidad del ítem ${n}`, { min: 1n });
    const precio = centesimas(it.precio_unitario ?? '0', `El precio del ítem ${n}`);
    const pct = centesimas(it.descuento_pct ?? '0', `El descuento del ítem ${n}`, { max: 10000n });
    const bruto = div(cant * precio, 100n);
    const desc = div(bruto * pct, 10000n);
    subtotal += bruto;
    descLineas += desc;
    return {
      producto_id: Number.isInteger(Number(it.producto_id)) && Number(it.producto_id) > 0 ? Number(it.producto_id) : null,
      codigo: it.codigo ? String(it.codigo).slice(0, 60) : null,
      descripcion,
      detalle: it.detalle ? String(it.detalle).slice(0, 500) : null,
      unidad: it.unidad ? String(it.unidad).slice(0, 40) : null,
      cantidad: texto(cant),
      precio_unitario: texto(precio),
      descuento_pct: texto(pct),
      importe_bruto: texto(bruto),
      descuento: texto(desc),
      importe: texto(bruto - desc),
    };
  });
  const global = centesimas(descuento || '0', 'El descuento comercial');
  if (global > subtotal - descLineas) throw falla(400, 'El descuento comercial no puede ser mayor que el total.');
  const total = subtotal - descLineas - global;
  const valorVenta = div(total * 100n, BigInt(100 + IGV_PCT));
  return {
    lineas,
    totales: {
      subtotal: texto(subtotal),
      descuento_lineas: texto(descLineas),
      descuento: texto(global),
      total: texto(total),
      valor_venta: texto(valorVenta),
      igv: texto(total - valorVenta),
    },
  };
}
