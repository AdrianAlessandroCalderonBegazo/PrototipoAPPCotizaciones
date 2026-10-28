import { ScrollView, Text, View } from "react-native";
import { Sheet } from "../components/Overlays";
import { FotosSoloLectura } from "../components/caja";
import { SecondaryButton } from "../components/ui";
import { C, card, kicker, t } from "../theme";
import { catLabel } from "../lib/data";
import { fdateLarga, money } from "../lib/format";
import { COMPROBANTE_LABEL, TIPO_FILA_LABEL, type Fila } from "../lib/caja/types";

/** Detalle de un movimiento para verlo sin poder cambiarlo (día cerrado o anterior): datos e imágenes de los recibos. */
export function DetalleFila({ fila, fecha, onClose, bottomInset }: { fila: Fila; fecha: string; onClose: () => void; bottomInset: number }) {
  const ing = fila.caja_ingreso_efectivo + fila.caja_ingreso_transf + fila.cta_cte_ingreso;
  const sal = fila.caja_salida_efectivo + fila.caja_salida_transf + fila.cta_cte_salida;
  const importes: [string, number][] = [
    ["Ingreso · efectivo", fila.caja_ingreso_efectivo], ["Ingreso · Yape/transf.", fila.caja_ingreso_transf], ["Salida · efectivo", fila.caja_salida_efectivo],
    ["Salida · Yape/transf.", fila.caja_salida_transf], ["Cta. cte. · ingreso", fila.cta_cte_ingreso], ["Cta. cte. · salida", fila.cta_cte_salida],
  ];
  const datos: [string, string][] = [
    ["Descripción", fila.descripcion], ["Fecha", fdateLarga(fecha)], ["Tipo", TIPO_FILA_LABEL[fila.tipo]], ["Responsable", fila.responsable || "—"],
    ["Comprobante", COMPROBANTE_LABEL[fila.comprobante]],
    ...(fila.categoria ? ([["Categoría", catLabel(fila.categoria, fila.subcategoria)]] as [string, string][]) : []),
    ...(fila.interno ? ([["Movimiento interno", "Sí (depósito, retiro o traspaso)"]] as [string, string][]) : []),
    ...importes.filter(([, v]) => v > 0).map(([k, v]) => [k, money(v)] as [string, string]),
  ];
  return (
    <Sheet onClose={onClose} bottomInset={bottomInset}>
      <Text style={kicker(C.muted, 10.5)}>MOVIMIENTO · SOLO LECTURA</Text>
      <Text style={t(28, 800, ing > 0 && sal === 0 ? C.teal : C.red, { marginTop: 6, marginBottom: 12, fontVariant: ["tabular-nums"] })}>
        {ing > 0 && sal === 0 ? "+" : sal > 0 && ing === 0 ? "−" : "±"}{money(Math.max(ing, sal))}
      </Text>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
        <View style={[card(14), { overflow: "hidden" }]}>
          {datos.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, padding: 11, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.stripeA }}>
              <Text style={t(12.5, 400, C.muted)}>{k}</Text>
              <Text style={t(12.5, 700, C.ink, { textAlign: "right", flexShrink: 1 })}>{v}</Text>
            </View>
          ))}
        </View>
        {fila.adjuntos.length ? (
          <View style={{ gap: 8 }}>
            <Text style={kicker(C.muted, 10.5)}>RECIBOS ADJUNTOS</Text>
            <FotosSoloLectura adjuntos={fila.adjuntos} />
          </View>
        ) : (
          <Text style={t(12, 400, C.muted)}>Sin fotos de recibo.</Text>
        )}
      </ScrollView>
      <View style={{ marginTop: 14 }}>
        <SecondaryButton label="Cerrar" onPress={onClose} />
      </View>
    </Sheet>
  );
}
