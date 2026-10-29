// Las tablas de la caja (caja_chica_mov, caja_fila…) las crea la API de Finanzas en la misma base.
// Si todavía no existen (o les falta la migración 005), el ERP sigue funcionando y muestra la caja como «no disponible».
import { consulta } from './db.js';

let lista = false;
let revisadaEn = 0;

export async function cajaDisponible() {
  if (lista) return true;
  if (Date.now() - revisadaEn < 30_000) return false;
  revisadaEn = Date.now();
  const { rows } = await consulta(
    `SELECT to_regclass('public.caja_chica_mov') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caja_chica_mov' AND column_name = 'proyecto_id') AS ok`,
  );
  lista = !!rows[0]?.ok;
  return lista;
}

/** Para pruebas: vuelve a revisar en el próximo pedido. */
export const olvidarCaja = () => {
  lista = false;
  revisadaEn = 0;
};
