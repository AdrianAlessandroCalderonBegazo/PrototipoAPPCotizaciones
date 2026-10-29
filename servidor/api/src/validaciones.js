// Validaciones de documentos peruanos (se usan en Configuración y en Facturación).

/** DNI: 8 dígitos. */
export const dniValido = (v) => /^\d{8}$/.test(String(v ?? '').trim());

/**
 * RUC: 11 dígitos, empieza con 10, 15, 16, 17 o 20, y el último es el dígito verificador
 * (pesos 5,4,3,2,7,6,5,4,3,2 sobre los 10 primeros; 11 − (suma mod 11), con 10 → 0 y 11 → 1).
 */
export function rucValido(v) {
  const r = String(v ?? '').trim();
  if (!/^(10|15|16|17|20)\d{9}$/.test(r)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * Number(r[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 10) dv = 0;
  if (dv === 11) dv = 1;
  return dv === Number(r[10]);
}
