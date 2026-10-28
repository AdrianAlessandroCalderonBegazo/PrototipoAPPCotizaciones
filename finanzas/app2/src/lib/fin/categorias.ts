/** Categorías de ingresos y egresos. Las de egreso son las que ya usaba el ERP; "Caja chica" desaparece (ahora es una cuenta). */
export const CATEGORIAS_EGRESO = ["Equipos", "Movilidad", "Material", "Oficina", "Fletes", "Viáticos", "Proveedores", "Gastos fijos"] as const;
export const CATEGORIAS_INGRESO = ["Venta", "Obra / Proyecto", "Otro"] as const;

/** Segundo selector: permite saber, por ejemplo, cuánto se gasta en menús y cuánto en pasajes. */
export const SUBCATEGORIAS: Record<string, readonly string[]> = {
  Viáticos: ["Menú", "Alojamiento", "Otro"],
  Movilidad: ["Pasajes", "Combustible", "Otro"],
  "Gastos fijos": ["Sueldos", "Alquiler", "Servicios"],
};
/** Estas exigen subcategoría; en el resto es opcional. */
export const SUBCATEGORIA_OBLIGATORIA = new Set(["Gastos fijos"]);

export const catLabel = (categoria: string, subcategoria?: string) => (subcategoria ? `${categoria} · ${subcategoria}` : categoria);

/** Valores que ya entiende el ERP (mismos que usaba ICR Finanzas 1). */
const ERP_EGRESO: Record<string, string> = { Equipos: "EQUIPOS_OBRA", Movilidad: "MOVILIDAD", Material: "MATERIAL", Oficina: "OFICINA", Fletes: "FLETES", Viáticos: "VIATICOS", Proveedores: "OTROS", "Gastos fijos": "OTROS" };
const ERP_SUB: Record<string, string> = { Sueldos: "SUELDO", Alquiler: "ALQUILER", Servicios: "SERVICIOS" };
export const categoriaErp = (categoria: string, subcategoria: string) => (categoria === "Gastos fijos" && subcategoria ? ERP_SUB[subcategoria] ?? "OTROS" : ERP_EGRESO[categoria] ?? "OTROS");
