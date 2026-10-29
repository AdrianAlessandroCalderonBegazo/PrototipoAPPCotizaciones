import type { Matriz, Nivel, Rol } from "../../tipos";

/** Al hacer clic en una celda: sin acceso → solo lectura → completo → sin acceso. */
export const siguienteNivel = (n: Nivel): Nivel => (n === "ninguno" ? "lectura" : n === "lectura" ? "completo" : "ninguno");

/** Cuántas celdas cambiaron (sin contar al administrador, que no se edita). */
export function cambiosMatriz(antes: Matriz, despues: Matriz): number {
  let n = 0;
  for (const rol of Object.keys(despues) as Rol[]) {
    if (rol === "admin") continue;
    for (const [mod, nivel] of Object.entries(despues[rol])) if (antes[rol]?.[mod as keyof Matriz[Rol]] !== nivel) n++;
  }
  return n;
}
