import { Pressable, Text, View } from "react-native";
import { C, t } from "../theme";
import { Etiqueta } from "./fin";
import { resumenMov } from "../lib/fin/calc";
import { catLabel } from "../lib/fin/categorias";
import { money } from "../lib/format";
import { errorDe, sinEnviar, type State } from "../lib/fin/store";
import type { Mov } from "../lib/fin/types";

/** Una fila del libro: ícono, qué fue, de qué cuenta, y el monto con su signo según la cuenta que se está mirando (o sin signo). */
export function MovFila({ m, caja, primero, onPress, cuentaVista }: { m: Mov; caja: State; primero: boolean; onPress: () => void; cuentaVista?: string }) {
  const nombre = (id: string) => caja.cuentas.find((c) => c.id === id)?.nombre ?? "—";
  const esTraspaso = m.tipo === "TRASPASO";
  // con una cuenta elegida, el traspaso se ve como entrada o salida de esa cuenta
  const entra = m.tipo === "INGRESO" || (esTraspaso && !!cuentaVista && m.destino_id === cuentaVista);
  const error = errorDe(caja, m.id);
  const detalle = [
    esTraspaso ? `${nombre(m.cuenta_id)} → ${nombre(m.destino_id)}` : nombre(m.cuenta_id),
    m.tipo !== "TRASPASO" && m.categoria ? catLabel(m.categoria, m.subcategoria) : null,
    m.hora || null,
    m.adjuntos.length ? `${m.adjuntos.length} ${m.adjuntos.length === 1 ? "foto" : "fotos"}` : null,
  ].filter(Boolean).join(" · ");
  const col = esTraspaso && !cuentaVista ? C.navy : entra ? C.teal : C.red;
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${resumenMov(m)}, ${money(m.monto)}`} style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 13, paddingHorizontal: 14, borderTopWidth: primero ? 0 : 1, borderTopColor: C.stripeA, backgroundColor: error ? "#FDF3F3" : pressed ? C.bg : C.card })}>
      <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: esTraspaso ? C.stripeB : entra ? C.tint : C.outIcon }}>
        <Text style={t(17, 800, esTraspaso ? C.muted : entra ? C.teal : C.navy)}>{esTraspaso ? "⇄" : entra ? "+" : "−"}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={2} style={t(13, 700)}>{resumenMov(m)}</Text>
        <Text numberOfLines={1} style={t(11.5, 400, C.muted)}>{detalle}</Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {error ? <Etiqueta texto="NO SE GUARDÓ" tono="error" /> : sinEnviar(caja, m.id) ? <Etiqueta texto="SIN ENVIAR" tono="info" /> : null}
        </View>
        {error ? <Text style={t(11, 600, C.red, { lineHeight: 15 })}>{error}</Text> : null}
      </View>
      <Text style={t(13.5, 800, col, { fontVariant: ["tabular-nums"] })}>{esTraspaso && !cuentaVista ? "" : entra ? "+" : "−"}{money(m.monto)}</Text>
    </Pressable>
  );
}
