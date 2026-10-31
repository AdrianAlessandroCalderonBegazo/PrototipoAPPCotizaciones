/**
 * Gasto digital: se eligen varias capturas de Yape o del BCP a la vez, se leen en el teléfono (OCR) y se revisa cada una
 * antes de registrarla. Cada captura queda como foto de su gasto. Si el n.º de operación ya está registrado, se avisa y no se duplica.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../../theme";
import { BottomBar, Cuerpo, DateField, FieldLabel, Header, PrimaryButton, Screen, SecondaryButton, TextField } from "../../components/ui";
import { Franja } from "../../components/icr";
import { ANCHO } from "../../lib/layout";
import { today } from "../../lib/format";
import * as icr from "../../lib/icr/api";
import { sugerir } from "../../lib/icr/captura";
import { leerMonto, soles } from "../../lib/icr/dinero";
import { elegirCapturas } from "../../lib/icr/foto";
import { nuevoId } from "../../lib/icr/ids";
import { crearLector, type Lector } from "../../lib/icr/lector";
import type { Resumen } from "../../lib/icr/tipos";

type Item = {
  id: string; uri: string; leyendo: boolean; incluir: boolean;
  fecha: string; monto: string; destinatario: string; operacion: string; descripcion: string; categoria: string; subcategoria: string;
  avisos: string[];
  estado: "pendiente" | "registrada" | "repetida" | "error"; error?: string;
};

export function Capturas({ opciones, onCerrar, onListo, topInset, bottomInset }: {
  opciones: Pick<Resumen, "categorias" | "subcategorias" | "categoria_deposito">;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  topInset: number;
  bottomInset: number;
}) {
  const cats = opciones.categorias.EGRESO;
  const [items, setItems] = useState<Item[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const lector = useRef<Lector | null>(null);
  useEffect(() => () => void lector.current?.cerrar(), []);
  const cambiar = (id: string, d: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...d } : x)));

  const elegir = async () => {
    setError(null);
    let uris: string[];
    try {
      uris = await elegirCapturas();
    } catch {
      setError("No se pudieron abrir las capturas.");
      return;
    }
    if (!uris.length) return;
    const nuevos: Item[] = uris.map((uri) => ({ id: nuevoId(), uri, leyendo: true, incluir: true, fecha: today(), monto: "", destinatario: "", operacion: "", descripcion: "", categoria: "", subcategoria: "", avisos: [], estado: "pendiente" }));
    setItems((xs) => [...xs, ...nuevos]);
    lector.current ??= crearLector();
    // una por una: el lector es pesado y así se ve el avance
    for (const it of nuevos) {
      try {
        const b = sugerir(await lector.current.leer(it.uri), today(), cats);
        cambiar(it.id, { ...b, leyendo: false });
      } catch (e) {
        cambiar(it.id, { leyendo: false, avisos: [e instanceof Error ? e.message : "No se pudo leer: llena los datos a mano."] });
      }
    }
  };

  const faltaDe = (x: Item) => (!leerMonto(x.monto) ? "monto" : !x.descripcion.trim() ? "descripción" : !x.categoria ? "categoría" : (opciones.subcategorias[x.categoria] ?? []).length && !x.subcategoria ? "subcategoría" : x.fecha > today() ? "fecha" : null);
  const porRegistrar = items.filter((x) => x.incluir && x.estado !== "registrada" && x.estado !== "repetida");
  const leyendo = items.some((x) => x.leyendo);
  const total = porRegistrar.reduce((s, x) => s + Math.round(Number(leerMonto(x.monto) ?? 0) * 100), 0);

  const registrar = async () => {
    const incompleta = porRegistrar.find((x) => faltaDe(x));
    if (incompleta) {
      setAbierto(incompleta.id);
      setError(`A una captura le falta: ${faltaDe(incompleta)}.`);
      return;
    }
    setError(null);
    setAviso(null);
    setEnviando(true);
    let ok = 0;
    let repetidas = 0;
    let errores = 0;
    for (const x of porRegistrar) {
      try {
        const r = await icr.registrar({
          id: x.id, origen: "CAPTURA", medio: "DIGITAL", fecha: x.fecha, monto: leerMonto(x.monto)!, descripcion: x.descripcion, categoria: x.categoria,
          subcategoria: x.subcategoria || null, destinatario: x.destinatario || null, operacion: x.operacion || null,
        });
        if (!r.repetido || !r.mov.adjuntos.length) await icr.subirFoto(r.mov.id, x.uri);
        cambiar(x.id, { estado: "registrada", error: undefined });
        ok++;
      } catch (e) {
        if (e instanceof icr.IcrError && e.datos.duplicado) {
          cambiar(x.id, { estado: "repetida", error: e.message });
          repetidas++;
        } else {
          cambiar(x.id, { estado: "error", error: e instanceof Error ? e.message : "No se pudo registrar." });
          errores++;
        }
      }
    }
    setEnviando(false);
    // si todo salió (o ya estaba), se vuelve al inicio; si alguna falló, se queda para reintentarla
    if (!errores && !repetidas) onListo(`${ok} gasto${ok === 1 ? "" : "s"} digital${ok === 1 ? "" : "es"} registrado${ok === 1 ? "" : "s"}.`);
    else if (!errores) setAviso(`${ok} registrado${ok === 1 ? "" : "s"}; ${repetidas} ya estaba${repetidas === 1 ? "" : "n"} registrada${repetidas === 1 ? "" : "s"} (no se duplicó).`);
    else setError(`${errores} no se pudo registrar. Revisa el aviso en cada captura y vuelve a pulsar «Registrar».`);
  };

  return (
    <Screen>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header kicker="CAJA ICR" title="Gasto digital" sub="Yape y transferencias: sube las capturas (varias a la vez) y revisa lo que se leyó." onBack={onCerrar} topInset={topInset} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Cuerpo ancho={ANCHO.formulario - 40} style={{ gap: 14 }}>
            <SecondaryButton label={items.length ? "+ AGREGAR MÁS CAPTURAS" : "ELEGIR CAPTURAS DE LA GALERÍA"} onPress={() => void elegir()} />
            {!items.length ? <Franja texto="Sale del saldo digital de la caja. La captura queda guardada como comprobante de cada gasto. Nada se registra hasta que pulses «Registrar»." /> : null}
            {items.map((x, i) => {
              const ab = abierto === x.id;
              const listo = x.estado === "registrada" || x.estado === "repetida";
              const falta = faltaDe(x);
              return (
                <View key={x.id} style={[card(16), { padding: 12, gap: 12, opacity: x.incluir || listo ? 1 : 0.55, borderColor: x.estado === "error" ? C.red : C.line }]}>
                  <Pressable onPress={() => !listo && setAbierto(ab ? null : x.id)} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <Image source={{ uri: x.uri }} style={{ width: 54, height: 80, borderRadius: 8, backgroundColor: C.stripeB }} resizeMode="cover" />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={kicker(C.muted, 9.5)}>CAPTURA {i + 1}</Text>
                      {x.leyendo ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><ActivityIndicator color={C.teal} /><Text style={t(12.5, 600, C.muted)}>Leyendo…</Text></View> : (
                        <>
                          <Text style={t(15, 800)}>{leerMonto(x.monto) ? soles(leerMonto(x.monto)) : "Monto sin leer"}</Text>
                          <Text style={t(12, 500, C.muted)} numberOfLines={1}>{[x.destinatario || null, x.categoria || "Sin categoría", x.fecha.split("-").reverse().join("/")].filter(Boolean).join(" · ")}</Text>
                        </>
                      )}
                      {x.estado === "registrada" ? <Text style={t(11.5, 800, C.teal)}>✓ REGISTRADA</Text> : x.estado === "repetida" ? <Text style={t(11.5, 800, "#8A5A00")}>YA ESTABA REGISTRADA</Text> : x.estado === "error" ? <Text style={t(11.5, 700, C.red)} numberOfLines={2}>{x.error}</Text> : !x.leyendo && falta ? <Text style={t(11.5, 700, C.red)}>Falta: {falta}</Text> : null}
                    </View>
                    {!listo ? (
                      <Pressable onPress={() => cambiar(x.id, { incluir: !x.incluir })} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: x.incluir }} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: x.incluir ? C.teal : C.border, backgroundColor: x.incluir ? C.teal : C.card, alignItems: "center", justifyContent: "center" }}>
                        {x.incluir ? <Text style={t(15, 800, C.white)}>✓</Text> : null}
                      </Pressable>
                    ) : null}
                  </Pressable>
                  {x.estado === "repetida" ? <Franja tono="alerta" texto={x.error ?? "Esta operación ya está registrada."} /> : null}
                  {ab && !listo ? (
                    <View style={{ gap: 12 }}>
                      {x.avisos.map((a) => <Franja key={a} tono="alerta" texto={a} />)}
                      <View><FieldLabel>Monto</FieldLabel><TextField value={x.monto} onChangeText={(v) => cambiar(x.id, { monto: v })} keyboardType="decimal-pad" placeholder="0.00" /></View>
                      <View><FieldLabel>Fecha</FieldLabel><DateField value={x.fecha} onChange={(v) => cambiar(x.id, { fecha: v })} /></View>
                      <View><FieldLabel>Descripción</FieldLabel><TextField value={x.descripcion} onChangeText={(v) => cambiar(x.id, { descripcion: v })} placeholder="Ej. Pasaje a Moquegua" maxLength={300} /></View>
                      <View>
                        <FieldLabel>Categoría</FieldLabel>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {cats.map((c) => {
                            const on = c === x.categoria;
                            return (
                              <Pressable key={c} onPress={() => cambiar(x.id, { categoria: c, subcategoria: "" })} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? C.teal : C.border, backgroundColor: on ? C.teal : C.card }}>
                                <Text style={t(12, 700, on ? C.white : C.ink)}>{c}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {x.categoria === opciones.categoria_deposito ? <View style={{ marginTop: 8 }}><Franja tono="alerta" texto="Este monto pasará a la cuenta principal del ERP." /></View> : null}
                      </View>
                      {(opciones.subcategorias[x.categoria] ?? []).length ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {opciones.subcategorias[x.categoria].map((s) => {
                            const on = s === x.subcategoria;
                            return (
                              <Pressable key={s} onPress={() => cambiar(x.id, { subcategoria: s })} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? C.navy : C.border, backgroundColor: on ? C.navy : C.card }}>
                                <Text style={t(12, 700, on ? C.white : C.ink)}>{s}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                      <View><FieldLabel optional>A quién se pagó</FieldLabel><TextField value={x.destinatario} onChangeText={(v) => cambiar(x.id, { destinatario: v })} maxLength={160} /></View>
                      <View><FieldLabel optional>N.º de operación</FieldLabel><TextField value={x.operacion} onChangeText={(v) => cambiar(x.id, { operacion: v.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={40} /></View>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {aviso ? <Franja tono="alerta" texto={aviso} /> : null}
            {error ? <Franja tono="error" texto={error} /> : null}
          </Cuerpo>
        </ScrollView>
        {porRegistrar.length ? (
          <BottomBar bottomInset={bottomInset}>
            {enviando ? <ActivityIndicator color={C.teal} style={{ height: 54 }} /> : leyendo ? <Text style={t(13, 700, C.muted, { textAlign: "center", paddingVertical: 18 })}>Esperando que se lean las capturas…</Text> : <PrimaryButton label={`REGISTRAR ${porRegistrar.length} · ${soles((total / 100).toFixed(2))}`} onPress={() => void registrar()} />}
          </BottomBar>
        ) : null}
      </View>
    </Screen>
  );
}
