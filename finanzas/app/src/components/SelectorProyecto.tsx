import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { C, t } from "../theme";
import { apiJson } from "../lib/api";

export type ProyectoOpcion = { id: number; codigo: string; nombre: string };

/** Proyectos activos del ERP (para la categoría «Gasto de proyecto»). Se piden cada vez que se abre el selector. */
export function useProyectosActivos() {
  const [estado, setEstado] = useState<{ cargando: boolean; disponible: boolean; proyectos: ProyectoOpcion[]; error: string | null }>({ cargando: true, disponible: true, proyectos: [], error: null });
  useEffect(() => {
    let vivo = true;
    apiJson<{ disponible: boolean; proyectos: ProyectoOpcion[] }>("GET", "/caja/proyectos")
      .then((r) => vivo && setEstado({ cargando: false, disponible: r.disponible, proyectos: r.proyectos, error: null }))
      .catch((e) => vivo && setEstado({ cargando: false, disponible: true, proyectos: [], error: e instanceof Error ? e.message : "No se pudo cargar." }));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

/**
 * Lista de proyectos activos para asignar un gasto. Si el gasto ya tenía un proyecto que luego se pausó, se sigue mostrando
 * (el servidor lo respeta al corregir el gasto).
 */
export function SelectorProyecto({ value, nombreActual, onPick }: { value: number | null; nombreActual?: string | null; onPick: (p: ProyectoOpcion) => void }) {
  const { cargando, disponible, proyectos, error } = useProyectosActivos();
  if (cargando) return <ActivityIndicator color={C.teal} style={{ alignSelf: "flex-start", marginVertical: 8 }} />;
  if (error) return <Text style={t(12.5, 600, C.red)}>{error}</Text>;
  if (!disponible) return <Text style={t(12.5, 600, C.muted, { lineHeight: 18 })}>Los proyectos del ERP todavía no están disponibles en el servidor.</Text>;
  const lista = value && !proyectos.some((p) => p.id === value) ? [{ id: value, codigo: "", nombre: `${nombreActual ?? "Proyecto"} (ya no está activo)` }, ...proyectos] : proyectos;
  if (!lista.length) return <Text style={t(12.5, 600, C.muted, { lineHeight: 18 })}>No hay proyectos activos. Pídele a Contabilidad o a un administrador que lo cree en el ERP.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {lista.map((p) => {
        const activo = p.id === value;
        return (
          <Pressable
            key={p.id}
            onPress={() => onPick(p)}
            accessibilityRole="radio"
            accessibilityState={{ selected: activo }}
            style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: activo ? C.teal : C.card, borderColor: activo ? C.teal : C.border }}
          >
            {p.codigo ? <Text style={t(11.5, 800, activo ? C.white : C.muted)}>{p.codigo}</Text> : null}
            <Text style={t(13.5, 700, activo ? C.white : C.ink, { flex: 1 })} numberOfLines={2}>{p.nombre}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
