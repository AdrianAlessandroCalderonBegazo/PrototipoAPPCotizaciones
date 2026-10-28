import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../theme";
import { Miniatura } from "../components/fin";
import { usePuerta } from "../components/Codigo";
import { BottomBar, Header, PrimaryButton, Screen, SecondaryButton } from "../components/ui";
import { MovForm, type ValoresMov } from "./MovForm";
import { aplicarGuardado } from "./acciones";
import type { FotoItem } from "../components/fin";
import { money, horaActual, today } from "../lib/format";
import { sugerir } from "../lib/fin/captura";
import { r2, validarMov } from "../lib/fin/calc";
import { catLabel } from "../lib/fin/categorias";
import { diaCerrado } from "../lib/fin/bloqueo";
import { elegirFotos } from "../lib/fin/foto";
import { borrarFoto, type FotoGuardada } from "../lib/fin/fotos";
import { nuevoId } from "../lib/fin/ids";
import { crearLector, type Lector } from "../lib/fin/lector";
import { store } from "../lib/fin/runtime";
import type { NuevoMov, State } from "../lib/fin/store";

type Item = {
  id: string;
  foto: FotoGuardada;
  uri: string;
  estado: "leyendo" | "listo" | "error";
  error?: string;
  valores?: ValoresMov;
  avisos: string[];
  /** Fotos del movimiento (la captura y las que se agreguen al revisar). */
  fotos?: FotoItem[];
  incluir: boolean;
};

const valoresDe = (b: ReturnType<typeof sugerir>): ValoresMov => ({
  tipo: b.tipo, fecha: b.fecha, hora: b.hora, cuenta_id: b.cuenta_id, destino_id: b.destino_id, monto: b.monto, categoria: b.categoria, subcategoria: b.subcategoria, concepto: b.concepto,
  pagado_a: b.pagado_a, pagado_a_id: b.pagado_a_id, para: b.para, nro_operacion: b.nro_operacion, origen: "CAPTURA",
});

/** ¿Está bien tal cual, sin nada que mirar? Solo esas se incluyen solas. */
const listo = (v: ValoresMov | undefined, avisos: string[], caja: State) =>
  !!v && !avisos.length && Object.keys(validarMov({ tipo: v.tipo ?? "EGRESO", fecha: v.fecha ?? "", cuenta_id: v.cuenta_id ?? "", destino_id: v.destino_id ?? "", monto: v.monto ?? 0, categoria: v.categoria ?? "", subcategoria: v.subcategoria ?? "", para: v.para ?? [] }, caja.cuentas)).length === 0;

/** Lo mismo en dos capturas del lote (misma operación en la misma cuenta): la segunda se marca y se deja fuera. */
function marcarRepetidas(items: Item[]): Item[] {
  const vistos = new Set<string>();
  return items.map((it) => {
    const nro = it.valores?.nro_operacion?.trim();
    if (!nro) return it;
    const clave = `${it.valores?.cuenta_id}|${nro}`;
    if (vistos.has(clave)) return { ...it, incluir: false, avisos: it.avisos.some((a) => /repetida/.test(a)) ? it.avisos : [...it.avisos, `Captura repetida en este lote (operación ${nro}).`] };
    vistos.add(clave);
    return it;
  });
}

