/** Inicio de la Caja ICR: los dos saldos (efectivo y digital), lo de hoy, los botones para registrar y los últimos movimientos. */
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { C, card, kicker, raisedCard, t } from "../../theme";
import { Cuerpo, LiveDot, TealGradient } from "../../components/ui";
import { Franja, MovFila, Seccion } from "../../components/icr";
import { ANCHO } from "../../lib/layout";
import { fdateLarga } from "../../lib/format";
import { esNegativo, soles } from "../../lib/icr/dinero";
import type { Mov, Resumen } from "../../lib/icr/tipos";

export type Accion = "gasto" | "digital" | "venta" | "ajuste";

export function Inicio({ datos, error, cargando, recargar, escribir, esAdmin, nombre, onAccion, onVer, onSalir, topInset }: {
  datos: Resumen | null; error: string | null; cargando: boolean; recargar: () => void; escribir: boolean; esAdmin: boolean; nombre: string;
  onAccion: (a: Accion) => void; onVer: (m: Mov) => void; onSalir?: () => void; topInset: number;
}) {
  const s = datos?.saldos;
  const saldo = (l: string, v: string | undefined, sub: string) => (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,.14)" }}>
      <Text style={kicker("rgba(255,255,255,.85)", 10)}>{l}</Text>
      <Text style={t(22, 800, esNegativo(v) ? "#FFD0D0" : C.white, { marginTop: 6 })} numberOfLines={1} adjustsFontSizeToFit>{v ? soles(v) : "—"}</Text>
      <Text style={t(11, 500, "rgba(255,255,255,.8)", { marginTop: 3 })}>{sub}</Text>
    </View>
  );
  const boton = (a: Accion, titulo: string, sub: string, color: string) => (
    <Pressable key={a} onPress={() => onAccion(a)} style={({ pressed }) => [raisedCard(18), { flex: 1, minWidth: 150, padding: 16, gap: 6, borderWidth: 1, borderColor: C.line }, pressed && { backgroundColor: C.bg }]}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color === C.teal ? C.tint : C.outIcon }}>
        <Text style={t(18, 800, color)}>{a === "venta" ? "↓" : a === "digital" ? "▣" : "↑"}</Text>
      </View>
      <Text style={t(14.5, 800)}>{titulo}</Text>
      <Text style={t(11.5, 400, C.muted, { lineHeight: 16 })}>{sub}</Text>
    </Pressable>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={cargando && !!datos} onRefresh={recargar} tintColor={C.teal} />}>
      <TealGradient ancho={ANCHO.panel} style={{ paddingTop: 22 + topInset, paddingHorizontal: 18, paddingBottom: 22 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <LiveDot />
            <Text style={kicker("rgba(255,255,255,.9)")}>CAJA ICR · {datos ? fdateLarga(datos.fecha).toUpperCase() : ""}</Text>
          </View>
          {onSalir ? <Pressable onPress={onSalir} hitSlop={8}><Text style={t(11.5, 800, C.white)}>Salir</Text></Pressable> : null}
        </View>
        <Text style={t(24, 800, C.white, { marginTop: 8 })}>Hola, {nombre.split(" ")[0]}</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {saldo("EFECTIVO", s?.efectivo, "Gastos físicos y ventas")}
          {saldo("DIGITAL", s?.digital, "Yape y transferencias")}
        </View>
        {s ? <Text style={t(12, 600, "rgba(255,255,255,.9)", { marginTop: 10 })}>Total de la caja: <Text style={t(12, 800, C.white)}>{soles(s.total)}</Text>{datos ? `  ·  Hoy entró ${soles(datos.hoy.ingresos)} y salió ${soles(datos.hoy.egresos)}` : ""}</Text> : null}
      </TealGradient>
      <Cuerpo ancho={ANCHO.panel - 36} style={{ padding: 18, gap: 20 }}>
        {error ? <Franja tono="error" texto={error} /> : null}
        {!datos && cargando ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : null}
        {escribir ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {boton("gasto", "Gasto físico", "En efectivo, con la foto del recibo", C.navy)}
            {boton("digital", "Gasto digital", "Yape o transferencia: sube las capturas", C.navy)}
            {boton("venta", "Venta / ingreso", "Lo que entra: efectivo o digital", C.teal)}
          </View>
        ) : <Franja texto="Tu rol puede ver la caja, pero no registrar." />}
        {esAdmin ? (
          <Pressable onPress={() => onAccion("ajuste")} style={{ alignSelf: "flex-start" }}>
            <Text style={t(12.5, 800, C.teal)}>Ajustar saldo (saldo inicial o cuadre) · solo Administrador</Text>
          </Pressable>
        ) : null}
        {datos?.hoy.sin_foto ? <Franja tono="alerta" texto={`${datos.hoy.sin_foto} gasto${datos.hoy.sin_foto === 1 ? "" : "s"} físico${datos.hoy.sin_foto === 1 ? "" : "s"} de hoy sin foto del recibo. Ábrelo en el historial para agregarla.`} /> : null}
        {datos ? (
          <Seccion titulo="ÚLTIMOS MOVIMIENTOS">
            {datos.recientes.length ? datos.recientes.map((m) => <MovFila key={m.id} m={m} conFecha onPress={() => onVer(m)} />) : (
              <View style={[card(16), { padding: 18 }]}><Text style={t(13, 500, C.muted)}>Todavía no hay movimientos en la Caja ICR.</Text></View>
            )}
          </Seccion>
        ) : null}
      </Cuerpo>
    </ScrollView>
  );
}
