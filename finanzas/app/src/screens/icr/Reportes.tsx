/** Reportes de la Caja ICR: un período → efectivo y digital (inicio, entró, salió, final), ventas, fondos, gastos, depósitos y por categoría. Excel. */
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { C, card, kicker, t } from "../../theme";
import { Chip, Cuerpo, DateField, PrimaryButton, TealGradient } from "../../components/ui";
import { Franja, Seccion } from "../../components/icr";
import { ANCHO } from "../../lib/layout";
import { today } from "../../lib/format";
import { PRESETS, errorDeRango, rangoPreset, type Preset } from "../../lib/reportes/periodo";
import { descargar } from "../../lib/reportes/descarga";
import * as icr from "../../lib/icr/api";
import { esNegativo, soles } from "../../lib/icr/dinero";
import { generarXlsx } from "../../lib/icr/xlsx";
import type { Grupo, Reporte } from "../../lib/icr/tipos";

function Barras({ grupos }: { grupos: Grupo[] }) {
  const max = Math.max(1, ...grupos.map((g) => Number(g.monto)));
  return (
    <View style={[card(16), { padding: 14, gap: 10 }]}>
      {grupos.slice(0, 12).map((g) => (
        <View key={g.clave} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <Text style={t(12.5, 600, C.ink, { flexShrink: 1 })} numberOfLines={1}>{g.clave}</Text>
            <Text style={t(12.5, 800)}>{soles(g.monto)}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: C.stripeA }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: C.teal, width: `${Math.max(2, (Number(g.monto) / max) * 100)}%` }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Reportes({ version, nombre, topInset }: { version: number; nombre: string; topInset: number }) {
  const [preset, setPreset] = useState<Preset>("mes");
  const [rango, setRango] = useState(() => rangoPreset("mes", today()));
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const errRango = errorDeRango(rango.desde, rango.hasta);
  useEffect(() => {
    if (errRango) return;
    let vivo = true;
    setR(null);
    setError(null);
    icr.reportes(rango.desde, rango.hasta).then((x) => vivo && setR(x)).catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."));
    return () => {
      vivo = false;
    };
  }, [rango.desde, rango.hasta, version, errRango]);

  const excel = async () => {
    if (!r) return;
    setExportando(true);
    try {
      descargar(await generarXlsx(r, nombre), `caja-icr_${r.desde}_${r.hasta}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  };
  const medio = (l: string, x: Reporte["efectivo"]) => (
    <View style={[card(16), { flex: 1, minWidth: 150, padding: 14, gap: 6 }]}>
      <Text style={kicker(C.muted, 10)}>{l}</Text>
      {([["Al inicio", x.saldo_inicial], ["Entró", x.ingresos], ["Salió", x.egresos]] as const).map(([a, v]) => (
        <View key={a} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={t(12.5, 500, C.muted)}>{a}</Text><Text style={t(12.5, 700)}>{soles(v)}</Text></View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 }}><Text style={t(13, 800)}>Al final</Text><Text style={t(14, 800, esNegativo(x.saldo_final) ? C.red : C.ink)}>{soles(x.saldo_final)}</Text></View>
    </View>
  );
  const dato = (l: string, v: string, sub?: string) => (
    <View style={[card(14), { flex: 1, minWidth: 140, padding: 12, gap: 4 }]}>
      <Text style={t(11.5, 600, C.muted)}>{l}</Text>
      <Text style={t(17, 800)}>{v}</Text>
      {sub ? <Text style={t(11, 500, C.muted)}>{sub}</Text> : null}
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 30 }}>
      <TealGradient ancho={ANCHO.lista} style={{ paddingTop: 22 + topInset, paddingHorizontal: 18, paddingBottom: 18 }}>
        <Text style={kicker("rgba(255,255,255,.9)")}>CAJA ICR</Text>
        <Text style={t(24, 800, C.white, { marginTop: 4 })}>Reportes</Text>
        <Text style={t(12, 500, "rgba(255,255,255,.9)", { marginTop: 6 })}>Totales calculados por el servidor, al céntimo.</Text>
      </TealGradient>
      <Cuerpo ancho={ANCHO.lista - 36} style={{ padding: 18, gap: 16 }}>
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
        {error ? <Franja tono="error" texto={error} /> : null}
        {!r && !error && !errRango ? <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} /> : null}
        {r ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{medio("EFECTIVO", r.efectivo)}{medio("DIGITAL", r.digital)}</View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {dato("Ventas", soles(r.ventas))}
              {dato("Fondos del ERP", soles(r.fondos))}
              {dato("Gastos", soles(r.gastos), `Físicos ${soles(r.gastos_fisicos)} · Digitales ${soles(r.gastos_digitales)}`)}
              {dato("Depósitos a cta. principal", soles(r.depositos))}
            </View>
            {r.sin_foto ? <Franja tono="alerta" texto={`${r.sin_foto} gasto${r.sin_foto === 1 ? "" : "s"} físico${r.sin_foto === 1 ? "" : "s"} sin foto del recibo en este período.`} /> : null}
            {r.por_categoria.length ? <Seccion titulo="GASTOS POR CATEGORÍA"><Barras grupos={r.por_categoria} /></Seccion> : <Franja texto="No hay gastos en este período." />}
            {r.por_persona.some((g) => g.clave !== "Sin dato") ? <Seccion titulo="GASTOS POR PERSONA"><Barras grupos={r.por_persona} /></Seccion> : null}
            {r.por_proyecto.length ? <Seccion titulo="GASTOS POR PROYECTO"><Barras grupos={r.por_proyecto} /></Seccion> : null}
            {Platform.OS === "web" ? (exportando ? <ActivityIndicator color={C.teal} /> : <PrimaryButton label="DESCARGAR EXCEL" onPress={() => void excel()} />) : null}
          </>
        ) : null}
      </Cuerpo>
    </ScrollView>
  );
}
