// Cómo se lee un registro de auditoría: qué campos cambiaron, con su valor anterior y el nuevo.
export type Diferencia = { campo: string; antes: string; despues: string };

const mostrar = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "Sin dato";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Campos que cambiaron entre `antes` y `despues` (un nivel de profundidad; los objetos anidados se recorren con «a.b»). */
export function diferencias(antes: unknown, despues: unknown, prefijo = ""): Diferencia[] {
  if (!esObjeto(antes) && !esObjeto(despues)) {
    return JSON.stringify(antes) === JSON.stringify(despues) ? [] : [{ campo: prefijo || "valor", antes: mostrar(antes), despues: mostrar(despues) }];
  }
  const a = esObjeto(antes) ? antes : {};
  const d = esObjeto(despues) ? despues : {};
  const out: Diferencia[] = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(d)])]) {
    const campo = prefijo ? `${prefijo}.${k}` : k;
    if (esObjeto(a[k]) || esObjeto(d[k])) out.push(...diferencias(a[k] ?? null, d[k] ?? null, campo));
    else if (JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null)) out.push({ campo, antes: mostrar(a[k]), despues: mostrar(d[k]) });
  }
  return out;
}

export const ACCIONES: Record<string, string> = { crear: "Creó", editar: "Cambió", eliminar: "Eliminó", cambiar_clave: "Cambió la clave de" };
export const ENTIDADES: Record<string, string> = {
  usuario: "usuario", permisos: "matriz de permisos", empresa: "datos de la empresa", parametros: "parámetros",
  numeracion_cotizacion: "numeración de cotizaciones", clave_edicion: "clave de edición", requerimiento: "requerimiento",
  salida_herramientas: "salida de herramientas", cotizacion: "cotización",
};
