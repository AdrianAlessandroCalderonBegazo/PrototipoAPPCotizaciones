import { describe, expect, test } from "vitest";
import { cuando, fecha, iniciales, rucValido, texto, SIN_DATO } from "./formato";
import { menuDe, nivelDe, puede } from "./modulos";
import { cambiosMatriz, siguienteNivel } from "./paginas/configuracion/matrizLogica";
import { diferencias } from "./paginas/configuracion/auditoriaLogica";
import { enlaceApp } from "./enlaces";
import type { Matriz } from "./tipos";

describe("formato: lo desconocido es «Sin dato»", () => {
  test("texto y fechas vacías", () => {
    expect(texto(null)).toBe(SIN_DATO);
    expect(texto("  ")).toBe(SIN_DATO);
    expect(fecha(null)).toBe(SIN_DATO);
    expect(fecha("no es fecha")).toBe(SIN_DATO);
  });
  test("fechas de la base (hora de Lima, sin zona)", () => {
    expect(fecha("2026-10-29")).toBe("29/10/2026");
    expect(fecha("2026-10-29 23:30:00")).toBe("29/10/2026");
    const ahora = new Date("2026-10-29T15:00:00-05:00");
    expect(cuando("2026-10-29 10:24:00", ahora)).toBe("Hoy 10:24");
    expect(cuando("2026-10-28 18:40:00", ahora)).toBe("Ayer 18:40");
    expect(cuando(null, ahora)).toBe(SIN_DATO);
  });
  test("iniciales", () => {
    expect(iniciales("Rocío Valdivia")).toBe("RV");
    expect(iniciales("ana")).toBe("A");
  });
});

describe("RUC (igual que el servidor)", () => {
  test("válidos e inválidos", () => {
    expect(rucValido("20605309489")).toBe(true);
    expect(rucValido("20605309488")).toBe(false);
    expect(rucValido("2060530948")).toBe(false);
    expect(rucValido("30605309489")).toBe(false);
  });
});

describe("permisos en pantalla", () => {
  const ventas = { rol: "ventas" as const, niveles: { inicio: "lectura" as const, cotizacion: "completo" as const, configuracion: "ninguno" as const } };
  test("el administrador siempre tiene acceso completo", () => {
    expect(nivelDe({ rol: "admin", niveles: {} }, "facturacion")).toBe("completo");
  });
  test("cada rol ve solo los módulos con lectura o más", () => {
    expect(puede(ventas, "cotizacion", "completo")).toBe(true);
    expect(puede(ventas, "configuracion")).toBe(false);
    expect(puede(ventas, "proyectos")).toBe(false);
    const menu = menuDe(ventas).flatMap((g) => g.items.map((i) => i.clave));
    expect(menu).toEqual(["inicio", "cotizacion"]);
    expect(menuDe(null)).toEqual([]);
  });
});

describe("matriz de permisos", () => {
  test("clic en una celda: sin acceso → lectura → completo → sin acceso", () => {
    expect(siguienteNivel("ninguno")).toBe("lectura");
    expect(siguienteNivel("lectura")).toBe("completo");
    expect(siguienteNivel("completo")).toBe("ninguno");
  });
  test("cuenta los cambios sin contar al administrador", () => {
    const base = { admin: { inicio: "completo" }, ventas: { inicio: "lectura", proyectos: "ninguno" } } as unknown as Matriz;
    const nueva = structuredClone(base);
    expect(cambiosMatriz(base, nueva)).toBe(0);
    (nueva.ventas as Record<string, string>).proyectos = "lectura";
    (nueva.admin as Record<string, string>).inicio = "ninguno";
    expect(cambiosMatriz(base, nueva)).toBe(1);
  });
});

describe("auditoría: qué cambió", () => {
  test("campos cambiados, con anidados y sin datos", () => {
    const d = diferencias({ rol: "tecnico", activo: true, tc: { valor: "3.74", fecha: null } }, { rol: "ventas", activo: true, tc: { valor: "3.75", fecha: "2026-10-29" } });
    expect(d).toEqual([
      { campo: "rol", antes: "tecnico", despues: "ventas" },
      { campo: "tc.valor", antes: "3.74", despues: "3.75" },
      { campo: "tc.fecha", antes: "Sin dato", despues: "2026-10-29" },
    ]);
  });
  test("crear y eliminar", () => {
    expect(diferencias(null, { a: 1 })).toEqual([{ campo: "a", antes: "Sin dato", despues: "1" }]);
    expect(diferencias({ a: 1 }, null)).toEqual([{ campo: "a", antes: "1", despues: "Sin dato" }]);
    expect(diferencias(null, null)).toEqual([]);
  });
});

test("enlaces a las otras apps salen del dominio del ERP", () => {
  expect(enlaceApp("finanzas", "erp.icrenergy.tech")).toBe("https://finanzas.icrenergy.tech");
  expect(enlaceApp("cotizador", "localhost")).toBeNull();
});