/** Lote de capturas: se eligen varias de la galería, se leen solas y se confirman todas juntas (revisando solo las dudosas). */
export function Lote({ caja, onClose, topInset, bottomInset }: { caja: State; onClose: () => void; topInset: number; bottomInset: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [descartar, setDescartar] = useState(false);
  const [error, setError] = useState("");
  const puerta = usePuerta(bottomInset);
  const cajaRef = useRef(caja);
  cajaRef.current = caja;
  const lector = useRef<Lector | null>(null);
  useEffect(() => () => void lector.current?.cerrar(), []);

  const elegir = async () => {
    setError("");
    let picks;
    try {
      picks = await elegirFotos();
    } catch {
      return setError("No se pudieron abrir las fotos.");
    }
    if (!picks.length) return;
    const nuevos: Item[] = picks.map((p) => ({ id: nuevoId(), foto: p.guardada, uri: p.uri, estado: "leyendo", avisos: [], incluir: false }));
    setItems((prev) => [...prev, ...nuevos]);
    lector.current ??= crearLector();
    for (const it of nuevos) {
      try {
        const c = await lector.current.leer(it.uri);
        const k = cajaRef.current;
        const b = sugerir(c, { cuentas: k.cuentas, personas: k.personas, movs: k.movs, miCuentaId: k.miCuentaId, hoy: today(), ahora: horaActual() });
        const v = valoresDe(b);
        const avisos = b.avisos;
        setItems((prev) => marcarRepetidas(prev.map((x) => (x.id === it.id ? { ...x, estado: "listo", valores: v, avisos, fotos: [{ id: nuevoId(), nueva: it.foto }], incluir: listo(v, avisos, k) } : x))));
      } catch (e) {
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, estado: "error", error: e instanceof Error ? e.message : "No se pudo leer la captura." } : x)));
      }
    }
  };

  const quitar = (id: string) =>
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) for (const f of it.fotos ?? [{ id: "", nueva: it.foto }]) if (f.nueva) void borrarFoto(f.nueva.key);
      return prev.filter((x) => x.id !== id);
    });

  const leyendo = items.some((i) => i.estado === "leyendo");
  const incluidos = items.filter((i) => i.incluir && i.estado === "listo" && i.valores);
  const total = r2(incluidos.reduce((a, i) => a + (i.valores?.monto ?? 0), 0));

  const registrar = () => {
    const hacer = () => {
      for (const it of incluidos) {
        const v = it.valores!;
        const m: NuevoMov = {
          id: nuevoId(), tipo: v.tipo!, fecha: v.fecha!, hora: v.hora ?? horaActual(), cuenta_id: v.cuenta_id!, destino_id: v.destino_id ?? "", monto: v.monto!, categoria: v.categoria ?? "", subcategoria: v.subcategoria ?? "",
          concepto: v.concepto ?? "", pagado_a: v.pagado_a ?? "", pagado_a_id: v.pagado_a_id ?? "", para: v.para ?? [], nro_operacion: v.nro_operacion ?? "", origen: "CAPTURA",
        };
        aplicarGuardado(m, it.fotos ?? [{ id: nuevoId(), nueva: it.foto }]);
      }
      store.avisar(`Se registraron ${incluidos.length} ${incluidos.length === 1 ? "movimiento" : "movimientos"} por ${money(total)}.`, 4000);
      const quedan = items.filter((i) => !incluidos.includes(i));
      if (!quedan.length) return onClose();
      setItems(quedan);
    };
    puerta.pedir(incluidos.some((i) => diaCerrado(i.valores!.fecha!, today())), hacer, "Hay capturas de una fecha antigua: hace falta el código para registrarlas.");
  };

  const salir = () => {
    if (items.length && !descartar) return setDescartar(true);
    for (const it of items) for (const f of it.fotos ?? [{ id: "", nueva: it.foto }]) if (f.nueva) void borrarFoto(f.nueva.key);
    onClose();
  };

  const editado = items.find((i) => i.id === editando);
  if (editado)
    return (
      <MovForm
        caja={caja} inicial={editado.valores} fotoInicial={editado.foto} titulo="Revisar captura" aviso={editado.avisos}
        onGuardar={(m, fotos) => {
          const { id: _id, ...v } = m;
          setItems((prev) => marcarRepetidas(prev.map((x) => (x.id === editado.id ? { ...x, valores: v, fotos, avisos: [], incluir: true } : x))));
          setEditando(null);
        }}
        onClose={() => setEditando(null)} topInset={topInset} bottomInset={bottomInset}
      />
    );

  const nombreCuenta = (id?: string) => caja.cuentas.find((c) => c.id === id)?.nombre ?? "—";

  return (
    <Screen>
      <Header kicker="CAPTURAS" title="Subir capturas" sub="Yape y BCP: se leen solas, tú solo confirmas" onBack={salir} topInset={topInset} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => void elegir()} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: pressed ? C.tintPressed : C.tint, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: C.teal, padding: 22, alignItems: "center", gap: 8 })}>
          <Text style={t(26, 700, C.teal)}>↑</Text>
          <Text style={t(14, 800, C.ink)}>Toca para elegir las capturas</Text>
          <Text style={t(11.5, 400, C.muted, { textAlign: "center", lineHeight: 16 })}>Puedes elegir varias de una vez. Las del BCP y las de Yape se reconocen solas.</Text>
        </Pressable>
        {error ? <Text style={t(12, 600, C.red)}>{error}</Text> : null}

        {items.map((it) => {
          const v = it.valores;
          const dup = it.avisos.find((a) => /ya está registrada|repetida/.test(a));
          return (
            <View key={it.id} style={[card(16), { padding: 12, gap: 10, borderColor: it.estado === "error" || dup ? C.red : C.line }]}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Miniatura item={{ id: it.id, nueva: it.foto }} onVer={() => {}} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  {it.estado === "leyendo" ? <Text style={t(13, 700, C.muted)}>Leyendo…</Text> : null}
                  {it.estado === "error" ? <Text style={t(12.5, 700, C.red)}>{it.error}</Text> : null}
                  {v ? (
                    <>
                      <Text style={t(19, 800, v.tipo === "TRASPASO" ? C.navy : C.red, { fontVariant: ["tabular-nums"] })}>{v.monto ? money(v.monto) : "Falta el monto"}</Text>
                      <Text numberOfLines={1} style={t(12.5, 700)}>{v.tipo === "TRASPASO" ? `Traspaso a ${nombreCuenta(v.destino_id)}` : v.pagado_a || "Sin nombre"}</Text>
                      <Text numberOfLines={2} style={t(11.5, 400, C.muted, { lineHeight: 16 })}>
                        {[nombreCuenta(v.cuenta_id), v.categoria ? catLabel(v.categoria, v.subcategoria) : v.tipo !== "TRASPASO" ? "Sin categoría" : null, v.concepto || null, v.fecha].filter(Boolean).join(" · ")}
                      </Text>
                      {v.para?.length ? <Text numberOfLines={1} style={t(11.5, 600, C.teal)}>Para: {v.para.map((p) => caja.personas.find((x) => x.id === p.persona_id)?.nombre.split(" ")[0] ?? "—").join(", ")}</Text> : null}
                    </>
                  ) : null}
                </View>
              </View>
              {it.avisos.map((a) => (
                <Text key={a} style={t(11.5, 700, dup === a ? C.red : "#8A5A00", { lineHeight: 16 })}>• {a}</Text>
              ))}
              {it.estado !== "leyendo" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
                  {v ? (
                    <Pressable onPress={() => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, incluir: !x.incluir } : x)))} accessibilityRole="checkbox" accessibilityState={{ checked: it.incluir }} accessibilityLabel="Incluir en el registro">
                      <Text style={t(12, 800, it.incluir ? C.teal : C.muted)}>{it.incluir ? "☑ Se registra" : "☐ No se registra"}</Text>
                    </Pressable>
                  ) : null}
                  {v ? (
                    <Pressable onPress={() => setEditando(it.id)} accessibilityRole="button" accessibilityLabel="Revisar captura">
                      <Text style={t(12, 800, C.teal)}>Revisar ›</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => quitar(it.id)} accessibilityRole="button" accessibilityLabel="Quitar captura">
                    <Text style={t(12, 800, C.red)}>Quitar</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
        {!items.length ? <Text style={t(12, 400, C.muted, { textAlign: "center", lineHeight: 18 })}>Las capturas se leen en este mismo dispositivo; no se envían a ningún servicio externo.</Text> : null}
      </ScrollView>
      <BottomBar bottomInset={bottomInset}>
        <Text style={kicker(C.muted, 10)}>{items.length ? `${incluidos.length} DE ${items.length} LISTAS PARA REGISTRAR${incluidos.length ? ` · ${money(total)}` : ""}` : " "}</Text>
        <PrimaryButton label={leyendo ? "LEYENDO CAPTURAS…" : incluidos.length ? `REGISTRAR ${incluidos.length} ${incluidos.length === 1 ? "MOVIMIENTO" : "MOVIMIENTOS"}` : "REGISTRAR"} onPress={() => !leyendo && incluidos.length > 0 && registrar()} />
        {descartar && items.length ? <SecondaryButton label={`Descartar ${items.length} y salir`} onPress={salir} danger /> : null}
      </BottomBar>
      {puerta.modal}
    </Screen>
  );
}
