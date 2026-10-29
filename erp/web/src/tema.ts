export type Tema = "light" | "dark";

export const temaActual = (): Tema => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ponerTema(t: Tema) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("erp.tema", t);
  } catch {
    // sin almacenamiento: dura lo que dure la pestaña
  }
}
