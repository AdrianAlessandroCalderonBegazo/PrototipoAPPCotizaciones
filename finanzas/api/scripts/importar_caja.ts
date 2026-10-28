/**
 * Importa las hojas de caja transcritas (ver src/importar.ts). Uso, dentro del contenedor:
 *   npx tsx scripts/importar_caja.ts /tmp/BD_CajaDiario              (simulacro: muestra qué haría, no cambia nada)
 *   npx tsx scripts/importar_caja.ts /tmp/BD_CajaDiario --confirmar  (BORRA lo anterior y carga las hojas)
 */
import { pgDb } from "../src/db";
import { diskStorage } from "../src/storage";
import { importarCaja } from "../src/importar";

const carpeta = process.argv[2];
const confirmar = process.argv.includes("--confirmar");
if (!carpeta || !process.env.DATABASE_URL) {
  console.error("Uso: DATABASE_URL=… npx tsx scripts/importar_caja.ts <carpeta con datos.json> [--confirmar]");
  process.exit(1);
}
const db = await pgDb(process.env.DATABASE_URL);
const r = await importarCaja({ db, storage: diskStorage(process.env.UPLOAD_DIR ?? "./uploads"), carpeta, confirmar, log: console.log });
const s = (n: number) => n.toFixed(2).padStart(9);
console.log(`\nSe borraría/borró: ${r.borrado.hojas} hojas, ${r.borrado.filas} movimientos de caja diaria, ${r.borrado.chica} de caja chica y ${r.borrado.fotos} fotos.`);
console.log(`Se carga: ${r.dias.length} días, ${r.filas} movimientos, ${r.fotos} fotos de recibos.\n`);
console.log("Día         Mov Fotos  Saldo ant.  Saldo final   Contado  Dif.");
for (const d of r.dias) console.log(`${d.fecha}  ${String(d.filas).padStart(3)} ${String(d.fotos).padStart(5)}  ${s(d.saldoAnterior)}  ${s(d.saldoFinal)}  ${s(d.contado)}  ${d.diferencia.toFixed(2)}`);
await db.close();
