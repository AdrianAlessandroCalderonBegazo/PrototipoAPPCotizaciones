// Dinero sin coma flotante: los montos viajan como texto («1234.50») y se suman en céntimos enteros.
// (La conexión a la base convierte NUMERIC a número; por eso las consultas de dinero piden ::text.)
import { falla } from './errores.js';

const PATRON = /^-?\d{1,12}(\.\d{1,2})?$/;

/** «1234.5» → 123450 (céntimos). Lanza si el texto no es un monto. */
export function aCentimos(v) {
  const t = String(v ?? '').trim();
  if (!PATRON.test(t)) throw new Error(`Monto no válido: ${t}`);
  const negativo = t.startsWith('-');
  const [ent, dec = ''] = t.replace('-', '').split('.');
  const c = Number(ent) * 100 + Number(dec.padEnd(2, '0'));
  return negativo ? -c : c;
}

/** 123450 → «1234.50». */
export function deCentimos(c) {
  const negativo = c < 0;
  const a = Math.abs(c);
  return `${negativo ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** Texto de la base (o null) → texto normalizado con 2 decimales (o null). */
export const monto = (v) => (v === null || v === undefined ? null : deCentimos(aCentimos(v)));

/** Suma una lista de montos en texto. */
export const sumar = (lista) => deCentimos(lista.reduce((s, v) => s + (v === null || v === undefined ? 0 : aCentimos(v)), 0));

/**
 * Monto que escribe una persona: positivo, máximo 2 decimales. Acepta «1,234.50» o «1234,5».
 * Devuelve el texto normalizado («1234.50») para guardarlo tal cual en una columna NUMERIC.
 */
export function montoEntrada(v, nombre = 'El monto') {
  let t = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) throw falla(400, `${nombre} debe ser un número con hasta 2 decimales (por ejemplo 1250.50).`);
  const c = aCentimos(t);
  if (c <= 0) throw falla(400, `${nombre} debe ser mayor a 0.`);
  return deCentimos(c);
}
