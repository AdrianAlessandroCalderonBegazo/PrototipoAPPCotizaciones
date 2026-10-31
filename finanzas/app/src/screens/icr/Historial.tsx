/** Historial de la Caja ICR: filtros (período, ingreso/egreso, efectivo/digital, texto, anulados) y la lista por día. */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { C, kicker, t } from "../../theme";
import { Chip, Cuerpo, DateField, TealGradient, TextField } from "../../components/ui";
import { Franja, MovFila } from "../../components/icr";
import { ANCHO } from "../../lib/layout";
import { fdateLarga, today } from "../../lib/format";
import { PRESETS, errorDeRango, rangoPreset, type Preset } from "../../lib/reportes/periodo";
import * as icr from "../../lib/icr/api";
import { soles } from "../../lib/icr/dinero";
import type { Mov } from "../../lib/icr/tipos";

const sumar = (xs: Mov[]) => (xs.reduce((s, m) => s + Math.round(Number(m.monto) * 100), 0) / 100).toFixed(2);

export function Historial({ version, onVer, topInset }: { version: number; onVer: (m: Mov) => void; topInset: number }) {
  const [preset, setPreset] = useState<Preset>("mes");
  const [rango, setRango] = useState(() => rangoPreset("mes", today()));
  const [tipo, setTipo] = useState<"" | "INGRESO" | "EGRESO">("");
  const [medio, setMedio] = useState<"" | "EFECTIVO" | "DIGITAL">("");
  const [q, setQ] = useState("");
  const [anulados, setAnulados] = useState(false);
  const [lista, setLista] = useState<Mov[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errRango = errorDeRango(rango.desde, rango.hasta);

  useEffect(() => {
    if (errRango) return;
    let vivo = true;
    setError(null);
    const id = setTimeout(() => {
      icr.movimientos({ desde: rango.desde, hasta: rango.hasta, tipo, medio, q: q.trim(), anulados: anulados ? "1" : undefined })
        .then((r) => vivo && setLista(r))
        .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."));
    }, q ? 350 : 0);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [rango.desde, rango.hasta, tipo, medio, q, anulados, version, errRango]);

  const dias = useMemo(() => {
    const g = new Map<string, Mov[]>();
    for (const m of lista ?? []) g.set(m.fecha, [...(g.get(m.fecha) ?? []), m]);
    return [...g.entries()];
  }, [lista]);
  const vivos = (lista ?? []).filter((m) => !m.anulado);
  const ingresos = sumar(vivos.filter((m) => m.tipo === "INGRESO"));
  const egresos = sumar(vivos.filter((m) => m.tipo === "EGRESO"));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
      <TealGradient ancho={ANCHO.lista} style={{ paddingTop: 22 + topInset, paddingHorizontal: 18, paddingBottom: 18 }}>
        <Text style={kicker("rgba(255,255,255,.9)")}>CAJA ICR</Text>
        <Text style={t(24, 800, C.white, { marginTop: 4 })}>Historial</Text>
        <Text style={t(12, 500, "rgba(255,255,255,.9)", { marginTop: 6 })}>Entró {soles(ingresos)} · Salió {soles(egresos)}{lista ? ` · ${lista.length} movimiento${lista.length === 1 ? "" : "s"}` : ""}</Text>
      </TealGradient>
      <Cuerpo ancho={ANCHO.lista - 36} style={{ padding: 18, gap: 14 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PRESETS.map((p) => <Chip key={p.id} label={p.label} active={preset === p.id} onPress={() => (setPreset(p.id), p.id !== "otro" && setRango(rangoPreset(p.id, today())))} />)}
        </ScrollView>
        {preset === "otro" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><DateField value={rango.desde} onChange={(v) => setRango({ ...rango, desde: v })} /></View>
            <View style={{ flex: 1 }}><DateField value={rango.hasta} onChange={(v) => setRango({ ...rango, hasta: v })} /></View>
          </View>
        ) : null}
        {errRango ? <Franja tono="error" texto={errRango} /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {([["", "Todo"], ["INGRESO", "Ingresos"], ["EGRESO", "Egresos"]] as const).map(([k, l]) => <Chip key={l} label={l} active={tipo === k} onPress={() => setTipo(k)} />)}
          <View style={{ width: 8 }} />
          {([["", "Ambos"], ["EFECTIVO", "Efectivo"], ["DIGITAL", "Digital"]] as const).map(([k, l]) => <Chip key={l} label={l} active={medio === k} onPress={() => setMedio(k)} />)}
        </View>
        <TextField value={q} onChangeText={setQ} placeholder="Buscar: descripción, persona, n.º de operación…" />
        <Pressable onPress={() => setAnulados(!anulados)} style={{ alignSelf: "flex-start" }}>
          <Text style={t(12, 700, C.teal)}>{anulados ? "✓ Mostrando anulados" : "Mostrar también los anulados"}</Text>
        </Pressable>
        {error ? <Franja tono="error" texto={error} /> : null}
        {!lista && !error ? <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} /> : null}
        {lista && !lista.length ? <Franja texto="No hay movimientos con esos filtros." /> : null}
        {dias.map(([fecha, movs]) => (
          <View key={fecha} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={kicker(C.ink, 11)}>{fdateLarga(fecha).toUpperCase()}</Text>
              <Text style={t(11.5, 600, C.muted)}>+{soles(sumar(movs.filter((m) => !m.anulado && m.tipo === "INGRESO")))} · −{soles(sumar(movs.filter((m) => !m.anulado && m.tipo === "EGRESO")))}</Text>
            </View>
            {movs.map((m) => <MovFila key={m.id} m={m} onPress={() => onVer(m)} />)}
          </View>
        ))}
      </Cuerpo>
    </ScrollView>
  );
}
